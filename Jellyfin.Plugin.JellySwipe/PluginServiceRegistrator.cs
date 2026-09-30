using Jellyfin.Plugin.JellySwipe.Game;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellySwipe;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<LibraryService>();
        serviceCollection.AddSingleton<RoomManager>();
        serviceCollection.AddHostedService<SidebarInjector>();
    }
}
