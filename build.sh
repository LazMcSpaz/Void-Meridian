#!/usr/bin/env bash
set -euo pipefail

# Void Meridian build script
# Inlines all CSS, JS, and JSON data into a single dist/index.html

SRC="src"
DIST="dist"
OUT="$DIST/index.html"

mkdir -p "$DIST"

# Collect CSS
CSS=""
for f in "$SRC"/css/theme.css "$SRC"/css/layout.css "$SRC"/css/components.css; do
  if [ -f "$f" ]; then
    CSS="$CSS$(cat "$f")\n"
  fi
done

# Collect JSON data — embed as JS variables
DATA_JS=""
for f in "$SRC"/data/*.json; do
  if [ -f "$f" ]; then
    basename=$(basename "$f" .json)
    varname="DATA_$(echo "$basename" | tr '[:lower:]' '[:upper:]')"
    DATA_JS="${DATA_JS}const $varname = $(cat "$f");\n"
  fi
done

# Collect JS (order matters — dependencies first)
JS_FILES=(
  "$SRC/js/state.js"
  "$SRC/js/registry.js"
  "$SRC/js/engine/mapgen.js"
  "$SRC/js/engine/events.js"
  "$SRC/js/engine/combat.js"
  "$SRC/js/engine/economy.js"
  "$SRC/js/engine/crew.js"
  "$SRC/js/engine/ship.js"
  "$SRC/js/engine/nexus.js"
  "$SRC/js/ui/overlay.js"
  "$SRC/js/ui/tabs.js"
  "$SRC/js/ui/map.js"
  "$SRC/js/ui/event.js"
  "$SRC/js/ui/crew.js"
  "$SRC/js/ui/log.js"
  "$SRC/js/ui/reconstruction.js"
  "$SRC/js/ui/combat.js"
  "$SRC/js/main.js"
)

JS=""
for f in "${JS_FILES[@]}"; do
  if [ -f "$f" ]; then
    JS="$JS$(cat "$f")\n"
  fi
done

# Build the single HTML file
cat > "$OUT" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <title>VOID MERIDIAN</title>
  <style>
$(printf '%b' "$CSS")
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
$(printf '%b' "$DATA_JS")
$(printf '%b' "$JS")
  </script>
</body>
</html>
HTMLEOF

echo "Build complete: $OUT ($(wc -c < "$OUT") bytes)"
