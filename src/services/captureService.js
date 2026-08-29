/**
 * Screen capture engine.
 *
 * Primary mode: a global mouse-click listener (uiohook-napi) fires on every
 * left-click anywhere on the desktop while a capture session is active. Each
 * click triggers a full-screen screenshot (screenshot-desktop) and the click's
 * absolute screen coordinates are logged and handed off to imageService for
 * annotation.
 *
 * uiohook-napi requires a native prebuilt binary and, on macOS, Accessibility
 * permissions; on Linux it needs an X11 session (it will not see clicks under
 * pure Wayland) plus `scrot`/ImageMagick for screenshot-desktop. If the native
 * hook can't be loaded, global auto-capture is disabled and the app falls
 * back to manual "Capture Step Now" screenshots (see routes/capture.js),
 * where the user clicks directly on the captured image to place the marker.
 */
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const { v4: uuidv4 } = require('uuid');
const displayService = require('./displayService');

let uIOhook = null;
let UiohookKey = null;
let hookAvailable = false;
let hookLoadError = null;

try {
  ({ uIOhook } = require('uiohook-napi'));
  hookAvailable = true;
} catch (err) {
  hookLoadError = err.message;
}

class CaptureSession extends EventEmitter {
  constructor(tutorialId, imagesDir) {
    super();
    this.tutorialId = tutorialId;
    this.imagesDir = imagesDir;
    this.active = false;
    this.clickHandler = null;
    this.stepCount = 0;
    this.busy = false;
  }

  isHookAvailable() {
    return hookAvailable;
  }

  async takeScreenshot(screenId) {
    const filename = `raw-${Date.now()}-${uuidv4().slice(0, 8)}.png`;
    const filePath = path.join(this.imagesDir, filename);
    await fs.promises.mkdir(this.imagesDir, { recursive: true });
    const opts = { format: 'png' };
    if (screenId !== undefined) opts.screen = screenId;
    const imgBuffer = await screenshot(opts);
    await fs.promises.writeFile(filePath, imgBuffer);
    return { filename, filePath };
  }

  async captureClickStep(x, y) {
    if (this.busy) return null; // debounce overlapping clicks
    this.busy = true;
    try {
      // Route to whichever monitor the click actually happened on, and
      // translate the absolute click point into that monitor's own local
      // pixel space — annotation/cropping downstream all assume (x, y) are
      // local to the captured image, not the whole virtual desktop.
      const displays = await displayService.listDisplays();
      const display = displayService.findDisplayForPoint(displays, x, y);
      const { filename, filePath } = await this.takeScreenshot(display ? display.id : undefined);
      this.stepCount += 1;
      const localX = display ? x - display.x : x;
      const localY = display ? y - display.y : y;
      const event = {
        x: localX, y: localY, globalX: x, globalY: y,
        filename, filePath, order: this.stepCount, tutorialId: this.tutorialId
      };
      this.emit('step-captured', event);
      return event;
    } catch (err) {
      this.emit('error', err);
      return null;
    } finally {
      this.busy = false;
    }
  }

  start() {
    if (this.active) return;
    this.active = true;

    if (!hookAvailable) {
      this.emit('warning', `Global click capture unavailable (${hookLoadError}). Use manual "Capture Step Now" instead.`);
      return;
    }

    this.clickHandler = (e) => {
      // uiohook button 1 = left click. Captured on mousedown, not mouseup:
      // screenshot-desktop shells out to a separate process to grab the
      // screen, which takes real time (often a few hundred ms on
      // Windows). Capturing on mouseup — after the click has already been
      // dispatched to the target app — risks the screenshot landing after
      // whatever UI change the click triggered (a dialog closing, a view
      // navigating, a button's state updating), especially for buttons
      // whose entire purpose is to cause an immediate transition. Mousedown
      // captures the screen as it looked the instant the click began.
      if (e.button === 1) {
        this.captureClickStep(e.x, e.y);
      }
    };

    uIOhook.on('mousedown', this.clickHandler);
    try {
      uIOhook.start();
    } catch (err) {
      this.emit('warning', `Failed to start global hook: ${err.message}. Use manual capture instead.`);
    }
  }

  stop() {
    this.active = false;
    if (hookAvailable && this.clickHandler) {
      uIOhook.off('mousedown', this.clickHandler);
      try {
        uIOhook.stop();
      } catch {
        // already stopped
      }
      this.clickHandler = null;
    }
  }
}

// Only one active capture session at a time, keyed by tutorial id.
const sessions = new Map();

function startSession(tutorialId, imagesDir) {
  stopAllSessions();
  const session = new CaptureSession(tutorialId, imagesDir);
  sessions.set(tutorialId, session);
  session.start();
  return session;
}

function getSession(tutorialId) {
  return sessions.get(tutorialId) || null;
}

function stopSession(tutorialId) {
  const session = sessions.get(tutorialId);
  if (session) {
    session.stop();
    sessions.delete(tutorialId);
  }
}

function stopAllSessions() {
  for (const id of Array.from(sessions.keys())) {
    stopSession(id);
  }
}

async function manualCapture(imagesDir, screenId) {
  await fs.promises.mkdir(imagesDir, { recursive: true });
  const filename = `raw-${Date.now()}-${uuidv4().slice(0, 8)}.png`;
  const filePath = path.join(imagesDir, filename);
  const opts = { format: 'png' };
  if (screenId !== undefined) opts.screen = screenId;
  const imgBuffer = await screenshot(opts);
  await fs.promises.writeFile(filePath, imgBuffer);
  return { filename, filePath };
}

module.exports = {
  startSession,
  getSession,
  stopSession,
  stopAllSessions,
  manualCapture,
  listDisplays: displayService.listDisplays,
  isHookAvailable: () => hookAvailable,
  hookLoadError: () => hookLoadError
};
