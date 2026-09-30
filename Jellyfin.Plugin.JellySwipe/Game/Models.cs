using System.Text.Json.Serialization;
using System.Threading.Channels;

namespace Jellyfin.Plugin.JellySwipe.Game;

/// <summary>An HTTP error with a status code, mapped to a JSON error response by the controller.</summary>
public sealed class GameException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

public record DeckItem
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string Type { get; init; }

    public int? Year { get; init; }

    public string Overview { get; init; } = string.Empty;

    public string[] Genres { get; init; } = [];

    public double? Rating { get; init; }

    public double? Critic { get; init; }

    public string? Official { get; init; }

    public int? Runtime { get; init; }

    public int? Seasons { get; init; }

    public string[] Images { get; init; } = [];
}

public sealed record ResultItem : DeckItem
{
    public string[] LikedBy { get; init; } = [];

    public string[] SuperBy { get; init; } = [];
}

public sealed class AutoPlayTarget
{
    public string DeviceId { get; set; } = string.Empty;

    public string DeviceName { get; set; } = string.Empty;
}

public sealed class GameSettings
{
    public string[] LibraryIds { get; set; } = [];

    public string[] LibraryNames { get; set; } = [];

    public string[] GenreIds { get; set; } = [];

    public string[] GenreNames { get; set; } = [];

    public bool UnplayedOnly { get; set; }

    public int Goal { get; set; } = 3;

    public AutoPlayTarget? AutoPlay { get; set; }
}

public sealed class AutoPlayState
{
    public required string ItemId { get; init; }

    public required long At { get; init; }

    public required string DeviceName { get; init; }

    public string Status { get; set; } = "pending";

    public string? Error { get; set; }
}

internal sealed record Swipe(string ItemId, string Choice);

internal sealed class Player
{
    public required string Id { get; init; }

    public required string Secret { get; init; }

    public required string Name { get; init; }

    public required string Color { get; init; }

    public int Position { get; set; }

    public List<Swipe> History { get; } = [];

    public int Connections { get; set; }
}

internal sealed class Listener
{
    public required string PlayerId { get; init; }

    public Channel<string> Channel { get; } = System.Threading.Channels.Channel.CreateUnbounded<string>(new UnboundedChannelOptions { SingleReader = true });
}

internal sealed class Results
{
    public required string Reason { get; init; }

    public List<string> Picks { get; init; } = [];

    public List<string> Close { get; init; } = [];
}

internal sealed class Room
{
    public required string Code { get; init; }

    public required Guid HostUserId { get; init; }

    public required GameSettings Settings { get; init; }

    public object Sync { get; } = new();

    public string Status { get; set; } = "lobby";

    public string? Mode { get; set; }

    public string HostId { get; set; } = string.Empty;

    public List<Player> Players { get; } = [];

    public List<DeckItem> Deck { get; set; } = [];

    public Dictionary<string, int> DeckIndex { get; set; } = [];

    // itemId -> (playerId -> choice)
    public Dictionary<string, Dictionary<string, string>> Swipes { get; set; } = [];

    public List<string> Matches { get; set; } = [];

    public Results? Results { get; set; }

    public List<Listener> Listeners { get; } = [];

    public int Seq { get; set; }

    public int Round { get; set; }

    public DateTime LastActive { get; set; } = DateTime.UtcNow;

    public AutoPlayState? AutoPlay { get; set; }

    public CancellationTokenSource? AutoPlayCts { get; set; }
}

// ---- Views sent to clients (camelCase JSON, same shape the web client expects) ----
public sealed record PlayerView(string Id, string Name, string Color, bool Host, bool Online, int Progress, int Likes);

public sealed record YouView(string Id, bool Host, int Position, bool CanUndo, int? Picks);

public sealed record ResultsView(string Reason, IReadOnlyList<ResultItem> Picks, IReadOnlyList<ResultItem> Close, IReadOnlyList<string> Ranked);

public sealed record AutoPlayView(string ItemId, string DeviceName, string Status, string? Error, long InMs);

public sealed record RoomView(
    int Seq,
    int Round,
    string Code,
    string Status,
    string? Mode,
    GameSettings Settings,
    int DeckSize,
    IReadOnlyList<PlayerView> Players,
    IReadOnlyList<ResultItem> Matches,
    ResultsView? Results,
    AutoPlayView? AutoPlay,
    YouView? You);

public sealed class CreateRoomRequest
{
    public string? Name { get; set; }

    public GameSettings? Settings { get; set; }
}

public sealed class RoomRequest
{
    public string? Secret { get; set; }

    public string? Name { get; set; }

    public string? ItemId { get; set; }

    public string? Choice { get; set; }

    public string? PlayerId { get; set; }

    public string? SessionId { get; set; }
}

public sealed record JoinResponse(string Code, string Secret, string PlayerId);

public sealed record LibraryInfo(string Id, string Name, string Type, bool HasImage);

public sealed record GenreInfo(string Id, string Name);

public sealed record DeviceInfo(string Id, string DeviceId, string Device, string Client, string? User, string? NowPlaying);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(RoomView))]
internal sealed partial class GameJsonContext : JsonSerializerContext;
