const express = require('express');
const path = require('path');
const store = require('../services/store');
const imageService = require('../services/imageService');

const router = express.Router();

/**
 * Apply one or more redaction rectangles to a step's image. This is
 * destructive-by-design against a *copy*: we always redact from the
 * original annotated/raw image into a redacted-*.png, and keep the
 * source untouched so redaction can be re-applied or adjusted.
 */
router.post('/:tutorialId/steps/:stepId', async (req, res) => {
  try {
    const tutorial = await store.getTutorial(req.params.tutorialId);
    if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });
    const step = tutorial.steps.find((s) => s.id === req.params.stepId);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const { rects } = req.body || {};
    if (!Array.isArray(rects)) return res.status(400).json({ error: 'rects must be an array' });

    const sourceImage = step.annotatedImage || step.rawImage;
    const redactedFilename = path.basename(sourceImage).replace(/^(annotated|raw)-/, 'redacted-');
    const redactedPath = path.join(store.imagesDir(req.params.tutorialId), redactedFilename);

    await imageService.applyRedactions({
      inputPath: sourceImage,
      outputPath: redactedPath,
      rects
    });

    // Redacted image becomes the new working "annotated" image so it
    // flows through smart-crop, describe, and export automatically.
    const updates = { annotatedImage: redactedPath, redactions: rects };
    if (step.croppedImage) {
      // Invalidate any prior crop since the source pixels changed.
      updates.croppedImage = null;
    }

    const updated = await store.updateStep(req.params.tutorialId, req.params.stepId, updates);

    res.json({
      ...updated,
      annotatedImageUrl: `/api/tutorials/${req.params.tutorialId}/images/${redactedFilename}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
