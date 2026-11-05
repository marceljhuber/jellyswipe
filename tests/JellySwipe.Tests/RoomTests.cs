using Jellyfin.Plugin.JellySwipe.Game;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

public sealed class RoomTests : IDisposable
{
    private readonly RoomManager _rooms = new(new LibraryService(null!, null!, null!, null!, NullLogger<LibraryService>.Instance), NullLogger<RoomManager>.Instance);

    public void Dispose() => _rooms.Dispose();

    private static List<DeckItem> Deck(int n) =>
        Enumerable.Range(1, n).Select(i => new DeckItem { Id = $"item{i}", Name = $"Title {i}", Type = "Movie", Images = ["Primary/0"] }).ToList();

    private (string Code, JoinResponse Host, JoinResponse Guest) TwoPlayers(int goal = 1, int deck = 5)
    {
        var host = _rooms.Create(Guid.NewGuid(), "Host", new GameSettings { LibraryIds = ["lib"], Goal = goal });
        var guest = _rooms.Join(host.Code, "Guest", null);
        _rooms.StartRound(_rooms.Get(host.Code), Deck(deck));
        return (host.Code, host, guest);
    }

    private Room R(string code) => _rooms.Get(code);

    // Each player swipes their own shuffled order and "progress" is the furthest card swiped,
    // so tests pick the host's first card: that way no player's deck runs out by accident.
    private string First(string code, JoinResponse p) => _rooms.Deck(code, p.Secret)[0].Id;

    [Fact]
    public void Everyone_liking_a_title_is_a_match_and_reaches_the_goal()
    {
        var (code, host, guest) = TwoPlayers(goal: 1);
        Assert.False(_rooms.Swipe(code, host.Secret, "item3", "like"));
        Assert.True(_rooms.Swipe(code, guest.Secret, "item3", "super"));
        Assert.Equal("finished", R(code).Status);
        Assert.Equal("goal", R(code).Results!.Reason);
    }

    [Fact]
    public void A_nope_prevents_a_match()
    {
        var (code, host, guest) = TwoPlayers(goal: 1);
        var x = First(code, host);
        _rooms.Swipe(code, host.Secret, x, "like");
        Assert.False(_rooms.Swipe(code, guest.Secret, x, "nope"));
        Assert.Equal("playing", R(code).Status);
    }

    [Fact]
    public void Matched_titles_cannot_be_reswiped_or_undone()
    {
        var (code, host, guest) = TwoPlayers(goal: 3);
        var x = First(code, host);
        _rooms.Swipe(code, host.Secret, x, "like");
        Assert.True(_rooms.Swipe(code, guest.Secret, x, "like"));

        var reswipe = Assert.Throws<GameException>(() => _rooms.Swipe(code, guest.Secret, x, "nope"));
        Assert.Equal(409, reswipe.Status);
        Assert.Equal(409, Assert.Throws<GameException>(() => _rooms.Undo(code, guest.Secret)).Status);
        Assert.Equal([x], R(code).Matches);
    }

    [Fact]
    public void Undo_takes_back_the_last_unmatched_swipe()
    {
        var (code, host, _) = TwoPlayers();
        var x = First(code, host);
        _rooms.Swipe(code, host.Secret, x, "like");
        Assert.Equal(x, _rooms.Undo(code, host.Secret));
        Assert.Empty(R(code).Swipes[x]);
        Assert.Equal(409, Assert.Throws<GameException>(() => _rooms.Undo(code, host.Secret)).Status);
    }

    [Fact]
    public void Last_player_left_in_a_multi_game_gets_results_instead_of_a_dead_deck()
    {
        var (code, host, guest) = TwoPlayers(goal: 3);
        var first = _rooms.Deck(code, host.Secret)[0].Id;
        _rooms.Swipe(code, host.Secret, first, "like");
        _rooms.Leave(code, guest.Secret);
        var room = R(code);
        Assert.Equal("finished", room.Status);
        Assert.Equal("alone", room.Results!.Reason);
        Assert.Contains(first, room.Results.Close);
    }

    [Fact]
    public void Leaving_player_hands_over_host_and_their_likes_complete_a_match_for_the_rest()
    {
        var host = _rooms.Create(Guid.NewGuid(), "Host", new GameSettings { LibraryIds = ["lib"], Goal = 1 });
        var a = _rooms.Join(host.Code, "A", null);
        var b = _rooms.Join(host.Code, "B", null);
        _rooms.StartRound(_rooms.Get(host.Code), Deck(4));
        var x = First(host.Code, host);
        _rooms.Swipe(host.Code, host.Secret, x, "like");
        _rooms.Swipe(host.Code, a.Secret, x, "like");
        _rooms.Swipe(host.Code, b.Secret, x, "nope");
        _rooms.Leave(host.Code, b.Secret);
        Assert.Equal([x], R(host.Code).Matches);

        _rooms.Leave(host.Code, host.Secret);
        Assert.Equal(a.PlayerId, R(host.Code).HostId);
    }

