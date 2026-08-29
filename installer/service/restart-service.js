/**
 * Restarts the Scribe Local Windows Service — used by "Restart Service.bat"
 * in the install root, e.g. after editing service\port.txt. node-windows
 * has no in-place "update config" call, so this uninstalls (which stops the
 * running service first) and reinstalls, which regenerates the service
 * config from the current port.txt/env.
 */
const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'Scribe Local',
  script: path.join(__dirname, '..', 'app', 'server.js')
});

svc.on('uninstall', () => {
  console.log('Stopped. Reinstalling to pick up config changes...');
  svc.install();
});

svc.on('install', () => {
  svc.start();
});

svc.on('start', () => {
  console.log('Scribe Local service restarted.');
});

svc.on('error', (err) => {
  console.error('Restart error:', err);
  process.exitCode = 1;
});

if (svc.exists) {
  svc.uninstall();
} else {
  svc.install();
}
