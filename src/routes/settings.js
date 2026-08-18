const express = require('express');
const { getSettings, saveSettings } = require('../config');
const ollamaService = require('../services/ollamaService');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getSettings());
});

router.put('/', (req, res) => {
  const updated = saveSettings(req.body || {});
  res.json(updated);
});

router.post('/ollama/test', async (req, res) => {
  const host = (req.body && req.body.host) || undefined;
  const result = await ollamaService.testConnection(host);
  res.json(result);
});

module.exports = router;
