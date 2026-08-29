/**
 * Simple filesystem-backed data store. Each tutorial lives in its own
 * directory under data/tutorials/<id>/ with a tutorial.json manifest and
 * an images/ subfolder holding raw + annotated screenshots.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Overridable so the Electron desktop build can redirect storage to
// Electron's per-user app-data folder (app.getPath('userData')) — the
// app's own install directory may be read-only (packed into an asar
// archive) or not writable without elevation.
const DATA_DIR = process.env.SCRIBE_DATA_DIR
  ? path.join(process.env.SCRIBE_DATA_DIR, 'tutorials')
  : path.join(__dirname, '..', '..', 'data', 'tutorials');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function tutorialDir(id) {
  return path.join(DATA_DIR, id);
}

function manifestPath(id) {
  return path.join(tutorialDir(id), 'tutorial.json');
}

function imagesDir(id) {
  return path.join(tutorialDir(id), 'images');
}

async function listTutorials() {
  ensureDataDir();
  const entries = await fsp.readdir(DATA_DIR, { withFileTypes: true });
  const tutorials = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const manifest = JSON.parse(await fsp.readFile(manifestPath(entry.name), 'utf-8'));
      tutorials.push({
        id: manifest.id,
        title: manifest.title,
        description: manifest.description,
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
        stepCount: (manifest.steps || []).length
      });
    } catch {
      // skip malformed/incomplete tutorial folders
    }
  }
  tutorials.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return tutorials;
}

async function createTutorial({ title, description }) {
  ensureDataDir();
  const id = uuidv4();
  const dir = tutorialDir(id);
  await fsp.mkdir(imagesDir(id), { recursive: true });
  const now = new Date().toISOString();
  const manifest = {
    id,
    title: title || 'Untitled Tutorial',
    description: description || '',
    createdAt: now,
    updatedAt: now,
    steps: []
  };
  await fsp.writeFile(manifestPath(id), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function getTutorial(id) {
  try {
    return JSON.parse(await fsp.readFile(manifestPath(id), 'utf-8'));
  } catch {
    return null;
  }
}

async function saveTutorial(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await fsp.writeFile(manifestPath(manifest.id), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function deleteTutorial(id) {
  const dir = tutorialDir(id);
  if (fs.existsSync(dir)) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function addStep(tutorialId, step) {
  const manifest = await getTutorial(tutorialId);
  if (!manifest) throw new Error('Tutorial not found');
  const order = manifest.steps.length + 1;
  const fullStep = {
    id: uuidv4(),
    order,
    title: step.title || `Step ${order}`,
    description: step.description || '',
    x: step.x,
    y: step.y,
    screenWidth: step.screenWidth,
    screenHeight: step.screenHeight,
    rawImage: step.rawImage,
    annotatedImage: step.annotatedImage,
    croppedImage: step.croppedImage || null,
    element: step.element || null,
    redactions: [],
    createdAt: new Date().toISOString()
  };
  manifest.steps.push(fullStep);
  await saveTutorial(manifest);
  return fullStep;
}

async function updateStep(tutorialId, stepId, updates) {
  const manifest = await getTutorial(tutorialId);
  if (!manifest) throw new Error('Tutorial not found');
  const step = manifest.steps.find((s) => s.id === stepId);
  if (!step) throw new Error('Step not found');
  Object.assign(step, updates);
  await saveTutorial(manifest);
  return step;
}

async function deleteStep(tutorialId, stepId) {
  const manifest = await getTutorial(tutorialId);
  if (!manifest) throw new Error('Tutorial not found');
  manifest.steps = manifest.steps.filter((s) => s.id !== stepId);
  manifest.steps.forEach((s, idx) => (s.order = idx + 1));
  await saveTutorial(manifest);
  return manifest;
}

async function reorderSteps(tutorialId, orderedStepIds) {
  const manifest = await getTutorial(tutorialId);
  if (!manifest) throw new Error('Tutorial not found');
  const byId = new Map(manifest.steps.map((s) => [s.id, s]));
  const reordered = orderedStepIds.map((id) => byId.get(id)).filter(Boolean);
  reordered.forEach((s, idx) => (s.order = idx + 1));
  manifest.steps = reordered;
  await saveTutorial(manifest);
  return manifest;
}

module.exports = {
  DATA_DIR,
  tutorialDir,
  imagesDir,
  listTutorials,
  createTutorial,
  getTutorial,
  saveTutorial,
  deleteTutorial,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps
};
