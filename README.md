# Scribe Local

A lightweight, self-hosted, open-source alternative to Scribehow for building step-by-step software tutorials — capture clicks, auto-annotate screenshots, describe steps with a local Ollama vision model, redact sensitive info, and export to Markdown, HTML, or PDF. Everything runs on your own machine; nothing is uploaded anywhere.

---

## ⚠️ Security & Compliance Notice — Read Before Use

**This software is NOT safe or compliant for capturing, storing, or processing financial data, Protected Health Information (PHI), or any HIPAA-regulated data.**

Scribe Local is a local productivity tool, not a compliance-audited system. Specifically:

- Screenshots are captured **system-wide** and saved to disk **unencrypted**, in plain PNG files under `data/tutorials/`.
- The built-in blur/black-out redaction tool is a **manual, best-effort visual aid** — it is not a certified data-loss-prevention or de-identification tool, and mistakes (missed regions, redacting the wrong frame, etc.) are entirely possible.
- If Ollama integration is enabled, screenshots are sent to your **local** Ollama instance over HTTP. This stays on your machine by default, but if you point `OLLAMA_HOST` at a remote or cloud endpoint, image data will leave your machine.
- There is no authentication, encryption-at-rest, access control, or audit logging in this project. Anyone with access to the host machine (or, if you expose the server beyond `localhost`, anyone on your network) can read captured tutorials.

**Do not use this tool to capture screens containing payment card data (PCI), bank account details, health records, Social Security numbers, credentials you don't own, or any other regulated or sensitive personal data.** Always review every captured screenshot before exporting or sharing a tutorial, and use the redaction tool proactively on anything that looks like a password, API key, stream key, token, or personal identifier. You are solely responsible for what you capture, store, and export with this tool.

---

## Features

- **Local capture engine** — a global click listener (via `uiohook-napi`) records every left-click's absolute screen coordinates and triggers a full-screen screenshot (`screenshot-desktop`), so you just click through your workflow and the tutorial builds itself. A **manual capture fallback** ("Capture Step Now") is included for systems where global hooking isn't available (e.g. Wayland on Linux, or missing accessibility permissions on macOS) — it takes an instant screenshot and lets you click on it to place the marker.
- **Automatic click annotation** — every screenshot is stamped with a semi-transparent yellow target circle centered exactly on the click, plus a solid numbered badge (1, 2, 3…) showing workflow order, using `sharp` for fast server-side image compositing.
- **Automatic step titles (Windows)** — on Windows, each captured click is looked up against the OS's UI Automation tree, so steps are titled `Click "Save"` instead of a generic `Step 3`, with zero extra setup. Not yet implemented on macOS/Linux (falls back to a generic title there); toggle it off in Settings if you'd rather title steps manually or via Auto-Describe.
- **Local Ollama integration** —
  - **Smart Crop**: sends the annotated screenshot + click coordinates to a vision model (e.g. `llava`, `llama3.2-vision`) running in your local Ollama, asking it to return a tight bounding box around the clicked UI element, then crops to it automatically (falling back to a fixed-size crop around the click point if the model's response can't be parsed).
  - **Auto-Describe**: sends the cropped/annotated step image back to Ollama to generate a professional, instructional title and description for that step.
  - Fully configurable from the in-app **Settings** page (Ollama host, model name, connection test).
- **Step review & editing workspace** — a drag-and-reorder timeline of every captured step, with inline title/description editing (autosaved) and one-click delete.
- **Redaction tool** — click-and-drag directly on any screenshot to draw a box over sensitive info (stream keys, passwords, API tokens, personal data) and apply either a heavy Gaussian blur or a solid black-out, baked permanently into the image before export.
- **Export** — Markdown (zipped with an `images/` folder), a self-contained printable HTML report (images embedded as base64, print-friendly CSS), and a professionally formatted PDF (via `pdfkit`), all generated on demand from the tutorial you've edited.
- **Modern UI** — a clean, responsive interface built with Tailwind CSS, served as static assets (no frontend build step required to run the app — a compiled CSS bundle ships in the repo).

## How it works (architecture)

```
scribe-local/
├── server.js                 # Express + Socket.IO entrypoint
├── src/
│   ├── config.js              # reads/writes config/settings.json
│   ├── routes/                # tutorials, capture, settings, ollama, export, redact
│   ├── services/
│   │   ├── store.js           # filesystem-backed tutorial/step persistence
│   │   ├── captureService.js  # global click hook + screenshot capture
│   │   ├── imageService.js    # sharp: click annotation, cropping, redaction
│   │   ├── ollamaService.js   # Ollama HTTP client: smart-crop + describe
│   │   └── exportService.js   # Markdown / HTML / PDF generation
├── public/                    # static frontend (Tailwind CSS + vanilla JS)
├── data/tutorials/<id>/       # per-tutorial manifest (JSON) + images/
└── config/settings.json       # Ollama + annotation style config (git-ignored)
```

Captured steps are streamed to the browser in real time over a Socket.IO connection as they're recorded, so the timeline fills in live while you work through your software.

## Prerequisites

