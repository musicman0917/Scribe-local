# Scribe Local desktop app (Windows)

Packages Scribe Local as a real desktop app (`ScribeLocal-Desktop-Setup-<version>.exe`) instead of
running it via `npm start`/PM2/a Windows Service.

## Why not a Windows Service?

An earlier version of this installer registered Scribe Local as a Windows Service so it would
auto-start without a terminal window. That doesn't work for this app: Windows Services run in
**Session 0**, which is deliberately isolated from the interactive desktop — so screen capture
(`screenshot-desktop`) and the global click hook (`uiohook-napi`) get no real desktop to see,
producing blank/black screenshots and no captured clicks at all.

A normal desktop app — which is what this is — always runs attached to the real interactive
session, so capture works correctly. This embeds the existing Express + Socket.IO server
(`server.js`, unmodified) directly in Electron's main process and shows it in a window, giving the
server the same desktop access Electron itself has.

## Requirements (on the build machine — does NOT need to be Windows)

- Node.js 18+ / npm
- Internet access to `registry.npmjs.org`, `nodejs.org`, and GitHub (electron-builder downloads
  the Electron runtime + a couple of small helper binaries from GitHub Releases automatically)
- On Linux: `wine` + `wine32:i386`, needed by electron-builder to stamp version info/icons onto
  the Windows binaries it produces. On Debian/Ubuntu:
  ```bash
  sudo dpkg --add-architecture i386 && sudo apt-get update
  sudo apt-get install -y wine64 wine32:i386
  ```

Cross-compiling the native modules (`sharp`, `uiohook-napi`) for Windows from Linux/macOS works
the same way as the (now removed) NSIS installer did: both are N-API-based, so the exact same
prebuilt binary works across Node.js and Electron without a separate "Electron rebuild" — only the
right *platform* build needs fetching, via `npm install --os=win32 --cpu=x64`.

## Build

```bash
cd electron
./build.sh
```

Produces `electron/.build/stage/electron-dist/ScribeLocal-Desktop-Setup-<version>.exe`. The whole
`electron/.build/` staging directory and any built `.exe` are git-ignored — only the build source
(`main.js`, `build.sh`, `package.json`, icons) is committed.

## How it works

- `main.js` is the Electron main process. On startup it points `SCRIBE_DATA_DIR` /
  `SCRIBE_CONFIG_DIR` at Electron's per-user app-data folder (`app.getPath('userData')` — the
  app's own install directory isn't necessarily writable), then `require('../server.js')` to start
  the same Express/Socket.IO server used everywhere else, opens a window pointed at
  `http://localhost:3000`, and adds a system tray icon (closing the window minimizes to tray
  rather than quitting, so an active capture session keeps running).
- `app.setLoginItemSettings({ openAtLogin: true })` registers the app to start automatically at
  Windows login — Electron's built-in, cross-platform mechanism for this, no Task Scheduler/service
  wrangling needed.
- **`asar` packaging is disabled** (`"asar": false"` in `package.json`'s `build` config). Electron
  normally bundles the app into a single compressed `.asar` archive, but two things this app relies
  on can't work from inside one: `screenshot-desktop` compiles and runs a small C# helper via a
  spawned `csc.exe`/`.bat` process on first use, and the accessibility feature spawns
  `powershell.exe` against a `.ps1` file — both are *external* processes that need real files on
  disk, and have no idea how to read into an asar archive. Rather than fight that per-package,
  packaging everything as plain files sidesteps it entirely.
- `package.json` here is **not** a standalone manifest — `build.sh` merges it with the root
  `package.json`'s `dependencies` at build time, so runtime dependency versions can't drift out of
  sync with the plain Node build.

## Known limitations

- **Unsigned.** No code-signing certificate, so Windows SmartScreen will flag it on first run
  ("Windows protected your PC" → "More info" → "Run anyway").
- **Verified structurally, not run end-to-end on real Windows from this build environment** — no
  Windows machine or display here. The `.exe` was checked by extracting its actual payload (not
  just inspecting the NSIS wrapper) and confirming the right files land in the right places with
  Windows-native binaries, but the actual install → launch → capture flow needs a real run on
  Windows to fully confirm.
- Windows x64 only (not ARM64).
