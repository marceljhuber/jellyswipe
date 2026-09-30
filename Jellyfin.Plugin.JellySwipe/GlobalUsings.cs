// Types that moved between Jellyfin versions. JF_GE_10_11 is set by the csproj per JellyfinTarget.
#if JF_GE_10_11
global using Jellyfin.Data;
global using Jellyfin.Database.Implementations.Enums;
global using PermissionKind = Jellyfin.Database.Implementations.Enums.PermissionKind;
global using User = Jellyfin.Database.Implementations.Entities.User;
#else
global using PermissionKind = Jellyfin.Data.Enums.PermissionKind;
global using User = Jellyfin.Data.Entities.User;
#endif
