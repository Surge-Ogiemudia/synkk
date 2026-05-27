import * as dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { setupTray } from './tray';
import { setupUpdater } from './updater';
import { setupIpc } from './ipc';
import { startScheduler } from './scheduler';
import { initializePusher, disconnectPusher } from './pusher';
import Store from 'electron-store';

const store = new Store();
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
    frame: true, // we can customize this later
    icon: path.join(__dirname, '../public/icon.png'),
  });

  // Load the React app
  // In development, we use the Vite dev server
  // In production, we load the built static file
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    const initialSlug = store.get('pharmacySlug');
    if (initialSlug) {
      console.log('Found saved pharmacy slug, starting Sync Scheduler and Pusher Listener...', initialSlug);
      startScheduler(initialSlug as string);
      initializePusher(initialSlug as string, mainWindow);
    }
  });

  // Watch for slug updates from the renderer (when user registers/claims a storefront)
  store.onDidChange('pharmacySlug', (newValue) => {
    if (newValue) {
      console.log('Pharmacy slug changed, restarting Sync Scheduler and Pusher...', newValue);
      startScheduler(newValue as string);
      initializePusher(newValue as string, mainWindow);
    } else {
      disconnectPusher();
    }
  });

  // Block native hardware back/forward buttons (mouse side buttons)
  mainWindow.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      e.preventDefault();
    }
  });

  // Block native Chromium navigations (like dropping a file or trackpad swipes)
  mainWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault();
  });

  let isQuitting = false;

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
}

app.whenReady().then(() => {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: app.getPath('exe')
    });
  }

  createWindow();
  setupTray();
  setupUpdater();
  setupIpc();

  // Start the dynamic sync scheduler
  const { startScheduler } = require('./scheduler');
  startScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Do nothing. The app stays in the system tray.
});
