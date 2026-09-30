using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellySwipe;

/// <summary>
/// Adds a &lt;script&gt; tag to jellyfin-web's index.html (via the optional File Transformation
/// plugin) that puts a JellySwipe entry into the sidebar. Without that plugin JellySwipe still
/// works at /JellySwipe/, there is just no menu entry.
/// </summary>
public sealed class SidebarInjector(ILogger<SidebarInjector> logger) : IHostedService
{
    private const string ScriptTag = "<script src=\"../JellySwipe/inject.js\" defer></script>";
    private static readonly Guid TransformationId = Guid.Parse("7c1f0a4e-5b0c-4a53-9d8e-2f6b3e1c9a11");

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            var ft = AssemblyLoadContext.All
                .SelectMany(c => c.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);
            var register = ft?.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface")?.GetMethod("RegisterTransformation");
            if (register is null)
            {
                logger.LogInformation("JellySwipe: File Transformation plugin not found; no sidebar entry (open /JellySwipe/ directly)");
                return Task.CompletedTask;
            }

            var payload = JsonSerializer.Serialize(new Dictionary<string, string?>
            {
                ["id"] = TransformationId.ToString(),
                // Regex! An unanchored "index.html" also matches jellyfin-web chunks like "session-login-index-html.*.chunk.js".
                ["fileNamePattern"] = @"(^|[\\/])index\.html$",
                ["callbackAssembly"] = GetType().Assembly.FullName,
                ["callbackClass"] = typeof(SidebarInjector).FullName,
                ["callbackMethod"] = nameof(TransformIndex),
            });

            // The payload type (Newtonsoft JObject) lives in File Transformation's load context,
            // so build it through that type's own Parse method instead of referencing Newtonsoft.
            var jObjectType = register.GetParameters()[0].ParameterType;
            var parse = jObjectType.GetMethod("Parse", BindingFlags.Public | BindingFlags.Static, [typeof(string)]);
            register.Invoke(null, [parse!.Invoke(null, [payload])]);
            logger.LogInformation("JellySwipe: sidebar entry registered via File Transformation");
        }
        catch (Exception e)
        {
            logger.LogWarning(e, "JellySwipe: could not register the sidebar entry");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>Callback invoked by File Transformation with { contents } of index.html.</summary>
    public static string TransformIndex(IndexPayload payload)
    {
        var html = payload.Contents ?? string.Empty;
        if (html.Contains("JellySwipe/inject.js", StringComparison.Ordinal))
        {
            return html;
        }

        // Only ever touch real HTML documents.
        var at = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        return at < 0 ? html : html.Insert(at, ScriptTag);
    }

    public sealed class IndexPayload
    {
        public string? Contents { get; set; }
    }
}
