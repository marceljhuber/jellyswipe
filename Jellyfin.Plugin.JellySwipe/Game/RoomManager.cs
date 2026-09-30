using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellySwipe.Game;

/// <summary>
/// In-memory lobbies. A room is a lobby + a shared deck; every change is pushed to the
/// room's Server-Sent-Event listeners as a per-player view.
/// </summary>
public sealed class RoomManager : IDisposable
{
    private static readonly string[] Colors = ["#fd267a", "#ff7854", "#21d07c", "#1ec0ff", "#a26bfa", "#f5b748", "#ff4d6d", "#00c2a8"];
    private static readonly HashSet<string> LikeChoices = ["like", "super"];
    private static readonly TimeSpan RoomTtl = TimeSpan.FromHours(6);

    private readonly ConcurrentDictionary<string, Room> _rooms = new();
    private readonly LibraryService _library;
    private readonly ILogger<RoomManager> _logger;
    private readonly Timer _cleanup;

    public RoomManager(LibraryService library, ILogger<RoomManager> logger)
    {
        _library = library;
        _logger = logger;
        _cleanup = new Timer(_ => Cleanup(), null, TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(10));
    }

    private static Configuration.PluginConfiguration Config => Plugin.Instance?.Configuration ?? new Configuration.PluginConfiguration();

    // ---------------------------------------------------------------- lookup

    internal Room Get(string code)
    {
        if (!_rooms.TryGetValue(code, out var room))
        {
            throw new GameException(404, "Lobby not found");
        }

        room.LastActive = DateTime.UtcNow;
        return room;
    }

    internal static Player BySecret(Room room, string? secret) =>
        room.Players.FirstOrDefault(p => secret is not null && p.Secret == secret)
        ?? throw new GameException(403, "You are not in this lobby");

    internal Player Authenticate(string code, string? secret, out Room room)
    {
        room = Get(code);
        lock (room.Sync)
        {
            return BySecret(room, secret);
        }
    }

    private static string CleanName(string? name)
    {
        var n = string.Join(' ', (name ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (n.Length > 20)
        {
            n = n[..20];
        }

        return n.Length > 0 ? n : $"Player {RandomNumberGenerator.GetInt32(10, 100)}";
    }

    private static Player AddPlayer(Room room, string? name)
    {
        var player = new Player
        {
            Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant(),
            Secret = Guid.NewGuid().ToString(),
            Name = CleanName(name),
            Color = Colors[room.Players.Count % Colors.Length],
        };
        room.Players.Add(player);
        return player;
    }

    // ---------------------------------------------------------------- lifecycle

    public JoinResponse Create(Guid hostUserId, string? name, GameSettings settings)
    {
        if (settings.LibraryIds.Length == 0)
        {
            throw new GameException(400, "Pick at least one library");
        }

        settings.Goal = settings.Goal is 1 or 3 or 5 ? settings.Goal : 3;
        settings.LibraryNames = settings.LibraryNames.Take(20).ToArray();
        settings.GenreNames = settings.GenreNames.Take(30).ToArray();
        if (settings.AutoPlay is { } ap && string.IsNullOrEmpty(ap.DeviceId))
        {
            settings.AutoPlay = null;
        }

        for (var attempt = 0; attempt < 1000; attempt++)
        {
            var code = RandomNumberGenerator.GetInt32(1000, 10000).ToString(System.Globalization.CultureInfo.InvariantCulture);
            var room = new Room { Code = code, HostUserId = hostUserId, Settings = settings };
            var host = AddPlayer(room, name);
            room.HostId = host.Id;
            if (_rooms.TryAdd(code, room))
            {
                return new JoinResponse(code, host.Secret, host.Id);
            }
        }

        throw new GameException(503, "No free lobby codes");
    }

    public JoinResponse Join(string code, string? name, string? secret)
    {
        var room = Get(code);
        lock (room.Sync)
        {
            var existing = room.Players.FirstOrDefault(p => secret is not null && p.Secret == secret);
            if (existing is not null)
            {
                return new JoinResponse(room.Code, existing.Secret, existing.Id);
            }

            if (room.Status != "lobby")
            {
                throw new GameException(409, "This game already started");
            }

            if (room.Players.Count >= 12)
            {
                throw new GameException(409, "Lobby is full");
            }

            var p = AddPlayer(room, name);
            Broadcast(room);
            return new JoinResponse(room.Code, p.Secret, p.Id);
        }
    }

    public void Leave(string code, string? secret)
    {
        var player = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            RemovePlayer(room, player);
        }
    }

    private void RemovePlayer(Room room, Player player)
    {
        room.Players.Remove(player);
        foreach (var votes in room.Swipes.Values)
        {
            votes.Remove(player.Id);
        }

        if (room.Players.Count == 0)
        {
            Close(room);
            return;
        }

        if (room.HostId == player.Id)
        {
            room.HostId = room.Players[0].Id;
        }

        if (room.Status == "playing")
        {
            Reevaluate(room);
            CheckEnd(room);
        }

        Broadcast(room);
    }

    public void Kick(string code, string? secret, string? targetId)
    {
        var host = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            if (host.Id != room.HostId)
            {
                throw new GameException(403, "Only the host can remove players");
            }

            var target = room.Players.FirstOrDefault(p => p.Id == targetId);
            if (target is null || target.Id == host.Id)
            {
                throw new GameException(400, "Cannot remove that player");
            }

            SendTo(room, target.Id, "kicked", "{}");
            RemovePlayer(room, target);
        }
    }

