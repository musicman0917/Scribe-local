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

/**
 * Crop a step's annotated screenshot tightly around its click point —
 * via Ollama's smart-crop when possible, falling back to a fixed-size
 * box around the click if the model is unavailable or returns junk.
 * Vision models like llava internally downscale whatever image they're
 * given to a small fixed resolution (roughly 336x336px) before "looking"
 * at it, so a small click-circle on a full, uncropped screenshot is
 * often too tiny to survive that downscale — cropping first keeps the
 * highlighted element a large fraction of the frame.
 */
async function performCrop(tutorialId, step) {
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
  const croppedPath = path.join(store.imagesDir(tutorialId), croppedFilename);

  await imageService.cropToRegion({
    inputPath: step.annotatedImage,
    outputPath: croppedPath,
    box,
    relative: !usedFallback
  });

  const updated = await store.updateStep(tutorialId, step.id, { croppedImage: croppedPath });
  return { updated, croppedFilename, usedFallback };
}

// Smart-crop a step's annotated screenshot around the click coordinates.
router.post('/:tutorialId/steps/:stepId/smart-crop', async (req, res) => {
  const { step, error, status } = await loadStep(req.params.tutorialId, req.params.stepId);
  if (error) return res.status(status).json({ error });

  try {
    const { updated, croppedFilename, usedFallback } = await performCrop(req.params.tutorialId, step);
    res.json({
      ...updated,
      croppedImageUrl: `/api/tutorials/${req.params.tutorialId}/images/${croppedFilename}`,
      usedFallback
    });
  } catch (err) {
    res.status(502).json({ error: `Smart crop failed: ${err.message}` });
  }
});

// Auto-describe a step: crops first (if not already cropped) so the vision
// model works from a tight, focused image, then generates a title + description.
router.post('/:tutorialId/steps/:stepId/describe', async (req, res) => {
  const { step, error, status } = await loadStep(req.params.tutorialId, req.params.stepId);
  if (error) return res.status(status).json({ error });

  try {
    let workingStep = step;
    if (!workingStep.croppedImage) {
      const { updated } = await performCrop(req.params.tutorialId, workingStep);
      workingStep = updated;
    }

    const imageBase64 = await imageService.toBase64Raw(workingStep.croppedImage);
    const { title, description } = await ollamaService.describeStep({
      imageBase64,
      context: req.body && req.body.context
    });

    const croppedFilename = path.basename(workingStep.croppedImage);
    const updated = await store.updateStep(req.params.tutorialId, req.params.stepId, { title, description });
    res.json({
      ...updated,
      croppedImageUrl: `/api/tutorials/${req.params.tutorialId}/images/${croppedFilename}`
    });
  } catch (err) {
    res.status(502).json({ error: `Auto-describe failed: ${err.message}` });
  }
});

module.exports = router;
