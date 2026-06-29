#!/usr/bin/env bash
# Render an SVG to PNG at exact dimensions using Inkscape CLI.
# Usage: scripts/render-svg.sh <input.svg> <output.png> <width> <height>

set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <input.svg> <output.png> <width> <height>" >&2
  exit 64
fi

INPUT="$1"
OUTPUT="$2"
WIDTH="$3"
HEIGHT="$4"

if [[ ! -f "$INPUT" ]]; then
  echo "Input SVG not found: $INPUT" >&2
  exit 66
fi

mkdir -p "$(dirname "$OUTPUT")"

inkscape \
  --export-type=png \
  --export-filename="$OUTPUT" \
  --export-width="$WIDTH" \
  --export-height="$HEIGHT" \
  --export-background="#FAFAF7" \
  --export-background-opacity=1 \
  "$INPUT" >/dev/null 2>&1

if [[ ! -f "$OUTPUT" ]]; then
  echo "Render failed: $OUTPUT not produced" >&2
  exit 70
fi

echo "Rendered: $OUTPUT (${WIDTH}x${HEIGHT})"