    public void Start(string code, string? secret)
    {
        var player = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            if (player.Id != room.HostId)
            {
                throw new GameException(403, "Only the host can start");
            }

            if (room.Status == "playing")
            {
                throw new GameException(409, "Already playing");
            }
        }

        // Building the deck hits the library; do it outside the lock.
        var deck = _library.BuildDeck(_library.GetUser(room.HostUserId), room.Settings, Math.Clamp(Config.MaxDeckSize, 20, 2000));
        if (deck.Count == 0)
        {
            throw new GameException(422, "No titles match these filters");
        }

        lock (room.Sync)
        {
            room.Deck = deck;
            room.DeckIndex = deck.Select((d, i) => (d.Id, i)).ToDictionary(x => x.Id, x => x.i);
            room.Swipes = [];
            room.Matches = [];
            room.Results = null;
            room.Mode = room.Players.Count > 1 ? "multi" : "solo";
            foreach (var p in room.Players)
            {
                p.Position = 0;
                p.History.Clear();
                p.Order = Shuffled(deck.Count);
                p.OrderIndex = p.Order.Select((deckIdx, pos) => (deck[deckIdx].Id, pos)).ToDictionary(x => x.Id, x => x.pos);
            }

            CancelAutoPlayLocked(room);
            room.AutoPlay = null;
            room.Round++;
            room.Status = "playing";
            Broadcast(room);
        }
    }

    public void BackToLobby(string code, string? secret)
    {
        var player = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            if (player.Id != room.HostId)
            {
                throw new GameException(403, "Only the host can restart");
            }

            CancelAutoPlayLocked(room);
            room.AutoPlay = null;
            room.Status = "lobby";
            room.Deck = [];
            room.Matches = [];
            room.Results = null;
            Broadcast(room);
        }
    }

    // ---------------------------------------------------------------- swiping

    private static List<string> LikersOf(Room room, string itemId) =>
        room.Swipes.TryGetValue(itemId, out var votes)
            ? votes.Where(v => LikeChoices.Contains(v.Value)).Select(v => v.Key).ToList()
            : [];

    private static bool IsMatch(Room room, string itemId)
    {
        if (room.Mode == "solo")
        {
            return false;
        }

        var likers = LikersOf(room, itemId).Count;
        return likers >= 2 && likers == room.Players.Count;
    }

    private static void Reevaluate(Room room)
    {
        foreach (var itemId in room.Swipes.Keys)
        {
            if (!room.Matches.Contains(itemId) && IsMatch(room, itemId))
            {
                room.Matches.Add(itemId);
            }
        }
    }

    private static List<string> SoloPicks(Player p) => p.History.Where(h => LikeChoices.Contains(h.Choice)).Select(h => h.ItemId).ToList();

    /// <summary>Winner order: most super-likes, then earliest match (solo: earliest pick).</summary>
    private static List<string> Ranked(Room room)
    {
        var ids = room.Mode == "solo" ? room.Results?.Picks ?? [] : room.Matches;
        return ids
            .Select((id, i) => (id, i, supers: room.Swipes.TryGetValue(id, out var v) ? v.Values.Count(c => c == "super") : 0))
            .OrderByDescending(x => x.supers)
            .ThenBy(x => x.i)
            .Select(x => x.id)
            .ToList();
    }

    private void CheckEnd(Room room)
    {
        if (room.Status != "playing")
        {
            return;
        }

        var reached = room.Mode == "solo"
            ? SoloPicks(room.Players[0]).Count >= room.Settings.Goal
            : room.Matches.Count >= room.Settings.Goal;
        var exhausted = room.Players.All(p => p.Position >= room.Deck.Count);
        if (!reached && !exhausted)
        {
            return;
        }

        room.Status = "finished";
        var reason = reached ? "goal" : "exhausted";
        if (room.Mode == "solo")
        {
            room.Results = new Results { Reason = reason, Picks = SoloPicks(room.Players[0]) };
        }
        else
        {
            // Closest calls: the most-liked non-matches, for when the deck ran dry first.
            var close = room.Swipes.Keys
                .Where(id => !room.Matches.Contains(id))
                .Select(id => (id, likes: LikersOf(room, id).Count))
                .Where(x => x.likes > 0)
                .OrderByDescending(x => x.likes)
                .Take(6)
                .Select(x => x.id)
                .ToList();
            room.Results = new Results { Reason = reason, Close = close };
        }

        var winner = Ranked(room).FirstOrDefault();
        if (reached && winner is not null && room.Settings.AutoPlay is not null)
        {
            ScheduleAutoPlay(room, winner);
        }
    }

    public bool Swipe(string code, string? secret, string? itemId, string? choice)
    {
        var player = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            if (room.Status != "playing")
            {
                throw new GameException(409, "Game is not running");
            }

            if (choice is not ("like" or "nope" or "super"))
            {
                throw new GameException(400, "Bad choice");
            }

            if (itemId is null || !player.OrderIndex.TryGetValue(itemId, out var idx))
            {
                throw new GameException(400, "Unknown title");
            }

            if (!room.Swipes.TryGetValue(itemId, out var votes))
            {
                votes = [];
                room.Swipes[itemId] = votes;
            }

            if (!votes.ContainsKey(player.Id))
            {
                player.History.Add(new Swipe(itemId, choice));
            }

            votes[player.Id] = choice;
            player.Position = Math.Max(player.Position, idx + 1);
            var matched = false;
            if (!room.Matches.Contains(itemId) && IsMatch(room, itemId))
            {
                room.Matches.Add(itemId);
                matched = true;
            }

            CheckEnd(room);
            Broadcast(room);
            return matched;
        }
    }

    public string Undo(string code, string? secret)
    {
        var player = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            if (room.Status != "playing")
            {
                throw new GameException(409, "Game is not running");
            }

            var last = player.History.LastOrDefault() ?? throw new GameException(409, "Nothing to undo");
            if (room.Matches.Contains(last.ItemId))
            {
                throw new GameException(409, "Already a match — no take-backs!");
            }

            player.History.RemoveAt(player.History.Count - 1);
            if (room.Swipes.TryGetValue(last.ItemId, out var votes))
            {
                votes.Remove(player.Id);
            }

            player.Position = player.OrderIndex[last.ItemId];
            Broadcast(room);
            return last.ItemId;
        }
    }

    // ---------------------------------------------------------------- playback

    internal Guid HostUserFor(string code, string? secret, out Room room)
    {
        Authenticate(code, secret, out room);
        return room.HostUserId;
    }

    public async Task PlayAsync(string code, string? secret, string? itemId, string? sessionId, CancellationToken ct)
    {
        var hostUserId = HostUserFor(code, secret, out var room);
        lock (room.Sync)
        {
            var allowed = room.Matches.Concat(room.Results?.Picks ?? []).Concat(room.Results?.Close ?? []);
            if (itemId is null || !allowed.Contains(itemId))
            {
                throw new GameException(400, "Only results can be played");
            }
        }

        await _library.PlayAsync(_library.GetUser(hostUserId), sessionId ?? string.Empty, itemId, ct).ConfigureAwait(false);
    }

    private void ScheduleAutoPlay(Room room, string itemId)
    {
        var delay = TimeSpan.FromSeconds(Math.Clamp(Config.AutoPlayDelaySeconds, 3, 60));
        var target = room.Settings.AutoPlay!;
        room.AutoPlay = new AutoPlayState
        {
            ItemId = itemId,
            At = DateTimeOffset.UtcNow.Add(delay).ToUnixTimeMilliseconds(),
            DeviceName = target.DeviceName,
        };
        var cts = new CancellationTokenSource();
        room.AutoPlayCts = cts;
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(delay, cts.Token).ConfigureAwait(false);
                string status = "playing";
                string? error = null;
                try
                {
                    await _library.PlayOnDeviceAsync(_library.GetUser(room.HostUserId), target.DeviceId, itemId, CancellationToken.None).ConfigureAwait(false);
                }
                catch (Exception e)
                {
                    _logger.LogWarning(e, "JellySwipe auto-play failed");
                    status = "failed";
                    error = e.Message;
                }

                lock (room.Sync)
                {
                    if (room.AutoPlay is { } state && ReferenceEquals(room.AutoPlayCts, cts))
                    {
                        state.Status = status;
                        state.Error = error;
                        Broadcast(room);
                    }
                }
            }
            catch (TaskCanceledException)
            {
                // Cancelled by a player or a new round.
            }
        });
    }

    private static void CancelAutoPlayLocked(Room room)
    {
        room.AutoPlayCts?.Cancel();
        room.AutoPlayCts = null;
        if (room.AutoPlay is { Status: "pending" } state)
        {
            state.Status = "cancelled";
        }
    }

    public void CancelAutoPlay(string code, string? secret)
    {
        Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            CancelAutoPlayLocked(room);
            Broadcast(room);
        }
    }

    // ---------------------------------------------------------------- views & events

    /// <summary>Returns the deck in this player's own order.</summary>
    public IReadOnlyList<DeckItem> Deck(string code, string? secret)
    {
        var player = Authenticate(code, secret, out var room);
        lock (room.Sync)
        {
            return player.Order.Length == room.Deck.Count ? player.Order.Select(i => room.Deck[i]).ToList() : room.Deck;
        }
    }

    private static int[] Shuffled(int count)
    {
        var order = Enumerable.Range(0, count).ToArray();
        for (var i = order.Length - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }

        return order;
    }

    public object Summary(string code)
    {
        var room = Get(code);
        lock (room.Sync)
        {
            return new { code = room.Code, status = room.Status, players = room.Players.Count, autoPlay = room.AutoPlay?.Status };
        }
    }

    private static RoomView View(Room room, Player? player)
    {
        ResultItem WithLikers(string id)
        {
            var item = room.Deck[room.DeckIndex[id]];
            var votes = room.Swipes.GetValueOrDefault(id) ?? [];
            return new ResultItem
            {
                Id = item.Id,
                Name = item.Name,
                Type = item.Type,
                Year = item.Year,
                Overview = item.Overview,
                Genres = item.Genres,
                Rating = item.Rating,
                Critic = item.Critic,
                Official = item.Official,
                Runtime = item.Runtime,
                Seasons = item.Seasons,
                Images = item.Images,
                LikedBy = votes.Where(v => LikeChoices.Contains(v.Value)).Select(v => v.Key).ToArray(),
                SuperBy = votes.Where(v => v.Value == "super").Select(v => v.Key).ToArray(),
            };
        }

        var players = room.Players.Select(p => new PlayerView(
            p.Id, p.Name, p.Color, p.Id == room.HostId, p.Connections > 0, p.Position, p.History.Count(h => LikeChoices.Contains(h.Choice)))).ToList();

        ResultsView? results = room.Results is null
            ? null
            : new ResultsView(room.Results.Reason, room.Results.Picks.Select(WithLikers).ToList(), room.Results.Close.Select(WithLikers).ToList(), Ranked(room));

        AutoPlayView? autoPlay = room.AutoPlay is { } ap
            ? new AutoPlayView(ap.ItemId, ap.DeviceName, ap.Status, ap.Error, Math.Max(0, ap.At - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()))
            : null;

        YouView? you = player is null
            ? null
            : new YouView(
                player.Id,
                player.Id == room.HostId,
                player.Position,
                room.Status == "playing" && player.History.Count > 0 && !room.Matches.Contains(player.History[^1].ItemId),
                room.Mode == "solo" ? SoloPicks(player).Count : null);

        return new RoomView(room.Seq, room.Round, room.Code, room.Status, room.Mode, room.Settings, room.Deck.Count, players, room.Matches.Select(WithLikers).ToList(), results, autoPlay, you);
    }

    private static string Event(string name, string json) => $"event: {name}\ndata: {json}\n\n";

    private static void Broadcast(Room room)
    {
        room.Seq++;
        foreach (var l in room.Listeners)
        {
            var player = room.Players.FirstOrDefault(p => p.Id == l.PlayerId);
            l.Channel.Writer.TryWrite(Event("state", JsonSerializer.Serialize(View(room, player), GameJsonContext.Default.RoomView)));
        }
    }

    private static void SendTo(Room room, string playerId, string evt, string json)
    {
        foreach (var l in room.Listeners.Where(l => l.PlayerId == playerId))
        {
            l.Channel.Writer.TryWrite(Event(evt, json));
        }
    }

    internal Listener Subscribe(string code, string? secret, out Room room)
    {
        var player = Authenticate(code, secret, out room);
        lock (room.Sync)
        {
            var listener = new Listener { PlayerId = player.Id };
            room.Listeners.Add(listener);
            player.Connections++;
            Broadcast(room);
            return listener;
        }
    }

    internal void Unsubscribe(Room room, Listener listener)
    {
        lock (room.Sync)
        {
            room.Listeners.Remove(listener);
            var player = room.Players.FirstOrDefault(p => p.Id == listener.PlayerId);
            if (player is not null)
            {
                player.Connections = Math.Max(0, player.Connections - 1);
            }

            if (_rooms.ContainsKey(room.Code))
            {
                Broadcast(room);
            }
        }
    }

    private void Close(Room room)
    {
        room.AutoPlayCts?.Cancel();
        foreach (var l in room.Listeners)
        {
            l.Channel.Writer.TryWrite(Event("closed", "{}"));
            l.Channel.Writer.TryComplete();
        }

        _rooms.TryRemove(room.Code, out _);
    }

    private void Cleanup()
    {
        foreach (var room in _rooms.Values.Where(r => DateTime.UtcNow - r.LastActive > RoomTtl).ToList())
        {
            lock (room.Sync)
            {
                Close(room);
            }
        }
    }

    public void Dispose() => _cleanup.Dispose();
}
