#!/usr/bin/env bash
# Builds the Scribe Local Electron desktop app for Windows: stages app
# source + Windows-native binaries (same npm --os/--cpu cross-install
# trick as installer/build.sh — see its README for why this works without
# a Windows machine), merges dependency versions from the root
# package.json, then runs electron-builder to produce a Windows NSIS
# installer.
#
# Requires: node/npm, and (only for the actual `electron-builder` step)
# wine + wine32:i386 on Linux hosts — needed to stamp exe version info /
# icons on the Windows binaries being produced. On Debian/Ubuntu:
#   sudo dpkg --add-architecture i386 && sudo apt-get update
#   sudo apt-get install -y wine64 wine32:i386
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${1:-$REPO_ROOT/electron/.build}"

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
mkdir -p "$BUILD_DIR/stage/data/tutorials"
touch "$BUILD_DIR/stage/data/tutorials/.gitkeep"

echo "== Merging package.json (root dependencies + electron build config) =="
node -e "
const fs = require('fs');
const root = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf-8'));
const electron = JSON.parse(fs.readFileSync('$REPO_ROOT/electron/package.json', 'utf-8'));
delete electron._comment;
const merged = { ...electron, dependencies: root.dependencies };
fs.writeFileSync('$BUILD_DIR/stage/package.json', JSON.stringify(merged, null, 2));
"

echo "== Installing dependencies (Windows x64 native binaries + electron-builder) =="
cd "$BUILD_DIR/stage"
npm install --os=win32 --cpu=x64 --no-audit --no-fund

echo "== Building Windows installer (electron-builder; can take a few minutes) =="
npx electron-builder --win nsis --x64

echo "== Build complete =="
ls -la "$BUILD_DIR/stage/electron-dist/"*.exe
