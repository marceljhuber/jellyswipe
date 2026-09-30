using System.Reflection;
using System.Text.Json;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.JellySwipe.Game;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Jellyfin.Plugin.JellySwipe.Api;

/// <summary>
/// Serves the JellySwipe web app at /JellySwipe/ and its API at /JellySwipe/api/*.
/// Hosts are identified by their normal Jellyfin token; guests only by their per-lobby secret.
/// </summary>
[ApiController]
[AllowAnonymous]
[GameExceptionFilter]
[Route("JellySwipe")]
public sealed class JellySwipeController(
    RoomManager rooms,
    LibraryService library,
    IAuthorizationContext authContext) : ControllerBase
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly Dictionary<string, string> Mime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".svg"] = "image/svg+xml",
        [".webmanifest"] = "application/manifest+json",
    };

    private static Configuration.PluginConfiguration Config => Plugin.Instance?.Configuration ?? new Configuration.PluginConfiguration();

    private ContentResult JsonOut(object? value, int status = 200) =>
        new() { Content = JsonSerializer.Serialize(value, Json), ContentType = "application/json", StatusCode = status };

    private async Task<User?> CurrentUser()
    {
        try
        {
            var info = await authContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
            return info.IsAuthenticated ? info.User : null;
        }
        catch (Exception)
        {
            return null; // invalid/expired token → treat as guest
        }
    }

    /// <summary>The signed-in Jellyfin user, or the configured default host when hosting without sign-in is allowed.</summary>
    private async Task<User> RequireUser() =>
        await CurrentUser().ConfigureAwait(false)
        ?? (Config.AllowAnonymousHosts ? library.DefaultHost(Config.DefaultHostUserId) : null)
        ?? throw new GameException(401, "Sign in to Jellyfin to host a game");

    // ------------------------------------------------------------------ static web app

    [HttpGet("")]
    public IActionResult Index()
    {
        // Relative asset URLs need the trailing slash.
        if (!(Request.Path.Value ?? string.Empty).EndsWith('/'))
        {
            return Redirect($"{Request.PathBase}{Request.Path}/");
        }

        return Asset("index.html");
    }

    [HttpGet("{file}")]
    public IActionResult Asset([FromRoute] string file)
    {
        if (!Mime.TryGetValue(Path.GetExtension(file), out var type) || file.Contains("..", StringComparison.Ordinal))
        {
            return NotFound();
        }

        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"Web/{file}");
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = file.EndsWith(".html", StringComparison.Ordinal) ? "no-cache" : "public, max-age=300";
        return File(stream, type);
    }

    // ------------------------------------------------------------------ account-level API

    [HttpGet("api/status")]
    public async Task<IActionResult> Status()
    {
        var user = await CurrentUser().ConfigureAwait(false);
        var host = user ?? (Config.AllowAnonymousHosts ? library.DefaultHost(Config.DefaultHostUserId) : null);
        return JsonOut(new
        {
            user = user?.Username,
            host = host?.Username,
            allowGuests = Config.AllowGuests,
            sidebar = Config.ShowInSidebar,
        });
    }

    [HttpGet("api/libraries")]
    public async Task<IActionResult> Libraries() => JsonOut(library.Libraries(await RequireUser().ConfigureAwait(false)));

    [HttpGet("api/genres")]
    public async Task<IActionResult> Genres([FromQuery] string? libraryIds)
    {
        var user = await RequireUser().ConfigureAwait(false);
        var ids = (libraryIds ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries);
        return JsonOut(ids.Length == 0 ? [] : library.Genres(user, ids));
    }

    [HttpGet("api/sessions")]
    public async Task<IActionResult> Sessions() => JsonOut(library.Devices(await RequireUser().ConfigureAwait(false)));

    [HttpPost("api/rooms")]
    public async Task<IActionResult> Create([FromBody] CreateRoomRequest body)
    {
        var user = await RequireUser().ConfigureAwait(false);
        return JsonOut(rooms.Create(user.Id, body.Name ?? user.Username, body.Settings ?? new GameSettings()));
    }

    // ------------------------------------------------------------------ lobby API (secret-based)

    [HttpGet("api/rooms/{code}")]
    public IActionResult RoomInfo([FromRoute] string code) => JsonOut(rooms.Summary(code));

    [HttpGet("api/rooms/{code}/deck")]
    public IActionResult Deck([FromRoute] string code, [FromQuery] string? secret) => JsonOut(new { deck = rooms.Deck(code, secret) });

    [HttpGet("api/rooms/{code}/sessions")]
    public IActionResult RoomSessions([FromRoute] string code, [FromQuery] string? secret)
    {
        var host = rooms.HostUserFor(code, secret, out _);
        return JsonOut(library.Devices(library.GetUser(host)));
    }

    [HttpPost("api/rooms/{code}/join")]
    public async Task<IActionResult> Join([FromRoute] string code, [FromBody] RoomRequest body)
    {
        if (!Config.AllowGuests && body.Secret is null && await CurrentUser().ConfigureAwait(false) is null)
        {
            throw new GameException(401, "Guests are disabled — sign in to Jellyfin to join");
        }

        return JsonOut(rooms.Join(code, body.Name, body.Secret));
    }

    [HttpPost("api/rooms/{code}/{op}")]
    public async Task<IActionResult> RoomAction([FromRoute] string code, [FromRoute] string op, [FromBody] RoomRequest body)
    {
        switch (op)
        {
            case "start":
                rooms.Start(code, body.Secret);
                break;
            case "swipe":
                return JsonOut(new { matched = rooms.Swipe(code, body.Secret, body.ItemId, body.Choice) });
            case "undo":
                return JsonOut(new { itemId = rooms.Undo(code, body.Secret) });
            case "leave":
                rooms.Leave(code, body.Secret);
                break;
            case "kick":
                rooms.Kick(code, body.Secret, body.PlayerId);
                break;
            case "lobby":
                rooms.BackToLobby(code, body.Secret);
                break;
            case "cancel-autoplay":
                rooms.CancelAutoPlay(code, body.Secret);
                break;
            case "play":
                await rooms.PlayAsync(code, body.Secret, body.ItemId, body.SessionId, HttpContext.RequestAborted).ConfigureAwait(false);
                break;
            default:
                return JsonOut(new { error = "Unknown action" }, 404);
        }

        return JsonOut(new { ok = true });
    }

    /// <summary>Server-Sent Events stream of room state for one player.</summary>
    [HttpGet("api/rooms/{code}/events")]
    public async Task Events([FromRoute] string code, [FromQuery] string? secret)
    {
        Listener listener;
        Room room;
        try
        {
            listener = rooms.Subscribe(code, secret, out room);
        }
        catch (GameException e)
        {
            Response.StatusCode = e.Status;
            await Response.WriteAsJsonAsync(new { error = e.Message }).ConfigureAwait(false);
            return;
        }

        var ct = HttpContext.RequestAborted;
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";
        try
        {
            await Response.WriteAsync("retry: 2000\n\n", ct).ConfigureAwait(false);
            await Response.Body.FlushAsync(ct).ConfigureAwait(false);
            var reader = listener.Channel.Reader;
            while (!ct.IsCancellationRequested)
            {
                using var ping = CancellationTokenSource.CreateLinkedTokenSource(ct);
                ping.CancelAfter(TimeSpan.FromSeconds(20));
                string message;
                try
                {
                    if (!await reader.WaitToReadAsync(ping.Token).ConfigureAwait(false))
                    {
                        break; // room closed
                    }

                    message = await reader.ReadAsync(ct).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    message = ": ping\n\n";
                }

                await Response.WriteAsync(message, ct).ConfigureAwait(false);
                await Response.Body.FlushAsync(ct).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // client went away
        }
        finally
        {
            rooms.Unsubscribe(room, listener);
        }
    }
}

/// <summary>Maps <see cref="GameException"/> to a JSON { error } response with its status code.</summary>
public sealed class GameExceptionFilterAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is GameException ge)
        {
            context.Result = new ContentResult
            {
                Content = JsonSerializer.Serialize(new { error = ge.Message }),
                ContentType = "application/json",
                StatusCode = ge.Status,
            };
            context.ExceptionHandled = true;
        }
    }
}
