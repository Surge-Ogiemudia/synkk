import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { setupTray } from './tray';
import { setupUpdater } from './updater';
import { setupIpc } from './ipc';
import { startScheduler } from './scheduler';
import { initializePusher, disconnectPusher } from './pusher';
import { store } from '../store/local';
import { startRemoteConfigPoller, stopRemoteConfigPoller } from './remote-config';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
    frame: true,
    icon: path.join(__dirname, '../public/icon.png'),
  });

  // Force the window to be maximized
  // Note: setResizable(false) breaks maximize() on Windows, so we remove it.
  mainWindow.maximize();

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
    const isHiddenBoot = process.argv.includes('--hidden-on-boot');
    if (!isHiddenBoot) {
      mainWindow?.show();
    }
    
    const storefront = store.get('storefront') as any;
    const initialSlug = storefront?.slug;
    if (initialSlug) {
      console.log('Found saved pharmacy slug, starting Sync Scheduler, Pusher Listener and Remote Config Poller...', initialSlug);
      startScheduler(initialSlug as string);
      initializePusher(initialSlug as string, mainWindow);
      startRemoteConfigPoller();
    }
  });

  // Watch for slug updates from the renderer (when user registers/claims a storefront)
  store.onDidChange('storefront', (newValue: any) => {
    if (newValue && newValue.slug) {
      console.log('Pharmacy slug changed, restarting Sync Scheduler, Pusher and Remote Config Poller...', newValue.slug);
      startScheduler(newValue.slug as string);
      initializePusher(newValue.slug as string, mainWindow);
      startRemoteConfigPoller();
    } else {
      disconnectPusher();
      stopRemoteConfigPoller();
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
  app.setAppUserModelId('Synkk');
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: app.getPath('exe'),
      args: ['--hidden-on-boot']
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
}
