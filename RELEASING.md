# Releasing JellySwipe

Checklist for shipping a new version. A release takes about 30 minutes, most of which is the compatibility matrix.

## 0. Prerequisites (once per machine)

- .NET SDKs **8, 9 and 10** (`dotnet --list-sdks`). User-local install: `curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0` (repeat for 9.0 and 10.0); they land in `~/.dotnet`.
- Docker (for the demo server and the test matrix), Python 3, Node.js.
- `gh` logged in to the `marceljhuber` account.
- Optional, for screenshots: `npm --prefix dev install` (installs `playwright-core`) and a Chromium from `npx playwright install chromium`.

## 1. Bump the version

| File | What to change |
|---|---|
| `Jellyfin.Plugin.JellySwipe/Jellyfin.Plugin.JellySwipe.csproj` | `<PluginVersion>` (e.g. `0.4.0`). The 4th part (`.109`, `.1010`, `.1011`, `.1200`) is added per Jellyfin target automatically. |
| `CHANGELOG.md` | New `## x.y.z` section at the top. The **whole file** becomes the GitHub release body. |
| `manifest.json` | Top-level `"changelog"` string (short, one line). This is what Jellyfin's catalog shows. **Don't** touch `"versions"`; the release workflow adds the entries. |

## 2. Build all variants

```bash
for t in 10.9 10.10 10.11 12; do dotnet build Jellyfin.Plugin.JellySwipe -c Release -p:JellyfinTarget=$t; done
for f in Jellyfin.Plugin.JellySwipe/Web/*.js; do node --check "$f"; done
```

Compiling for every target catches most API differences between Jellyfin versions (see *Pitfalls*).

## 3. Test

```bash
dev/demo-server.sh 12.1                        # demo Jellyfin with the plugin, http://localhost:28296 (admin / test)
JF_URL=http://localhost:28296 JF_USER=admin JF_PASS=test python3 dev/smoke-test.py
dev/test-matrix.sh                             # real Jellyfin 10.9.11, 10.10.7, 10.11.0, 10.11.11, 12.0, 12.1 (~20 min)
```

Expected matrix result: `smoke=pass` everywhere. On **10.9.11** (`sidebar-inject=0`) and **10.11.0** (`sidebar-inject=0`, `plugin-errors=1`), File Transformation has no build that loads; that's upstream, and JellySwipe itself works there. If a version reports **0 movies with metadata**, TMDb didn't answer during setup; rerun just that tag (`dev/test-matrix.sh 12.1`).

Click through the UI once on a phone-sized browser (create → lobby → swipe → match → results), in light and dark mode.

## 4. Screenshots (only if the UI changed)

```bash
dev/demo-server.sh 12.1
node dev/screenshots.mjs                       # writes docs/screenshots/*.png (dark) via a neutral jellyfin.home address
```

The README shows `card`, `lobby-2`, `match` and `results`.

## 5. Commit, push, wait for CI

```bash
git add -A && git commit -m "vX.Y.Z: …" && git push
gh run list --limit 1                          # Build workflow must be green (all four targets)
```

Before pushing, check that nothing private is in the diff (IP addresses, hostnames, e-mails, tokens). `marketing/` is gitignored on purpose.

## 6. Tag → release

```bash
git tag -a vX.Y.Z -m "JellySwipe X.Y.Z" && git push origin vX.Y.Z
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
git pull --ff-only                             # the workflow committed manifest.json to main
```

The release workflow builds all four variants (`scripts/package.sh`), publishes the GitHub release with the zips, and commits the new `manifest.json` entries (older versions stay listed).

## 7. Verify the public release

```bash
python3 dev/verify-release.py                  # every manifest entry downloads and matches its checksum
```

Optionally do a real catalog install on a fresh server: add `https://raw.githubusercontent.com/marceljhuber/jellyswipe/main/manifest.json` under Dashboard → Plugins → Repositories, install JellySwipe, restart, and open `/JellySwipe/`.

## Pitfalls we already hit

- **File Transformation keys:** it groups transformations by the exact `fileNamePattern` string and prefers exact path matches, so JellySwipe must register under the shared `"index.html"` key. That string is also a regex matching JS chunks like `session-login-index-html.*.chunk.js`, so the callback only injects into real HTML documents. An unanchored custom regex once broke the Jellyfin login page.
- **ASP.NET route names:** never call a route parameter `{action}` or `{controller}`; they're reserved, and the route silently 404s.
- **Jellyfin API drift:** `IUserManager.Users` (10.11.0) became `GetUsers()` (10.11.x); the plugin resolves it by reflection. `User` and `PermissionKind` moved namespaces in 10.11 (`GlobalUsings.cs`), and 10.9's `UserViewQuery` takes `UserId` instead of `User`.
- **Jellyfin 10.11.0 random sort** returns duplicate rows (and crashes on duplicate provider ids), so the deck is never sorted or limited in the database: load, shuffle and cut in memory.
- **Jellyfin 12 web** uses the MUI layout. `inject.js` clones a native drawer item and adds a toolbar button there, and only touches the legacy `.headerRight` when it's visible.
- **Release workflow pushes to `main`** (manifest commit). Always `git pull` after tagging.
- **Shell:** the default shell on the dev machine is zsh-like (no word splitting of `$var`, `$V1:l` is a modifier). Wrap loops that rely on bash behaviour in `bash -c '…'`.
