using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.JellySwipe.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Gets or sets a value indicating whether people without a Jellyfin account may join lobbies by code.</summary>
    public bool AllowGuests { get; set; } = true;

    /// <summary>Gets or sets a value indicating whether people who are not signed in to Jellyfin may host games (as <see cref="DefaultHostUserId"/>).</summary>
    public bool AllowAnonymousHosts { get; set; } = true;

    /// <summary>Gets or sets the Jellyfin user whose libraries, watch state and devices anonymous hosts use. Empty = first administrator.</summary>
    public string DefaultHostUserId { get; set; } = string.Empty;

    /// <summary>Gets or sets a value indicating whether a JellySwipe entry is added to the Jellyfin web sidebar (needs the File Transformation plugin).</summary>
    public bool ShowInSidebar { get; set; } = true;

    /// <summary>Gets or sets the countdown before the winner is auto-played.</summary>
    public int AutoPlayDelaySeconds { get; set; } = 10;

    /// <summary>Gets or sets the maximum number of cards dealt per game.</summary>
    public int MaxDeckSize { get; set; } = 400;
}
