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

Produces `/tmp/scribe-local-electron-build/stage/electron-dist/ScribeLocal-Desktop-Setup-<version>.exe`
(override the location with `./build.sh <dir>`). The staging directory is deliberately **outside**
the repo tree — see "Two real bugs" below for why. `electron/.tooling/` (electron + electron-builder
themselves, installed once and reused across builds) and any built `.exe` are git-ignored; only the
build source (`main.js`, `build.sh`, `package.json`, icons) is committed.

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

## Two real bugs hit while building this, and the fixes

1. **electron-builder's default `files: ["node_modules/**/*"]` handling silently dropped a
   legitimately-needed transitive dependency** (`call-bind-apply-helpers`, several hops deep under
   `express`), crashing the app on startup with `Cannot find module 'call-bind-apply-helpers'` —
   even though it was correctly present in the staged `npm install` output. electron-builder does
   its own dependency-graph-based pruning rather than a literal copy, and it has known gaps. Fixed
   by giving it a `{from: "node_modules", to: "node_modules", filter: ["**/*"]}` object-form entry
   in `files` instead of a plain glob string — this makes it copy `node_modules` literally.
   **This means build tooling (electron, electron-builder) must never be physically present in the
   staged project's `node_modules`**, or it ships too (confirmed: it did, ballooning the installer
   from ~95MB to ~245MB) — hence installing them in the separate `electron/.tooling/` directory and
   invoking electron-builder's binary from there against the staged project.
2. **Node's module resolution walks up parent directories looking for `node_modules`.** Staging
   inside the repo (`electron/.build/`, nested under the repo root) meant electron-builder could see
   — and pull in — the *repo root's own* `node_modules`, which has host-platform (Linux, in this
   project's case) native binaries from ordinary `npm install`/`npm start` dev use. Confirmed: Linux
   `sharp` binaries ended up bundled in a Windows-only installer. Fixed by staging **outside** the
   repo tree entirely (`/tmp/...` by default) so there's no parent `node_modules` to find.

Both were caught here — not by running the installer, which this build environment can't do — by
extracting the actual NSIS payload (`7z x` on the embedded `app-64.7z`, not just listing the NSIS
wrapper) and directly checking which files it contains, before and after each fix.

## Known limitations

- **Unsigned.** No code-signing certificate, so Windows SmartScreen will flag it on first run
  ("Windows protected your PC" → "More info" → "Run anyway").
- **Verified structurally, not run end-to-end on real Windows from this build environment** — no
  Windows machine or display here. The `.exe` was checked by extracting its actual payload (not
  just inspecting the NSIS wrapper) and confirming the right files land in the right places with
  Windows-native binaries, but the actual install → launch → capture flow needs a real run on
  Windows to fully confirm.
- Windows x64 only (not ARM64).
- **Install location affects `screenshot-desktop`.** `nsis.perMachine` is set to `false` (per-user
  install, no admin needed, defaults to `%LOCALAPPDATA%\Programs\`) — but the installer wizard lets
  the user override this, and choosing an "all users" / Program Files install means
  `screenshot-desktop`'s Windows backend (which compiles a small C# helper into its own
  `node_modules` folder the first time it's used) needs write access there, which normally requires
  running elevated. If capture fails specifically on a Program-Files install, that's the likely
  cause — either reinstall to the default per-user location, or run the app as Administrator.
