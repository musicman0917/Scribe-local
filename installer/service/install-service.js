/**
 * Registers Scribe Local as a Windows Service (using node-windows / WinSW)
 * and starts it, then opens the dashboard in the default browser.
 *
 * Run with the bundled portable Node runtime, e.g.:
 *   runtime\node.exe service\install-service.js
 *
 * Reads the desired port from service\port.txt (defaults to 3000 if
 * missing/invalid) so the port can be changed later without reinstalling —
 * edit port.txt, then run "Restart Service.bat" in the install root.
 */
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { Service } = require('node-windows');

const APP_DIR = path.join(__dirname, '..', 'app');
const PORT_FILE = path.join(__dirname, 'port.txt');

function readPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf-8').trim();
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n > 0 && n < 65536) return String(n);
  } catch {
    // fall through to default
  }
  return '3000';
}

const port = readPort();

const svc = new Service({
  name: 'Scribe Local',
  description: 'Scribe Local self-hosted tutorial builder (scribe-local.local)',
  script: path.join(APP_DIR, 'server.js'),
  workingDirectory: APP_DIR,
  env: [{ name: 'PORT', value: port }]
});

function openBrowserSoon() {
  setTimeout(() => {
    exec(`start http://localhost:${port}`);
  }, 1500);
}

svc.on('install', () => {
  console.log(`Service installed. Starting on port ${port}...`);
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service already installed. Starting...');
  svc.start();
});

svc.on('start', () => {
  console.log(`Scribe Local service started on port ${port}.`);
  openBrowserSoon();
});

svc.on('error', (err) => {
  console.error('Service error:', err);
  process.exitCode = 1;
});

if (svc.exists) {
  svc.start();
} else {
  svc.install();
}
