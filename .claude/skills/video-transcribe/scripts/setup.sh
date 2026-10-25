#!/usr/bin/env bash
# One-time setup: builds whisper.cpp and downloads models into a shared cache
# (outside the repo, since models are 0.5–1 GB each). Idempotent: re-running skips
# whatever already exists.
#
#   bash .claude/skills/video-transcribe/scripts/setup.sh [model …]
#
# Models default to large-v3-turbo-q5_0. Others: large-v3-q5_0 (no better than turbo
# on Persian in tests, 2.3× slower), medium-q5_0, small-q5_1, base-q5_1 … (any ggml-<name>.bin on
# huggingface.co/ggerganov/whisper.cpp).
set -euo pipefail

VERSION="${WHISPER_CPP_VERSION:-1.9.5}"
ROOT="${WHISPER_CPP_DIR:-$HOME/.cache/whisper.cpp}"
SRC="$ROOT/whisper.cpp-$VERSION"
MODELS="$ROOT/models"
mkdir -p "$ROOT" "$MODELS"
# nproc is GNU coreutils (Linux); macOS has sysctl instead.
JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"

if [[ ! -x "$SRC/build/bin/whisper-cli" ]]; then
  echo "▸ building whisper.cpp v$VERSION in $SRC"
  rm -rf "$SRC"
  git clone --depth 1 --branch "v$VERSION" https://github.com/ggml-org/whisper.cpp.git "$SRC"
  cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
  cmake --build "$SRC/build" -j"$JOBS" --config Release --target whisper-cli >/dev/null
fi
echo "✓ whisper-cli: $SRC/build/bin/whisper-cli"

fetch() { # <url> <dest>
  if [[ -s "$2" ]]; then echo "✓ $(basename "$2") (cached)"; return; fi
  echo "▸ downloading $(basename "$2")"
  # -C - resumes a previous .part (Hugging Face resets long transfers on slow links).
  for _ in 1 2 3 4 5; do
    curl -fL --retry 3 -C - -o "$2.part" "$1" && { mv "$2.part" "$2"; return; }
    echo "  transfer interrupted, resuming…"; sleep 3
  done
  echo "✗ failed to download $(basename "$2")" >&2; return 1
}

fetch "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin" "$MODELS/ggml-silero-v5.1.2.bin"
for m in "${@:-large-v3-turbo-q5_0}"; do
  fetch "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$m.bin" "$MODELS/ggml-$m.bin"
done
