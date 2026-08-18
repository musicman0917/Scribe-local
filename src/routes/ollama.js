const express = require('express');
const path = require('path');
const store = require('../services/store');
const imageService = require('../services/imageService');
const ollamaService = require('../services/ollamaService');

const router = express.Router();

async function loadStep(tutorialId, stepId) {
  const tutorial = await store.getTutorial(tutorialId);
  if (!tutorial) return { error: 'Tutorial not found', status: 404 };
  const step = tutorial.steps.find((s) => s.id === stepId);
  if (!step) return { error: 'Step not found', status: 404 };
  return { tutorial, step };
}

// Smart-crop a step's annotated screenshot around the click coordinates.
router.post('/:tutorialId/steps/:stepId/smart-crop', async (req, res) => {
  const { tutorial, step, error, status } = await loadStep(req.params.tutorialId, req.params.stepId);
  if (error) return res.status(status).json({ error });

  try {
    const imageBase64 = await imageService.toBase64Raw(step.annotatedImage);
    let box;
    let usedFallback = false;

    try {
      box = await ollamaService.smartCrop({
        imageBase64,
        x: step.x,
        y: step.y,
        width: step.screenWidth,
        height: step.screenHeight
      });
    } catch (err) {
      usedFallback = true;
      const fb = imageService.fallbackBoxAroundPoint(step.x, step.y);
      box = { x0: fb.x0, y0: fb.y0, x1: fb.x1, y1: fb.y1 };
    }

    const croppedFilename = path.basename(step.annotatedImage).replace('annotated-', 'cropped-');
    const croppedPath = path.join(store.imagesDir(req.params.tutorialId), croppedFilename);

    await imageService.cropToRegion({
      inputPath: step.annotatedImage,
      outputPath: croppedPath,
      box,
      relative: !usedFallback
    });

    const updated = await store.updateStep(req.params.tutorialId, req.params.stepId, {
      croppedImage: croppedPath
    });

    res.json({
      ...updated,
      croppedImageUrl: `/api/tutorials/${req.params.tutorialId}/images/${croppedFilename}`,
      usedFallback
    });
  } catch (err) {
    res.status(502).json({ error: `Smart crop failed: ${err.message}` });
  }
});

// Auto-describe a step: generate a title + description from its screenshot.
router.post('/:tutorialId/steps/:stepId/describe', async (req, res) => {
  const { step, error, status } = await loadStep(req.params.tutorialId, req.params.stepId);
  if (error) return res.status(status).json({ error });

  try {
    const imagePath = step.croppedImage || step.annotatedImage;
    const imageBase64 = await imageService.toBase64Raw(imagePath);
    const { title, description } = await ollamaService.describeStep({
      imageBase64,
      context: req.body && req.body.context
    });

    const updated = await store.updateStep(req.params.tutorialId, req.params.stepId, { title, description });
    res.json(updated);
  } catch (err) {
    res.status(502).json({ error: `Auto-describe failed: ${err.message}` });
  }
});

module.exports = router;
