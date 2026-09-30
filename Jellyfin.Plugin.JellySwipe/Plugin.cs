using Jellyfin.Plugin.JellySwipe.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.JellySwipe;

/// <summary>
/// JellySwipe: Tinder-style swiping over the Jellyfin library until everyone matches.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "JellySwipe";

    public override Guid Id => Guid.Parse("f45261b7-3337-4bcb-97f4-3c8c54a4cfee");

    public override string Description => "Swipe through your library with friends, Tinder-style, until you match on what to watch.";

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html",
            },
        ];
    }
}
