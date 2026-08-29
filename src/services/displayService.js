/**
 * Multi-monitor support for capture.
 *
 * uiohook-napi reports click coordinates in absolute virtual-desktop space
 * (spanning every monitor), but screenshot-desktop only grabs one specific
 * display per call. Without routing, every capture just grabs whatever
 * screenshot-desktop calls the default display, regardless of which
 * monitor the click actually happened on.
 *
 * screenshot-desktop's Windows backend already exposes per-display bounds
 * (in that same absolute coordinate space) via listDisplays(), so this
 * finds which display a click falls in and lets the caller capture that
 * specific one, then translate the click into that display's local pixel
 * space for annotation/cropping.
 */
const screenshot = require('screenshot-desktop');

/**
 * List available displays with absolute-space bounds: { id, name, x, y,
 * width, height }. Resolves to [] if the platform/backend doesn't expose
 * bounds (or capture is unavailable) rather than throwing — callers should
 * treat an empty list as "no multi-monitor routing available" and fall
 * back to the default single-display capture.
 */
async function listDisplays() {
  try {
    const displays = await screenshot.listDisplays();
    return displays
      .filter((d) => typeof d.left === 'number' && typeof d.top === 'number')
      .map((d) => ({
        id: d.id,
        name: d.name || d.id,
        x: d.left,
        y: d.top,
        width: d.width,
        height: d.height
      }));
  } catch {
    return [];
  }
}

/**
 * Find which display's bounds contain an absolute point. Falls back to the
 * first display if the point is outside all of them (e.g. a monitor was
 * disconnected between the click and this lookup) rather than returning
 * null, so callers always get a usable capture target when at least one
 * display is known.
 */
function findDisplayForPoint(displays, x, y) {
  if (!displays || displays.length === 0) return null;
  const hit = displays.find(
    (d) => x >= d.x && x < d.x + d.width && y >= d.y && y < d.y + d.height
  );
  return hit || displays[0];
}

module.exports = { listDisplays, findDisplayForPoint };
