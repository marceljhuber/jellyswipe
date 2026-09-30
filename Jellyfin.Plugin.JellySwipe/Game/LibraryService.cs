using System.Security.Cryptography;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Library;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellySwipe.Game;

/// <summary>Everything JellySwipe needs from Jellyfin: libraries, genres, the deck, devices and playback.</summary>
public sealed class LibraryService(
    ILibraryManager libraryManager,
    IUserViewManager userViewManager,
    IUserManager userManager,
    ISessionManager sessionManager,
    ILogger<LibraryService> logger)
{
    private static readonly HashSet<CollectionType?> SupportedCollections =
        [CollectionType.movies, CollectionType.tvshows, CollectionType.boxsets, CollectionType.homevideos, null];

    private static readonly BaseItemKind[] SwipeKinds = [BaseItemKind.Movie, BaseItemKind.Series];

    /// <summary>The user anonymous hosts act as: the configured one, else the first administrator.</summary>
    public User? DefaultHost(string? configuredId)
    {
        if (Guid.TryParse(configuredId, out var id) && userManager.GetUserById(id) is { } configured)
        {
            return configured;
        }

        return AllUsers().FirstOrDefault(u => u.HasPermission(PermissionKind.IsAdministrator));
    }

    // IUserManager.Users (10.11.0) became GetUsers() in later 10.11.x; resolve whichever exists so one build runs on all of 10.11.
    private IEnumerable<User> AllUsers()
    {
        var type = userManager.GetType();
        var result = type.GetMethod("GetUsers", Type.EmptyTypes)?.Invoke(userManager, null)
            ?? type.GetProperty("Users")?.GetValue(userManager);
        return result as IEnumerable<User> ?? [];
    }

    public User GetUser(Guid userId) => userManager.GetUserById(userId) ?? throw new GameException(403, "Host account no longer exists");

    private Folder[] Views(User user) =>
#if JF_10_9
        userViewManager.GetUserViews(new UserViewQuery { UserId = user.Id })
#else
        userViewManager.GetUserViews(new UserViewQuery { User = user })
#endif
            .Where(v => SupportedCollections.Contains((v as IHasCollectionType)?.CollectionType))
            .ToArray();

    public IReadOnlyList<LibraryInfo> Libraries(User user) =>
        Views(user)
            .Select(v => new LibraryInfo(
                v.Id.ToString("N"),
                v.Name,
                (v as IHasCollectionType)?.CollectionType?.ToString() ?? "mixed",
                v.HasImage(ImageType.Primary)))
            .ToList();

    private IEnumerable<Folder> SelectedViews(User user, IEnumerable<string> ids)
    {
        var wanted = ids.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Views(user).Where(v => wanted.Contains(v.Id.ToString("N")));
    }

    private static InternalItemsQuery BaseQuery(User user) => new(user)
    {
        Recursive = true,
        IncludeItemTypes = SwipeKinds,
        IsVirtualItem = false,
        DtoOptions = new DtoOptions(true),
    };

    private readonly Microsoft.Extensions.Caching.Memory.MemoryCache _genreCache = new(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 200 });

    /// <summary>Genres present in the selected libraries (cached for 10 minutes per user + library selection).</summary>
    public IReadOnlyList<GenreInfo> Genres(User user, IEnumerable<string> libraryIds)
    {
        var ids = libraryIds.Order(StringComparer.Ordinal).ToArray();
        var key = $"{user.Id:N}|{string.Join(',', ids)}";
        return Microsoft.Extensions.Caching.Memory.CacheExtensions.GetOrCreate(_genreCache, key, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            entry.Size = 1;
            return LoadGenres(user, ids);
        })!;
    }

    private List<GenreInfo> LoadGenres(User user, IEnumerable<string> libraryIds)
    {
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var view in SelectedViews(user, libraryIds))
        {
            foreach (var item in view.GetItemList(BaseQuery(user)))
            {
                foreach (var g in item.Genres ?? [])
                {
                    names.Add(g);
                }
            }
        }

        // Genre names double as ids: they are stable and filtering by name is simpler than by genre item.
        return names.Select(n => new GenreInfo(n, n)).ToList();
    }

    public List<DeckItem> BuildDeck(User user, GameSettings settings, int maxCards)
    {
        var views = SelectedViews(user, settings.LibraryIds).ToList();
        if (views.Count == 0)
        {
            throw new GameException(422, "None of the selected libraries are available");
        }

        var genres = settings.GenreIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var per = (int)Math.Ceiling(maxCards / (double)views.Count);
        var byId = new Dictionary<Guid, DeckItem>();
        foreach (var view in views)
        {
            var query = BaseQuery(user);
            query.OrderBy = [(ItemSortBy.Random, SortOrder.Ascending)];
            if (settings.UnplayedOnly)
            {
                query.IsPlayed = false;
            }

            if (genres.Count > 0)
            {
                // Let the database pre-filter; the in-memory check below keeps results exact either way.
                query.Genres = genres.ToArray();
                query.Limit = per * 4;
            }
            else
            {
                query.Limit = per;
            }

            var taken = 0;
            foreach (var item in view.GetItemList(query))
            {
                if (taken >= per)
                {
                    break;
                }

                if (genres.Count > 0 && !(item.Genres ?? []).Any(genres.Contains))
                {
                    continue;
                }

                var card = ToCard(item);
                if (card.Images.Length > 0 && byId.TryAdd(item.Id, card))
                {
                    taken++;
                }
            }
        }

        var deck = byId.Values.ToList();
        for (var i = deck.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (deck[i], deck[j]) = (deck[j], deck[i]);
        }

        return deck;
    }

    private static DeckItem ToCard(BaseItem item)
    {
        var images = new List<string>();
        if (item.HasImage(ImageType.Primary))
        {
            images.Add("Primary/0");
        }

        var backdrops = item.GetImages(ImageType.Backdrop).Count();
        for (var i = 0; i < Math.Min(backdrops, 4); i++)
        {
            images.Add($"Backdrop/{i}");
        }

        return new DeckItem
        {
            Id = item.Id.ToString("N"),
            Name = item.Name,
            Type = item is Series ? "Series" : "Movie",
            Year = item.ProductionYear,
            Overview = item.Overview ?? string.Empty,
            Genres = (item.Genres ?? []).Take(6).ToArray(),
            Rating = item.CommunityRating is { } r ? Math.Round(r, 1) : null,
            Critic = item.CriticRating,
            Official = string.IsNullOrEmpty(item.OfficialRating) ? null : item.OfficialRating,
            Runtime = item is Series || item.RunTimeTicks is null ? null : (int)Math.Round(item.RunTimeTicks.Value / 600_000_000d),
            Images = images.ToArray(),
        };
    }

    private IEnumerable<SessionInfo> ControllableSessions(User host)
    {
        var isAdmin = host.HasPermission(PermissionKind.IsAdministrator);
        var cutoff = DateTime.UtcNow.AddMinutes(-30);
        return sessionManager.Sessions.Where(s =>
            s.SupportsRemoteControl
            && s.LastActivityDate > cutoff
            && (isAdmin || s.UserId.Equals(host.Id)));
    }

    public IReadOnlyList<DeviceInfo> Devices(User host) =>
        ControllableSessions(host)
            .Select(s => new DeviceInfo(s.Id, s.DeviceId, s.DeviceName, s.Client, s.UserName, s.NowPlayingItem?.Name))
            .ToList();

    /// <summary>Plays a result on a device. Series start at the first unwatched episode (Jellyfin then continues with the next ones).</summary>
    public async Task PlayAsync(User host, string sessionId, string itemId, CancellationToken ct)
    {
        var session = ControllableSessions(host).FirstOrDefault(s => s.Id == sessionId)
            ?? throw new GameException(404, "That device is no longer available");
        var target = ResolvePlayable(host, itemId);
        logger.LogInformation("JellySwipe: playing {Item} on {Device}", target, session.DeviceName);
        await sessionManager.SendPlayCommand(
            string.Empty,
            session.Id,
            new PlayRequest { ItemIds = [target], PlayCommand = PlayCommand.PlayNow, ControllingUserId = host.Id },
            ct).ConfigureAwait(false);
    }

    public Task PlayOnDeviceAsync(User host, string deviceId, string itemId, CancellationToken ct)
    {
        var session = ControllableSessions(host)
            .OrderByDescending(s => s.LastActivityDate)
            .FirstOrDefault(s => s.DeviceId == deviceId)
            ?? throw new GameException(404, "The auto-play device is not online in Jellyfin");
        return PlayAsync(host, session.Id, itemId, ct);
    }

    private Guid ResolvePlayable(User user, string itemId)
    {
        if (!Guid.TryParse(itemId, out var id))
        {
            throw new GameException(400, "Bad item id");
        }

        var item = libraryManager.GetItemById(id) ?? throw new GameException(404, "Title not found");
        if (item is not Series series)
        {
            return item.Id;
        }

        var query = new InternalItemsQuery(user)
        {
            AncestorIds = [series.Id],
            IncludeItemTypes = [BaseItemKind.Episode],
            IsVirtualItem = false,
            OrderBy = [(ItemSortBy.ParentIndexNumber, SortOrder.Ascending), (ItemSortBy.IndexNumber, SortOrder.Ascending)],
            Limit = 1,
            DtoOptions = new DtoOptions(false),
        };
        query.IsPlayed = false;
        var next = libraryManager.GetItemList(query).FirstOrDefault();
        if (next is null)
        {
            query.IsPlayed = null;
            next = libraryManager.GetItemList(query).FirstOrDefault();
        }

        return next?.Id ?? throw new GameException(404, "This series has no episodes");
    }
}
