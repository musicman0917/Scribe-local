const express = require('express');
const store = require('../services/store');
const exportService = require('../services/exportService');

const router = express.Router();

function slug(title) {
  return (title || 'tutorial').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'tutorial';
}

router.get('/:id/markdown', async (req, res) => {
  const tutorial = await store.getTutorial(req.params.id);
  if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });
  const imagesDir = store.imagesDir(req.params.id);
  exportService.exportMarkdownZip(tutorial, imagesDir, res, slug(tutorial.title));
});

router.get('/:id/html', async (req, res) => {
  const tutorial = await store.getTutorial(req.params.id);
  if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });
  const html = await exportService.buildHtmlReport(tutorial);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${slug(tutorial.title)}.html"`);
  res.send(html);
});

router.get('/:id/pdf', async (req, res) => {
  const tutorial = await store.getTutorial(req.params.id);
  if (!tutorial) return res.status(404).json({ error: 'Tutorial not found' });
  await exportService.exportPdf(tutorial, res, slug(tutorial.title));
});

module.exports = router;