- **Node.js 18+** and npm
- **A desktop environment with a display** (this app captures your actual screen — it won't do anything useful in a headless/CI environment)
- **Linux only:** a screenshot backend for `screenshot-desktop` — install `scrot` or ImageMagick:
  ```bash
  sudo apt-get install scrot
  ```
  Global click capture (`uiohook-napi`) requires an **X11** session; it does not currently see clicks under a pure Wayland session.
- **macOS only:** grant your terminal/Node **Accessibility** and **Screen Recording** permissions under *System Settings → Privacy & Security* the first time you start capturing.
- **Windows:** works out of the box; no extra system packages needed.
- *(Optional but recommended)* **[Ollama](https://ollama.com)** installed locally, with a vision-capable model pulled, for Smart Crop and Auto-Describe:
  ```bash
  ollama pull llava
  # or: ollama pull llama3.2-vision
  ollama serve
  ```
  The app works fine without Ollama running — you'll just edit titles/descriptions manually and use the click point (with a default-sized crop) instead of the AI bounding box.

## Setup

```bash
git clone <this-repo>
cd scribe-local
npm install
```

This installs everything, including the native modules `sharp` (image processing), `screenshot-desktop`, and `uiohook-napi` (global click hook) — the latter two need a real OS with a display to actually function at runtime, even though they'll install fine anywhere.

The Tailwind CSS bundle (`public/css/tailwind.css`) is pre-built and committed, so no frontend build step is required to run the app. If you edit the Tailwind classes in `public/**/*.html` or `public/js/**/*.js`, rebuild it with:

```bash
npm run build:css        # one-off build
npm run watch:css        # rebuild on change, while developing
```

## Running the server

```bash
npm start
```

Then open **http://localhost:3000** in your browser.

For development with auto-restart on backend changes:

```bash
npm run dev
```

You can change the port with the `PORT` environment variable:

```bash
PORT=4000 npm start
```

## Using Scribe Local

1. **Create a tutorial** from the dashboard (e.g. "How to Start Streaming in OBS Studio").
2. Inside the editor, click **Start Capturing** to begin the global click listener, then go perform the workflow you want to document in the target application (OBS Studio, etc.) — every left-click is captured as a numbered, annotated step automatically. Click **Stop Capturing** when you're done.
   - If global capture isn't available on your system, use **Capture Step Now** instead: it takes an immediate screenshot and lets you click on it to place the step marker manually.
3. For each step, optionally click **Smart Crop** to have Ollama tighten the screenshot around the clicked element, and **Auto-Describe** to have it write a title and description for you.
4. Edit any step's title/description inline, drag steps to reorder them, or delete steps you don't need.
5. Use **Redact** on any step to drag a box over sensitive information (stream keys, passwords, tokens, personal data) and apply a blur or black-out before export.
6. Click **Export** and choose **Markdown**, **HTML**, or **PDF**.

## Configuration

Open **Settings** in the app to configure:

- **Ollama host** (default `http://localhost:11434`) and **vision model** (default `llava`), with a one-click connection test.
- **Click annotation style** — the highlight circle's fill/stroke colors and the number badge's colors.

Settings are persisted to `config/settings.json` (git-ignored; seeded from `config/settings.example.json` on first run).

## Tech stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express, Socket.IO |
| Screen capture | `uiohook-napi` (global click hook), `screenshot-desktop` |
| Image processing | `sharp` (SVG overlay compositing, cropping, blur/blackout redaction) |
| Local AI | Ollama HTTP API (`/api/generate`) with a vision model |
| Export | `archiver` (Markdown+images zip), `pdfkit` (PDF) |
| Frontend | Vanilla JS, Tailwind CSS |
| Storage | Flat-file JSON manifests + PNGs under `data/tutorials/` (no database) |

## Automatic step titles on Windows

When a step is captured on Windows, Scribe Local spawns a small bundled PowerShell script
(`scripts/win-element-at-point.ps1`) that uses .NET's UI Automation client (`AutomationElement.FromPoint`)
to identify the named control under the click — no extra install required, it ships with Windows. The
resulting title looks like `Click "Start Streaming"` instead of a generic `Step 4`.

A few things to know:
- This adds a small amount of latency per click (a PowerShell process spin-up, typically well under a second) — it's applied after the screenshot, so it doesn't slow down the capture itself.
- If the app you're clicking in is **running elevated (as Administrator)** and Scribe Local/PM2 isn't, UI Automation generally can't inspect its elements, and titles will fall back to generic. Run the server elevated too if you need this for an elevated app.
- You can disable it in **Settings → Automatic Step Titles** if you'd rather title steps manually or exclusively via Auto-Describe.
- Not implemented yet on macOS (Accessibility API) or Linux (AT-SPI2) — contributions welcome.

## Troubleshooting

- **"Global click capture unavailable"** — shown when `uiohook-napi` fails to load or start (missing native binary for your platform/Node version, no display, or a Wayland session on Linux). Use **Capture Step Now** (manual mode) instead; everything else in the app works identically.
- **Screenshots fail on Linux** — install `scrot` (`sudo apt-get install scrot`) or ImageMagick.
- **Ollama features fail / "Connection refused"** — make sure `ollama serve` is running and reachable at the host configured in Settings, and that you've pulled a vision-capable model.
- **Smart Crop returns an odd/wrong region** — some smaller vision models struggle to return precise bounding boxes; Scribe Local automatically falls back to a fixed-size crop centered on the click point if the model's response can't be parsed. Try a larger/more capable vision model for better results.

## License

MIT
