#!/usr/bin/env bash
set -euo pipefail

# Void Meridian build script
# Inlines all CSS, JS, and JSON data into a single dist/index.html

SRC="src"
DIST="dist"
OUT="$DIST/index.html"

mkdir -p "$DIST"

# Start the HTML file
cat > "$OUT" << 'HTMLHEADER'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <title>VOID MERIDIAN</title>
  <style>
HTMLHEADER

# Inline CSS
for f in "$SRC"/css/theme.css "$SRC"/css/layout.css "$SRC"/css/components.css; do
  if [ -f "$f" ]; then
    cat "$f" >> "$OUT"
    echo "" >> "$OUT"
  fi
done

cat >> "$OUT" << 'HTMLMID'
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
HTMLMID

# Inline JSON data as JS variables (using cat to preserve content exactly)
for f in "$SRC"/data/*.json; do
  if [ -f "$f" ]; then
    basename=$(basename "$f" .json)
    varname="DATA_$(echo "$basename" | tr '[:lower:]' '[:upper:]')"
    echo "const $varname = " >> "$OUT"
    cat "$f" >> "$OUT"
    echo ";" >> "$OUT"
  fi
done

# Inline JS (order matters — dependencies first)
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
  "$SRC/js/ui/depot.js"
  "$SRC/js/ui/event.js"
  "$SRC/js/ui/crew.js"
  "$SRC/js/ui/log.js"
  "$SRC/js/ui/reconstruction.js"
  "$SRC/js/ui/combat.js"
  "$SRC/js/main.js"
)

for f in "${JS_FILES[@]}"; do
  if [ -f "$f" ]; then
    cat "$f" >> "$OUT"
    echo "" >> "$OUT"
  fi
done

# Close HTML
cat >> "$OUT" << 'HTMLEND'
  </script>
</body>
</html>
HTMLEND

# Copy to repo root for GitHub Pages
cp "$OUT" index.html

echo "Build complete: $OUT ($(wc -c < "$OUT") bytes)"
