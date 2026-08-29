#!/usr/bin/env bash
# Stages a full Windows-ready copy of Scribe Local (app + portable Node
# runtime + Windows-service registration scripts) for the NSIS installer to
# package. Must be run where npm can resolve --os/--cpu cross-platform
# optional dependencies (works from Linux/macOS — no Windows machine needed,
# see installer/README.md for how this works).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${1:-$REPO_ROOT/installer/.build}"
NODE_VERSION="22.23.2"

echo "== Cleaning build dir: $BUILD_DIR =="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/stage/app" "$BUILD_DIR/stage/service" "$BUILD_DIR/stage/runtime"

echo "== Copying app source =="
cd "$REPO_ROOT"
tar \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./installer' \
  --exclude='./data/tutorials/*' \
  --exclude='./config/settings.json' \
  -cf - . | (cd "$BUILD_DIR/stage/app" && tar -xf -)
mkdir -p "$BUILD_DIR/stage/app/data/tutorials"
touch "$BUILD_DIR/stage/app/data/tutorials/.gitkeep"

echo "== Installing app production dependencies (Windows x64 native binaries) =="
cd "$BUILD_DIR/stage/app"
npm install --omit=dev --os=win32 --cpu=x64 --no-audit --no-fund

echo "== Installing service-registration dependencies =="
cp "$REPO_ROOT/installer/service/"*.js "$BUILD_DIR/stage/service/"
cp "$REPO_ROOT/installer/service/package.json" "$BUILD_DIR/stage/service/"
cd "$BUILD_DIR/stage/service"
npm install --no-audit --no-fund
echo "3000" > "$BUILD_DIR/stage/service/port.txt"

echo "== Copying installer root templates (README, .bat helpers) =="
cp "$REPO_ROOT/installer/templates/"* "$BUILD_DIR/stage/"

echo "== Downloading portable Node.js runtime (Windows x64, v$NODE_VERSION) =="
cd "$BUILD_DIR"
NODE_ZIP="node-v${NODE_VERSION}-win-x64.zip"
if [ ! -f "$NODE_ZIP" ]; then
  curl -sSL -o "$NODE_ZIP" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}"
fi
rm -rf "node-v${NODE_VERSION}-win-x64"
unzip -q "$NODE_ZIP"
cp "node-v${NODE_VERSION}-win-x64/node.exe" "stage/runtime/node.exe"

echo "== Stage complete =="
du -sh "$BUILD_DIR/stage"
echo "$BUILD_DIR/stage"
