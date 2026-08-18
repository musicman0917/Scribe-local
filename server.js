const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const tutorialsRouter = require('./src/routes/tutorials');
const createCaptureRouter = require('./src/routes/capture');
const settingsRouter = require('./src/routes/settings');
const ollamaRouter = require('./src/routes/ollama');
const exportRouter = require('./src/routes/export');
const redactRouter = require('./src/routes/redact');
const captureService = require('./src/services/captureService');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/tutorials', tutorialsRouter);
app.use('/api/capture', createCaptureRouter(io));
app.use('/api/settings', settingsRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api/export', exportRouter);
app.use('/api/redact', redactRouter);

app.get('/healthz', (req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  socket.on('join-tutorial', (tutorialId) => {
    socket.join(`tutorial:${tutorialId}`);
  });
  socket.on('leave-tutorial', (tutorialId) => {
    socket.leave(`tutorial:${tutorialId}`);
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`\n  Scribe Local is running:  http://localhost:${PORT}\n`);
  if (!captureService.isHookAvailable()) {
    console.warn(
      `  ⚠ Global click capture is unavailable (${captureService.hookLoadError()}).\n` +
      `    Manual "Capture Step Now" mode will still work.\n`
    );
  }
});

function shutdown() {
  captureService.stopAllSessions();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
