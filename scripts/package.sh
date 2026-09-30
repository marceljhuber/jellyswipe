#!/usr/bin/env bash
# Build the plugin and produce dist/jellyswipe_<version>.zip (+ md5) for a GitHub release,
# then update manifest.json so Jellyfin can install it from the plugin repository URL.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(grep -oP '(?<=<AssemblyVersion>)[^<]+' Jellyfin.Plugin.JellySwipe/Jellyfin.Plugin.JellySwipe.csproj)
DOTNET=${DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}
REPO=${REPO:-marceljhuber/jellyswipe}

"$DOTNET" publish Jellyfin.Plugin.JellySwipe -c Release -o build/publish --nologo -v quiet
rm -rf dist && mkdir -p dist
ZIP="dist/jellyswipe_${VERSION}.zip"
python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED).write(sys.argv[2], "Jellyfin.Plugin.JellySwipe.dll")' "$ZIP" build/publish/Jellyfin.Plugin.JellySwipe.dll
MD5=$(md5sum "$ZIP" | cut -d' ' -f1)
echo "$MD5" > "$ZIP.md5"

python3 - "$VERSION" "$MD5" "$REPO" <<'PY'
import json, sys, datetime
version, md5, repo = sys.argv[1:]
path = "manifest.json"
data = json.load(open(path))
plugin = data[0]
plugin["versions"] = [v for v in plugin["versions"] if v["version"] != version]
plugin["versions"].insert(0, {
    "version": version,
    "changelog": plugin.get("changelog", ""),
    "targetAbi": "10.11.0.0",
    "sourceUrl": f"https://github.com/{repo}/releases/download/v{version}/jellyswipe_{version}.zip",
    "checksum": md5,
    "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
})
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
echo "Built $ZIP (md5 $MD5); manifest.json updated for v$VERSION"
