#!/usr/bin/env bash
# Builds the Scribe Local Electron desktop app for Windows: stages app
# source + Windows-native runtime binaries (same npm --os/--cpu cross-install
# trick as before — see electron/README.md for why this works without a
# Windows machine), then runs electron-builder to produce a Windows NSIS
# installer.
#
# electron/electron-builder themselves are installed in a SEPARATE,
# persistent tooling directory (electron/.tooling/), never inside the
# staged project — electron-builder's default `files: ["node_modules/**/*"]`
# handling does dependency-graph-based pruning that has known bugs dropping
# legitimately-needed transitive dependencies (hit this directly: express's
# own dependency chain lost `call-bind-apply-helpers`, crashing the app on
# startup). The fix is a `{from, to, filter}` node_modules entry (see
# package.json), which copies node_modules literally instead — but that
# means dev-only tooling must never be physically present in the staged
# node_modules in the first place, or it ships too.
#
# Requires: node/npm, and (only for the actual `electron-builder` step)
# wine + wine32:i386 on Linux hosts — needed to stamp exe version info /
# icons on the Windows binaries being produced. On Debian/Ubuntu:
#   sudo dpkg --add-architecture i386 && sudo apt-get update
#   sudo apt-get install -y wine64 wine32:i386
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Deliberately OUTSIDE the repo tree: Node's module resolution (which
# electron-builder relies on to verify the dependency graph) walks up
# parent directories looking for node_modules. If the staging dir were
# nested inside the repo (e.g. electron/.build/), it would find the repo
# root's own node_modules — which likely has host-platform (e.g. Linux)
# native binaries from ordinary `npm install`/`npm start` dev use — and
# pull those into the Windows build too. Hit this directly: Linux sharp
# binaries ended up in a Windows installer despite never being staged.
BUILD_DIR="${1:-${TMPDIR:-/tmp}/scribe-local-electron-build}"
TOOLING_DIR="$REPO_ROOT/electron/.tooling"

echo "== Cleaning build dir: $BUILD_DIR =="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/stage"

echo "== Copying app + electron source =="
cd "$REPO_ROOT"
for item in server.js src public scripts; do
  cp -r "$item" "$BUILD_DIR/stage/$item"
done
mkdir -p "$BUILD_DIR/stage/config"
cp config/settings.example.json "$BUILD_DIR/stage/config/"
mkdir -p "$BUILD_DIR/stage/electron"
cp electron/main.js electron/icon.png electron/tray-icon.png "$BUILD_DIR/stage/electron/"

echo "== Merging package.json (root dependencies + electron build config) =="
node -e "
const fs = require('fs');
const root = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf-8'));
const electron = JSON.parse(fs.readFileSync('$REPO_ROOT/electron/package.json', 'utf-8'));
delete electron._comment;
const merged = { ...electron, dependencies: root.dependencies };
fs.writeFileSync('$BUILD_DIR/stage/package.json', JSON.stringify(merged, null, 2));
"

echo "== Installing runtime dependencies only (Windows x64 native binaries) =="
cd "$BUILD_DIR/stage"
npm install --omit=dev --os=win32 --cpu=x64 --no-audit --no-fund

echo "== Installing build tooling (electron, electron-builder) — separate, persistent, never shipped =="
mkdir -p "$TOOLING_DIR"
if [ ! -f "$TOOLING_DIR/package.json" ]; then
  cat > "$TOOLING_DIR/package.json" <<'EOF'
{ "name": "scribe-local-electron-tooling", "private": true }
EOF
fi
if [ ! -d "$TOOLING_DIR/node_modules/electron-builder" ]; then
  (cd "$TOOLING_DIR" && npm install --no-audit --no-fund electron@^33.0.0 electron-builder@^25.1.8)
fi

echo "== Building Windows installer (electron-builder; can take a few minutes) =="
cd "$BUILD_DIR/stage"
"$TOOLING_DIR/node_modules/.bin/electron-builder" --win nsis --x64

echo "== Build complete =="
ls -la "$BUILD_DIR/stage/electron-dist/"*.exe
