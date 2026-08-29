/**
 * Electron main process for the Scribe Local desktop app.
 *
 * Why Electron instead of a Windows Service: screen capture (screenshot-desktop)
 * and the global click hook (uiohook-napi) both need access to the real,
 * interactive desktop. A Windows Service runs in "Session 0", which is
 * deliberately isolated from the interactive desktop for security — so a
 * service-based build can never see real screenshots or real clicks (it gets
 * a blank/black screen). A normal desktop app like this one always runs
 * attached to the user's real login session, so capture works correctly.
 *
 * This embeds the existing Express + Socket.IO server (server.js, unchanged)
 * directly in this same process and shows it in a BrowserWindow — so the
 * server has the same desktop access Electron itself has.
 */
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu } = require('electron');

const PORT = process.env.PORT || '3000';
process.env.PORT = PORT;

// Read-only app bundle -> can't write here. Redirect user data (tutorials,
// screenshots, settings.json) to Electron's proper per-user app-data folder.
const userDataDir = app.getPath('userData');
process.env.SCRIBE_DATA_DIR = path.join(userDataDir, 'data');
process.env.SCRIBE_CONFIG_DIR = path.join(userDataDir, 'config');
fs.mkdirSync(process.env.SCRIBE_DATA_DIR, { recursive: true });
fs.mkdirSync(process.env.SCRIBE_CONFIG_DIR, { recursive: true });

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Scribe Local',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      // Keep running in the tray instead of quitting — an active capture
      // session should keep working even if the window is closed.
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'tray-icon.png'));
  tray.setToolTip('Scribe Local');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Scribe Local', click: createWindow },
    { type: 'separator' },
    {
      label: 'Quit Scribe Local',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', createWindow);
}

app.whenReady().then(() => {
  // Starts the Express + Socket.IO server in this same process.
  require('../server.js');

  createWindow();
  createTray();

  app.setLoginItemSettings({ openAtLogin: true });

  app.on('activate', createWindow);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Deliberately not quitting here — stay running in the tray.
});
