const express = require('express');
const path = require('path');
const captureService = require('../services/captureService');
const imageService = require('../services/imageService');
const accessibilityService = require('../services/accessibilityService');
const store = require('../services/store');
const { getSettings } = require('../config');

module.exports = function createCaptureRouter(io) {
  const router = express.Router();

  async function finalizeStep(tutorialId, { x, y, globalX, globalY, filename, filePath, order }) {
    const settings = getSettings();
    // Accessibility lookup (Windows UI Automation) needs absolute
    // virtual-desktop coordinates, not coordinates local to whichever
    // monitor was captured — fall back to (x, y) when no multi-monitor
    // offset is known (e.g. single-display machines).
    const lookupX = globalX ?? x;
    const lookupY = globalY ?? y;

    const [{ width, height }, elementInfo] = await Promise.all([
      imageService.annotateClick({
        inputPath: filePath,
        outputPath: filePath.replace('raw-', 'annotated-'),
        x,
        y,
        order,
        style: settings.capture
      }),
      settings.accessibility.enabled
        ? accessibilityService.describeElementAtPoint(lookupX, lookupY)
        : Promise.resolve(null)
    ]);

    const annotatedFilename = path.basename(filePath.replace('raw-', 'annotated-'));

    const step = await store.addStep(tutorialId, {
      title: accessibilityService.buildDefaultTitle(order, elementInfo),
      x,
      y,
      screenWidth: width,
      screenHeight: height,
      rawImage: filePath,
      annotatedImage: filePath.replace('raw-', 'annotated-'),
      element: elementInfo
    });

    const payload = {
      ...step,
      rawImageUrl: `/api/tutorials/${tutorialId}/images/${filename}`,
      annotatedImageUrl: `/api/tutorials/${tutorialId}/images/${annotatedFilename}`
    };

    io.to(`tutorial:${tutorialId}`).emit('step-captured', payload);
    return payload;
  }

  router.get('/status', (req, res) => {
    res.json({
      hookAvailable: captureService.isHookAvailable(),
      hookLoadError: captureService.hookLoadError(),
      accessibilityAvailable: accessibilityService.isAvailable(),
      accessibilityEnabled: getSettings().accessibility.enabled,
      platform: process.platform
    });
  });

  // Available monitors, for the manual-capture screen picker. Empty array
  // means only the default display can be captured (single-monitor
  // machine, or the platform/backend doesn't expose per-display bounds).
  router.get('/displays', async (req, res) => {
    const displays = await captureService.listDisplays();
    res.json({ displays });
  });

  router.post('/:tutorialId/start', async (req, res) => {
    const tutorial = await store.getTutorial(req.params.tutorialId);
    if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });

    const imagesDir = store.imagesDir(req.params.tutorialId);
    const session = captureService.startSession(req.params.tutorialId, imagesDir);

    session.on('step-captured', (event) => {
      finalizeStep(req.params.tutorialId, event).catch((err) => {
        io.to(`tutorial:${req.params.tutorialId}`).emit('capture-error', { message: err.message });
      });
    });
    session.on('warning', (message) => {
      io.to(`tutorial:${req.params.tutorialId}`).emit('capture-warning', { message });
    });
    session.on('error', (err) => {
      io.to(`tutorial:${req.params.tutorialId}`).emit('capture-error', { message: err.message });
    });

    res.json({
      started: true,
      hookAvailable: captureService.isHookAvailable(),
      hookLoadError: captureService.hookLoadError()
    });
  });

  router.post('/:tutorialId/stop', (req, res) => {
    captureService.stopSession(req.params.tutorialId);
    res.json({ stopped: true });
  });

  // Manual capture fallback: take a screenshot right now (optionally of a
  // specific monitor — pass `screen` as one of the ids from GET
  // /displays); the caller (frontend) will prompt the user to click on it
  // to place the marker, then call POST /:tutorialId/manual-step with the
  // chosen coordinates, echoing back displayX/displayY so accessibility
  // lookups can be converted to absolute screen coordinates.
  router.post('/:tutorialId/manual-shot', async (req, res) => {
    try {
      const { screen } = req.body || {};
      const imagesDir = store.imagesDir(req.params.tutorialId);
      const { filename } = await captureService.manualCapture(imagesDir, screen);

      let displayX = 0;
      let displayY = 0;
      if (screen !== undefined) {
        const displays = await captureService.listDisplays();
        const match = displays.find((d) => d.id === screen);
        if (match) { displayX = match.x; displayY = match.y; }
      }

      res.json({
        filename,
        imageUrl: `/api/tutorials/${req.params.tutorialId}/images/${filename}`,
        displayX,
        displayY
      });
    } catch (err) {
      res.status(500).json({ error: `Screenshot failed: ${err.message}` });
    }
  });

  router.post('/:tutorialId/manual-step', async (req, res) => {
    try {
      const { filename, x, y, displayX, displayY } = req.body || {};
      if (!filename || x === undefined || y === undefined) {
        return res.status(400).json({ error: 'filename, x, and y are required' });
      }
      const imagesDir = store.imagesDir(req.params.tutorialId);
      const filePath = path.join(imagesDir, filename);
      const tutorial = await store.getTutorial(req.params.tutorialId);
      const order = tutorial.steps.length + 1;

      const globalX = displayX ? x + displayX : x;
      const globalY = displayY ? y + displayY : y;

      const step = await finalizeStep(req.params.tutorialId, {
        x, y, globalX, globalY, filename, filePath, order
      });
      res.status(201).json(step);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
