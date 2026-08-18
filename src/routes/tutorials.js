const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../services/store');

const router = express.Router();

// The store keeps absolute filesystem paths on each step (rawImage,
// annotatedImage, croppedImage); the browser needs URLs. Decorate a copy
// of the tutorial with *Url fields derived from those paths.
function withImageUrls(tutorial) {
  const imageUrl = (filePath) =>
    filePath ? `/api/tutorials/${tutorial.id}/images/${path.basename(filePath)}` : null;
  return {
    ...tutorial,
    steps: tutorial.steps.map((step) => ({
      ...step,
      rawImageUrl: imageUrl(step.rawImage),
      annotatedImageUrl: imageUrl(step.annotatedImage),
      croppedImageUrl: imageUrl(step.croppedImage)
    }))
  };
}

router.get('/', async (req, res) => {
  const tutorials = await store.listTutorials();
  res.json(tutorials);
});

router.post('/', async (req, res) => {
  const { title, description } = req.body || {};
  const tutorial = await store.createTutorial({ title, description });
  res.status(201).json(tutorial);
});

router.get('/:id', async (req, res) => {
  const tutorial = await store.getTutorial(req.params.id);
  if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });
  res.json(withImageUrls(tutorial));
});

router.patch('/:id', async (req, res) => {
  const tutorial = await store.getTutorial(req.params.id);
  if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });
  const { title, description } = req.body || {};
  if (title !== undefined) tutorial.title = title;
  if (description !== undefined) tutorial.description = description;
  await store.saveTutorial(tutorial);
  res.json(tutorial);
});

router.delete('/:id', async (req, res) => {
  await store.deleteTutorial(req.params.id);
  res.status(204).end();
});

// --- Steps -----------------------------------------------------------

router.post('/:id/steps', async (req, res) => {
  try {
    const step = await store.addStep(req.params.id, req.body || {});
    res.status(201).json(step);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/steps/:stepId', async (req, res) => {
  try {
    const step = await store.updateStep(req.params.id, req.params.stepId, req.body || {});
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/steps/:stepId', async (req, res) => {
  try {
    const tutorial = await store.deleteStep(req.params.id, req.params.stepId);
    res.json(tutorial);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/steps/reorder', async (req, res) => {
  try {
    const { stepIds } = req.body || {};
    if (!Array.isArray(stepIds)) return res.status(400).json({ error: 'stepIds must be an array' });
    const tutorial = await store.reorderSteps(req.params.id, stepIds);
    res.json(tutorial);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Serve a tutorial's images (raw/annotated/cropped) by filename.
router.get('/:id/images/:filename', (req, res) => {
  const filePath = path.join(store.imagesDir(req.params.id), req.params.filename);
  if (!filePath.startsWith(store.imagesDir(req.params.id))) {
    return res.status(400).end();
  }
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

module.exports = router;
