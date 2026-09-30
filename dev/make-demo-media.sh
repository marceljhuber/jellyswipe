#!/usr/bin/env bash
# Builds a demo library of public-domain and Creative-Commons films (tiny placeholder files;
# Jellyfin fetches the real metadata + posters from TMDb). Big Buck Bunny gets a real 10 s clip
# (CC-BY Blender Foundation) so "play on TV" shows actual video.
set -euo pipefail
OUT=${1:-.demo-media}
mkdir -p "$OUT/movies"
TINY="$OUT/.tiny.mp4"
[ -f "$TINY" ] || ffmpeg -loglevel error -f lavfi -i color=c=black:s=320x180:d=2 -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -c:v libx264 -c:a aac -shortest "$TINY"
BBB="$OUT/.bbb.mp4"
[ -f "$BBB" ] || curl -sfL -o "$BBB" https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4
while IFS= read -r title; do
  [ -z "$title" ] && continue
  mkdir -p "$OUT/movies/$title"
  src=$TINY; [[ $title == Big\ Buck\ Bunny* ]] && src=$BBB
  cp -n "$src" "$OUT/movies/$title/$title.mp4"
done <<'LIST'
Big Buck Bunny (2008)
Sintel (2010)
Tears of Steel (2012)
Elephants Dream (2006)
Cosmos Laundromat (2015)
Spring (2019)
Charge (2022)
Night of the Living Dead (1968)
Nosferatu (1922)
Metropolis (1927)
The General (1926)
His Girl Friday (1940)
Charade (1963)
The Kid (1921)
Sherlock Jr. (1924)
A Trip to the Moon (1902)
Plan 9 from Outer Space (1957)
Carnival of Souls (1962)
The Little Shop of Horrors (1960)
Detour (1945)
The Phantom of the Opera (1925)
The Cabinet of Dr. Caligari (1920)
LIST
echo "demo media in $OUT/movies ($(ls "$OUT/movies" | wc -l) titles)"
