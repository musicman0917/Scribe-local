const express = require('express');
const path = require('path');
const fs = require('fs');
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

// Size (px) of the deterministic, click-centered region cropped BEFORE
// asking the model to tighten further. Keeps the model's job to "find the
// element near the middle of this small image" rather than "find the
// click location anywhere in the full screenshot" — general vision models
// aren't reliable at the latter (they're not trained for spatial
// grounding), so letting them guess it directly can crop a totally
// unrelated part of the screen. This way, even a bad model response can
// only affect fine-tightening, never where the crop actually lands.
const COARSE_CROP_SIZE = 640;

/**
 * Crop a step's annotated screenshot tightly around its click point.
 *
 * Two stages:
 *  1. Deterministically crop a generous, click-centered region — no model
 *     involved, so this can never land on the wrong part of the screen.
 *  2. Ask Ollama to tighten that region further around the specific UI
 *     element near its center. If the model is unavailable or returns
 *     something unusable, the stage-1 crop is used as-is.
 *
 * This also sidesteps a separate issue: vision models like llava
 * internally downscale whatever image they're given to a small fixed
 * resolution (roughly 336x336px) before "looking" at it, so a small
 * click-circle on a full, uncropped screenshot is often too tiny to
 * survive that downscale — the stage-1 crop keeps the highlighted element
 * a large fraction of the frame regardless of how stage 2 goes.
 */
async function performCrop(tutorialId, step) {
  const coarseBox = imageService.fallbackBoxAroundPoint(step.x, step.y, COARSE_CROP_SIZE);
  const coarseFilename = path.basename(step.annotatedImage).replace('annotated-', 'coarse-');
  const coarsePath = path.join(store.imagesDir(tutorialId), coarseFilename);

  const coarseRegion = await imageService.cropToRegion({
    inputPath: step.annotatedImage,
    outputPath: coarsePath,
    box: coarseBox,
    relative: false,
    padding: 0
  });

  let box = null;
  let usedFallback = false;

  try {
    const coarseBase64 = await imageService.toBase64Raw(coarsePath);
    const relativeBox = await ollamaService.smartCrop({
      imageBase64: coarseBase64,
      width: coarseRegion.width,
      height: coarseRegion.height
    });
    // Map the model's box (relative to the coarse sub-image) back to
    // absolute pixel coordinates in the original screenshot.
    box = {
      x0: coarseRegion.left + relativeBox.x0 * coarseRegion.width,
      y0: coarseRegion.top + relativeBox.y0 * coarseRegion.height,
      x1: coarseRegion.left + relativeBox.x1 * coarseRegion.width,
      y1: coarseRegion.top + relativeBox.y1 * coarseRegion.height
    };
  } catch (err) {
    usedFallback = true;
  }

  const croppedFilename = path.basename(step.annotatedImage).replace('annotated-', 'cropped-');
  const croppedPath = path.join(store.imagesDir(tutorialId), croppedFilename);

  if (usedFallback) {
    // Stage 2 failed — the stage-1 coarse crop is already centered on the
    // real click, so just use it directly rather than risk a bad box.
    await fs.promises.copyFile(coarsePath, croppedPath);
  } else {
    await imageService.cropToRegion({
      inputPath: step.annotatedImage,
      outputPath: croppedPath,
      box,
      relative: false,
      padding: 16
    });
  }

  await fs.promises.unlink(coarsePath).catch(() => {});

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
