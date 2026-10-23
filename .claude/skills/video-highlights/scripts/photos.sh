#!/usr/bin/env bash
# Labelled contact sheet of photos, to choose which to use and where their focus point
# is (for 9:16 crops). Prints each photo's size.
#
#   bash .claude/skills/video-highlights/scripts/photos.sh <out.png> <photo> [photo …]
set -euo pipefail
out="$1"; shift
font="$(fc-match -f '%{file}' 'sans:bold' 2>/dev/null || true)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
i=0
for f in "$@"; do
  i=$((i + 1))
  printf '%s' "$(basename "$f")" > "$tmp/label-$i.txt"
  draw=""; [[ -n "$font" ]] && draw=",drawtext=fontfile=$font:textfile=$tmp/label-$i.txt:x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6"
  ffmpeg -v error -y -i "$f" -vf "scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2:color=0x202020$draw" "$tmp/$(printf '%03d' $i).png"
  echo "$(basename "$f") $(ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "$f")"
done
cols=$(( i < 5 ? i : 5 )); rows=$(( (i + 4) / 5 ))
ffmpeg -v error -y -framerate 1 -i "$tmp/%03d.png" -vf "tile=${cols}x${rows}:padding=4:color=0x202020" "$out"
echo "→ $out"
