#!/usr/bin/env bash
# Runtime compatibility test: for each Jellyfin version, boot a throwaway container with the
# matching JellySwipe build (+ File Transformation when available), set it up, scan the demo
# library and run dev/smoke-test.py. Usage: dev/test-matrix.sh [image-tag ...]
set -euo pipefail
cd "$(dirname "$0")/.."
DOTNET=${DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}
TAGS=("$@"); [ ${#TAGS[@]} -eq 0 ] && TAGS=(10.9.11 10.10.7 10.11.0 10.11.11 12.0 12.1)
WORK=${WORK:-$PWD/.matrix}; PORT=${PORT:-28196}
mkdir -p "$WORK"; bash dev/make-demo-media.sh "$WORK/media" >/dev/null

target_for() { case $1 in 10.9*) echo 10.9;; 10.10*) echo 10.10;; 10.11*) echo 10.11;; 12*) echo 12;; esac; }
ft_url() { case $1 in 10.10*) echo https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases/download/2.5.9.0/Release-10.10.7.zip;;
  10.11*) echo https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases/download/3.0.1.0/Release-10.11.11.zip;;
  12.0*) echo https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases/download/3.0.1.0/Release-12.0.0.zip;;
  12.1*) echo https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases/download/3.0.1.0/Release-12.1.0.zip;; esac; }

declare -A RESULT
for tag in "${TAGS[@]}"; do
  t=$(target_for "$tag"); name="jellyswipe-matrix"; cfg="$WORK/config-$tag"
  echo "=== Jellyfin $tag (plugin build $t)"
  "$DOTNET" build Jellyfin.Plugin.JellySwipe -c Release -p:JellyfinTarget="$t" -v quiet --nologo >/dev/null
  dll=$(ls artifacts/bin/"$t"/Release/*/Jellyfin.Plugin.JellySwipe.dll)
  rm -rf "$cfg"; mkdir -p "$cfg/plugins/JellySwipe"; cp "$dll" "$cfg/plugins/JellySwipe/"
  if url=$(ft_url "$tag") && [ -n "$url" ]; then
    mkdir -p "$cfg/plugins/FileTransformation" && curl -sfL "$url" -o "$WORK/ft.zip" && python3 -c 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$WORK/ft.zip" "$cfg/plugins/FileTransformation"
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -p "$PORT:8096" --user "$(id -u):$(id -g)" -v "$cfg:/config" \
    --tmpfs "/cache:uid=$(id -u),gid=$(id -g)" -v "$WORK/media:/media:ro" "jellyfin/jellyfin:$tag" >/dev/null
  U="http://localhost:$PORT"
  for _ in $(seq 1 90); do curl -sf -m 2 "$U/System/Info/Public" >/dev/null && break; sleep 2; done
  python3 dev/setup-server.py "$U"
  sleep 5
  inject=$(curl -s "$U/web/" | grep -c "JellySwipe/inject.js" || true)
  if JF_URL=$U JF_USER=admin JF_PASS=test python3 dev/smoke-test.py > "$WORK/smoke-$tag.log" 2>&1; then smoke=pass; else smoke=FAIL; fi
  errors=$(docker logs "$name" 2>&1 | grep -E "\[(ERR|FTL)\]" | grep -ci "jellyswipe\|FileTransformation" || true)
  docker logs "$name" > "$WORK/jellyfin-$tag.log" 2>&1
  RESULT[$tag]="smoke=$smoke  sidebar-inject=$inject  plugin-errors=$errors"
  echo "    ${RESULT[$tag]}"
  [ "$smoke" = pass ] || tail -5 "$WORK/smoke-$tag.log"
  docker rm -f "$name" >/dev/null
done
echo; echo "Summary"; for tag in "${TAGS[@]}"; do printf '  %-10s %s\n' "$tag" "${RESULT[$tag]}"; done
