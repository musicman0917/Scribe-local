# Building the Windows installer

Produces `ScribeLocal-Setup-<version>.exe` — a self-contained Windows
installer that bundles a portable Node.js runtime, the app with Windows
native binaries (sharp, uiohook-napi), and registers Scribe Local as an
auto-starting Windows Service (via [node-windows](https://www.npmjs.com/package/node-windows),
which wraps [WinSW](https://github.com/winsw/winsw)) — no PM2, no manually
running `npm start`, no terminal window.

## Requirements (on the build machine — does NOT need to be Windows)

- Node.js 18+ / npm (same as running the app itself)
- [NSIS](https://nsis.sourceforge.io/) (`makensis` on PATH) — on Debian/Ubuntu: `sudo apt-get install nsis`
- Internet access to `registry.npmjs.org` and `nodejs.org`

Cross-compiling native modules for Windows from Linux/macOS works because
npm supports installing platform-specific optional dependencies for a
*different* target platform via `--os=win32 --cpu=x64` — both `sharp`
(via its `@img/sharp-win32-x64` optional dependency) and `uiohook-napi`
(which ships prebuilt binaries for every platform inside the package
itself) support this without needing an actual Windows machine or any
native compilation.

## Build

```bash
cd installer
./build.sh                          # stages everything into installer/.build/stage
makensis -DSTAGE_DIR="$(pwd)/.build/stage" -DAPP_VERSION="1.0.0" installer.nsi
```

Produces `installer/ScribeLocal-Setup-1.0.0.exe`. Both the staging
directory and the built `.exe` are git-ignored — only the build scripts
themselves are committed.

## How it's laid out on the target machine

```
C:\Program Files\Scribe Local\
  app\                    the application (same as the repo root, minus dev deps)
    server.js, src\, public\, node_modules\ (Windows binaries), data\tutorials\, config\
  runtime\
    node.exe              portable Node runtime — nothing else needs to be installed
  service\
    install-service.js    registers + starts the Windows Service (run at install time)
    uninstall-service.js  stops + removes it (run at uninstall time)
    restart-service.js    re-registers to pick up port.txt changes ("Restart Service.bat")
    port.txt              just a number, default 3000 — edit + restart to change
    node_modules\node-windows\   bundles WinSW itself, no separate download needed
  OpenScribeLocal.bat      opens the dashboard in the default browser
  RestartService.bat
  README.txt
  Uninstall.exe            written by NSIS at install time
```

## Known limitations

- **Unsigned.** There's no code-signing certificate, so Windows SmartScreen
  will flag the installer on first run ("Windows protected your PC" →
  "More info" → "Run anyway"). This is expected, not a sign of a broken
  build.
- **Not tested end-to-end on real Windows from this environment** — the
  build environment has no Windows machine or display, so the `.exe` is
  verified structurally (valid PE binary, correct file layout via `7z l`)
  but the actual install/service-registration/service-start flow needs a
  real run on Windows to confirm.
- Bundles prebuilt binaries for `win32-x64` only (not ARM64).