    [Fact]
    public void Solo_game_counts_picks()
    {
        var host = _rooms.Create(Guid.NewGuid(), "Me", new GameSettings { LibraryIds = ["lib"], Goal = 1 });
        _rooms.StartRound(_rooms.Get(host.Code), Deck(3));
        Assert.Equal("solo", R(host.Code).Mode);
        Assert.False(_rooms.Swipe(host.Code, host.Secret, "item2", "like"));
        Assert.Equal("finished", R(host.Code).Status);
        Assert.Equal(["item2"], R(host.Code).Results!.Picks);
    }

    [Fact]
    public void Exhausted_deck_finishes_with_closest_calls()
    {
        var (code, host, guest) = TwoPlayers(goal: 3, deck: 2);
        // Swipe in each player's own (shuffled) order, as the app does.
        foreach (var p in new[] { host, guest })
        {
            foreach (var card in _rooms.Deck(code, p.Secret))
            {
                _rooms.Swipe(code, p.Secret, card.Id, card.Id == "item1" && p == host ? "like" : "nope");
            }
        }

        Assert.Equal("exhausted", R(code).Results!.Reason);
        Assert.Equal(["item1"], R(code).Results!.Close);
    }

    [Fact]
    public void Kicked_player_stream_is_closed()
    {
        var host = _rooms.Create(Guid.NewGuid(), "Host", new GameSettings { LibraryIds = ["lib"] });
        var guest = _rooms.Join(host.Code, "Guest", null);
        var listener = _rooms.Subscribe(host.Code, guest.Secret, out var room);
        _rooms.Kick(host.Code, host.Secret, guest.PlayerId);
        Assert.DoesNotContain(listener, room.Listeners);
        var events = new List<string>();
        while (listener.Channel.Reader.TryRead(out var e))
        {
            events.Add(e);
        }

        Assert.StartsWith("event: kicked", events[^1]);
        Assert.True(listener.Channel.Reader.Completion.IsCompleted);
        Assert.Equal(403, Assert.Throws<GameException>(() => _rooms.Swipe(host.Code, guest.Secret, "item1", "like")).Status);
    }

    [Fact]
    public void Only_the_host_can_start_kick_and_rounds_need_cards()
    {
        var host = _rooms.Create(Guid.NewGuid(), "Host", new GameSettings { LibraryIds = ["lib"] });
        var guest = _rooms.Join(host.Code, "Guest", null);
        Assert.Equal(403, Assert.Throws<GameException>(() => _rooms.Start(host.Code, guest.Secret)).Status);
        Assert.Equal(403, Assert.Throws<GameException>(() => _rooms.Kick(host.Code, guest.Secret, host.PlayerId)).Status);
        Assert.Equal(422, Assert.Throws<GameException>(() => _rooms.StartRound(_rooms.Get(host.Code), [])).Status);
        Assert.False(R(host.Code).Dealing);
    }

    [Fact]
    public void Lobby_rules_names_and_settings_are_sanitised()
    {
        Assert.Equal(400, Assert.Throws<GameException>(() => _rooms.Create(Guid.NewGuid(), "x", new GameSettings())).Status);
        var host = _rooms.Create(Guid.NewGuid(), "   A   very   long   name   that   goes   on   ", new GameSettings { LibraryIds = ["lib"], Goal = 7, DeckLimit = -5 });
        var room = R(host.Code);
        Assert.Equal(3, room.Settings.Goal);
        Assert.Null(room.Settings.DeckLimit);
        Assert.True(room.Players[0].Name.Length <= 20);
        for (var i = 0; i < 11; i++)
        {
            _rooms.Join(host.Code, $"P{i}", null);
        }

        Assert.Equal(409, Assert.Throws<GameException>(() => _rooms.Join(host.Code, "13th", null)).Status);
        _rooms.StartRound(room, Deck(2));
        Assert.Equal(409, Assert.Throws<GameException>(() => _rooms.Join(host.Code, "late", null)).Status);
    }

    [Fact]
    public void Every_player_gets_the_same_cards_in_their_own_order()
    {
        var (code, host, guest) = TwoPlayers(deck: 30);
        var a = _rooms.Deck(code, host.Secret).Select(d => d.Id).ToList();
        var b = _rooms.Deck(code, guest.Secret).Select(d => d.Id).ToList();
        Assert.Equal(a.Order(), b.Order());
        Assert.Equal(30, a.Distinct().Count());
    }
}
