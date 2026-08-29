/**
 * Stops and removes the Scribe Local Windows Service. Run with the bundled
 * portable Node runtime, e.g.: runtime\node.exe service\uninstall-service.js
 */
const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'Scribe Local',
  script: path.join(__dirname, '..', 'app', 'server.js')
});

svc.on('uninstall', () => {
  console.log('Scribe Local service uninstalled.');
});

svc.on('alreadyuninstalled', () => {
  console.log('Scribe Local service was already uninstalled.');
});

svc.on('error', (err) => {
  console.error('Uninstall error:', err);
  process.exitCode = 1;
});

svc.uninstall();
