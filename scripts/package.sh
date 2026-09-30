#!/usr/bin/env bash
# Build every Jellyfin variant, zip each DLL into dist/, and write matching entries into manifest.json.
#   ./scripts/package.sh            → dist/jellyswipe_<ver>_jf<target>.zip for 10.9, 10.10, 10.11, 12
# Jellyfin's catalog installs the highest version whose targetAbi <= server version, and the 4th
# version component encodes the target (…109 < …1010 < …1011 < …1200), so every server gets its build.
set -euo pipefail
cd "$(dirname "$0")/.."
DOTNET=${DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}
REPO=${REPO:-marceljhuber/jellyswipe}
PLUGIN_VERSION=$(grep -oP '(?<=<PluginVersion>)[^<]+' Jellyfin.Plugin.JellySwipe/Jellyfin.Plugin.JellySwipe.csproj)
TARGETS=(10.9 10.10 10.11 12)

rm -rf dist && mkdir -p dist
: > dist/entries.tsv
for t in "${TARGETS[@]}"; do
  out="artifacts/publish/$t"
  "$DOTNET" publish Jellyfin.Plugin.JellySwipe -c Release -p:JellyfinTarget="$t" -o "$out" --nologo -v quiet
  dll="$out/Jellyfin.Plugin.JellySwipe.dll"
  version=$(grep -oP "(?<=<AbiCode>)[^<]+" <(sed -n "/'$t'/,/PropertyGroup>/p" Jellyfin.Plugin.JellySwipe/Jellyfin.Plugin.JellySwipe.csproj) | head -1)
  abi=$(grep -oP "(?<=<TargetAbi>)[^<]+" <(sed -n "/'$t'/,/PropertyGroup>/p" Jellyfin.Plugin.JellySwipe/Jellyfin.Plugin.JellySwipe.csproj) | head -1)
  full="$PLUGIN_VERSION.$version"
  zip="dist/jellyswipe_${full}.zip"
  python3 -c 'import sys,zipfile;zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED).write(sys.argv[2],"Jellyfin.Plugin.JellySwipe.dll")' "$zip" "$dll"
  md5=$(md5sum "$zip" | cut -d' ' -f1)
  printf '%s\t%s\t%s\t%s\n' "$full" "$abi" "$(basename "$zip")" "$md5" >> dist/entries.tsv
  echo "  Jellyfin $t → $zip (targetAbi $abi, md5 $md5)"
done

python3 - "$REPO" "$PLUGIN_VERSION" <<'PY'
import csv, datetime, json, sys
repo, plugin_version = sys.argv[1:]
data = json.load(open("manifest.json"))
plugin = data[0]
changelog = plugin.get("changelog", "")
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
new = []
for full, abi, zipname, md5 in csv.reader(open("dist/entries.tsv"), delimiter="\t"):
    new.append({
        "version": full,
        "changelog": changelog,
        "targetAbi": abi,
        "sourceUrl": f"https://github.com/{repo}/releases/download/v{plugin_version}/{zipname}",
        "checksum": md5,
        "timestamp": now,
    })
keep = [v for v in plugin["versions"] if not v["version"].startswith(plugin_version + ".")]
plugin["versions"] = sorted(new, key=lambda v: [int(x) for x in v["version"].split(".")], reverse=True) + keep
json.dump(data, open("manifest.json", "w"), indent=2)
open("manifest.json", "a").write("\n")
print(f"manifest.json: {len(new)} entries for v{plugin_version}")
PY
rm dist/entries.tsv
