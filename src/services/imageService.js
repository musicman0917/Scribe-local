/**
 * Image processing pipeline built on sharp.
 *
 * - annotateClick(): overlays a semi-transparent yellow "click target" circle
 *   plus a sequential number badge, centered on the recorded click coordinates.
 * - cropToRegion(): crops an image to a bounding box (used for Ollama smart-crop).
 * - applyRedactions(): pixelates/blurs or blacks-out rectangular regions of an
 *   image for confidential data (stream keys, passwords, tokens, etc).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const CIRCLE_RADIUS = 34;

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the SVG overlay for a single click annotation: a semi-transparent
 * yellow circle centered on (x, y) with a solid numbered badge on its edge.
 */
function buildClickOverlaySvg({ x, y, width, height, order, highlightColor, highlightStroke, badgeColor, badgeTextColor }) {
  const badgeRadius = 16;
  const badgeX = x + CIRCLE_RADIUS * 0.72;
  const badgeY = y - CIRCLE_RADIUS * 0.72;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <circle cx="${x}" cy="${y}" r="${CIRCLE_RADIUS}"
    fill="${highlightColor}" stroke="${highlightStroke}" stroke-width="3"
    filter="url(#softShadow)" />
  <circle cx="${x}" cy="${y}" r="4" fill="${highlightStroke}" />
  <circle cx="${badgeX}" cy="${badgeY}" r="${badgeRadius}"
    fill="${badgeColor}" stroke="#ffffff" stroke-width="2" filter="url(#softShadow)" />
  <text x="${badgeX}" y="${badgeY}" text-anchor="middle" dominant-baseline="central"
    font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700"
    fill="${badgeTextColor}">${escapeXml(order)}</text>
</svg>`;
}

/**
 * Composite a numbered, semi-transparent yellow click-target circle onto a
 * screenshot at (x, y) and write the result to outputPath.
 */
async function annotateClick({ inputPath, outputPath, x, y, order, style = {} }) {
  const highlightColor = style.highlightColor || 'rgba(255, 214, 0, 0.35)';
  const highlightStroke = style.highlightStroke || 'rgba(255, 179, 0, 0.9)';
  const badgeColor = style.badgeColor || '#111827';
  const badgeTextColor = style.badgeTextColor || '#ffffff';

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  const svg = buildClickOverlaySvg({
    x, y, width, height, order, highlightColor, highlightStroke, badgeColor, badgeTextColor
  });

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return { width, height };
}

/**
 * Crop an image to a bounding box. Box values may be fractional (0-1,
 * relative to image size, as commonly returned by vision models) or
 * absolute pixels; both are supported via the `relative` flag.
 */
async function cropToRegion({ inputPath, outputPath, box, relative = false, padding = 24 }) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  let { x0, y0, x1, y1 } = box;
  if (relative) {
    x0 *= imgW; y0 *= imgH; x1 *= imgW; y1 *= imgH;
  }

  x0 = Math.max(0, Math.min(imgW, x0) - padding);
  y0 = Math.max(0, Math.min(imgH, y0) - padding);
  x1 = Math.min(imgW, Math.max(x1, x0 + 1) + padding);
  y1 = Math.min(imgH, Math.max(y1, y0 + 1) + padding);

  const left = Math.round(x0);
  const top = Math.round(y0);
  const cropWidth = Math.max(1, Math.round(x1 - x0));
  const cropHeight = Math.max(1, Math.round(y1 - y0));

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await image
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toFile(outputPath);

  return { left, top, width: cropWidth, height: cropHeight };
}

/**
 * A safe, deterministic fallback crop centered on a click point, used when
 * Ollama is unavailable or returns an unparsable bounding box.
 */
function fallbackBoxAroundPoint(x, y, boxSize = 420) {
  const half = boxSize / 2;
  return { x0: x - half, y0: y - half, x1: x + half, y1: y + half };
}

/**
 * Apply redaction rectangles (blur or solid black-out) to an image. Each
 * rect: { x, y, width, height, mode: 'blur' | 'blackout' }.
 */
async function applyRedactions({ inputPath, outputPath, rects }) {
  if (!rects || rects.length === 0) {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.copyFile(inputPath, outputPath);
    return;
  }

  const base = sharp(inputPath);
  const metadata = await base.metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const composites = [];

  for (const rect of rects) {
    const left = Math.max(0, Math.round(rect.x));
    const top = Math.max(0, Math.round(rect.y));
    const width = Math.max(1, Math.min(imgW - left, Math.round(rect.width)));
    const height = Math.max(1, Math.min(imgH - top, Math.round(rect.height)));
    if (width <= 0 || height <= 0) continue;

    if (rect.mode === 'blackout') {
      const blackSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#000000" />
      </svg>`;
      composites.push({ input: Buffer.from(blackSvg), left, top });
    } else {
      // Blur: extract the region, heavily blur it, and paste it back.
      const blurredRegion = await sharp(inputPath)
        .extract({ left, top, width, height })
        .blur(24)
        .toBuffer();
      composites.push({ input: blurredRegion, left, top });
    }
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath).composite(composites).png().toFile(outputPath);
}

/**
 * Read an image file and return it as a base64 data URI (for Ollama's
 * vision payload or for inlining into self-contained HTML exports).
 */
async function toBase64DataUri(imagePath) {
  const buffer = await fs.promises.readFile(imagePath);
  const ext = path.extname(imagePath).replace('.', '') || 'png';
  return `data:image/${ext};base64,${buffer.toString('base64')}`;
}

async function toBase64Raw(imagePath) {
  const buffer = await fs.promises.readFile(imagePath);
  return buffer.toString('base64');
}

module.exports = {
  CIRCLE_RADIUS,
  annotateClick,
  cropToRegion,
  fallbackBoxAroundPoint,
  applyRedactions,
  toBase64DataUri,
  toBase64Raw
};
