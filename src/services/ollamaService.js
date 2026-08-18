/**
 * Local Ollama integration for smart cropping and instructional
 * title/description generation using a vision-capable model
 * (e.g. llava, llama3.2-vision, bakllava).
 */
const axios = require('axios');
const { getSettings } = require('../config');

function client(overrideHost) {
  const { ollama } = getSettings();
  const host = overrideHost || ollama.host;
  return axios.create({
    baseURL: host,
    timeout: ollama.timeoutMs || 60000
  });
}

async function testConnection(host) {
  try {
    const api = client(host);
    const res = await api.get('/api/tags');
    const models = (res.data.models || []).map((m) => m.name);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

function describeError(err) {
  if (err.code === 'ECONNREFUSED') {
    return 'Connection refused. Is Ollama running (ollama serve)?';
  }
  if (err.response) {
    return `Ollama returned HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
  }
  return err.message || 'Unknown error contacting Ollama';
}

/**
 * Extract the first {...} JSON object found in a model's free-text reply.
 * Vision models frequently wrap JSON in prose or markdown fences.
 */
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Ask the vision model to tighten a bounding box around the UI element
 * near the center of an already-cropped sub-image.
 *
 * Deliberately does NOT ask the model to locate the click itself — general
 * vision-language models aren't trained for spatial "grounding" (pointing
 * to a specific screen location from a text prompt) and are unreliable at
 * it, especially on a full, busy desktop screenshot. Instead, the caller
 * crops a generous, *deterministic* region centered on the real (known)
 * click coordinate first, and this only asks the model to find the
 * specific element near the middle of that much smaller image — a far
 * easier, more reliable task. Coordinates in the response are relative
 * (0-1) to the sub-image, not the original screenshot.
 */
async function smartCrop({ imageBase64, width, height, model }) {
  const { ollama } = getSettings();

  const prompt = `You are looking at a small, zoomed-in crop taken from a screenshot, ${width}x${height} pixels. It was cropped so the user's mouse click is at approximately the center of this image.
Identify the single UI element (button, menu item, field, icon, panel) at or nearest to the center of this image — not elsewhere in the image.
Respond with ONLY a JSON object, no prose, no markdown, in exactly this shape:
{"x0": <float 0-1>, "y0": <float 0-1>, "x1": <float 0-1>, "y1": <float 0-1>}
where (x0,y0) is the top-left and (x1,y1) is the bottom-right of a tight bounding box around that element, relative to THIS image, with a little padding. All four values must be between 0 and 1.`;

  const api = client();
  let res;
  try {
    res = await api.post('/api/generate', {
      model: model || ollama.visionModel,
      prompt,
      images: [imageBase64],
      stream: false,
      options: { temperature: 0.1 }
    });
  } catch (err) {
    throw new Error(describeError(err));
  }

  const parsed = extractJson(res.data.response);
  if (
    !parsed ||
    [parsed.x0, parsed.y0, parsed.x1, parsed.y1].some((v) => typeof v !== 'number' || Number.isNaN(v))
  ) {
    throw new Error('Could not parse a bounding box from the Ollama response');
  }

  const clamp = (v) => Math.max(0, Math.min(1, v));
  return {
    x0: clamp(Math.min(parsed.x0, parsed.x1)),
    y0: clamp(Math.min(parsed.y0, parsed.y1)),
    x1: clamp(Math.max(parsed.x0, parsed.x1)),
    y1: clamp(Math.max(parsed.y0, parsed.y1))
  };
}

/**
 * Ask the vision model to write an instructional title + description for
 * a (cropped, annotated) step screenshot.
 */
async function describeStep({ imageBase64, context, model }) {
  const { ollama } = getSettings();

  const prompt = `You are writing a step in a software how-to tutorial, similar to Scribehow. Look CAREFULLY at this screenshot, which highlights (with a yellow circle) the exact UI element the user clicked.${context ? ` Additional context: ${context}.` : ''}
Base your answer entirely on the specific text, icon, and label you can actually see inside or right next to the yellow circle in THIS image. Do not guess or invent a plausible-sounding button name — name the real one shown.
Respond with ONLY a JSON object, no prose, no markdown, in exactly this shape:
{"title": "<a short, imperative title naming the specific element visible in the circle, formatted as: Click the '<exact visible label>' <element type>>", "description": "<one or two clear, professional sentences describing what the user should do and why, written for a tutorial reader who has never used this software, referencing only what is actually visible>"}`;

  const api = client();
  let res;
  try {
    res = await api.post('/api/generate', {
      model: model || ollama.visionModel,
      prompt,
      images: [imageBase64],
      stream: false,
      options: { temperature: 0.4 }
    });
  } catch (err) {
    throw new Error(describeError(err));
  }

  const parsed = extractJson(res.data.response);
  if (!parsed || !parsed.title) {
    return {
      title: 'Untitled step',
      description: (res.data.response || '').trim().slice(0, 500)
    };
  }
  return {
    title: String(parsed.title).slice(0, 200),
    description: String(parsed.description || '').slice(0, 1000)
  };
}

module.exports = { testConnection, smartCrop, describeStep, extractJson };
