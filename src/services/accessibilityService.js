/**
 * OS accessibility integration for automatic step titles.
 *
 * On Windows, shells out to a small PowerShell script (scripts/win-element-at-point.ps1)
 * that uses .NET UI Automation (AutomationElement.FromPoint) — ships with Windows,
 * no extra install — to identify the named UI element under a click, so steps can
 * be titled "Click 'Save'" instead of a generic "Step 3".
 *
 * macOS/Linux equivalents (AXUIElementCopyElementAtPosition / AT-SPI) aren't wired
 * up yet; on those platforms this always resolves to null and callers fall back to
 * a generic title.
 */
const { execFile } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'win-element-at-point.ps1');
const TIMEOUT_MS = 4000;

function isAvailable() {
  return process.platform === 'win32';
}

/**
 * Best-effort lookup of the named UI element at (x, y) in absolute screen
 * coordinates. Resolves to null (never rejects) on any failure — an
 * unsupported OS, PowerShell/UIA errors, timeouts, or an element with no
 * accessible name.
 */
function describeElementAtPoint(x, y) {
  return new Promise((resolve) => {
    if (!isAvailable()) return resolve(null);

    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Sta',
        '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT_PATH,
        '-X', String(x),
        '-Y', String(y)
      ],
      { timeout: TIMEOUT_MS, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const parsed = JSON.parse((stdout || '').trim() || '{}');
          if (!parsed.name && !parsed.controlType) return resolve(null);
          resolve({
            name: parsed.name || null,
            controlType: parsed.controlType || null,
            className: parsed.className || null,
            automationId: parsed.automationId || null
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Build a default step title from a detected UI element, e.g.
 * `Step 3 - Click "Save"`. Falls back to a generic title when no element
 * name was found (unsupported OS, unlabeled control, lookup failure, etc).
 */
function buildDefaultTitle(order, elementInfo) {
  const name = elementInfo && elementInfo.name && elementInfo.name.trim();
  return name ? `Step ${order} - Click "${name}"` : `Step ${order} - Click`;
}

module.exports = { isAvailable, describeElementAtPoint, buildDefaultTitle };
