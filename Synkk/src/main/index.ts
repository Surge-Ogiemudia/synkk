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
    title: 'PharmaStackX Terminal',
  });

  const isHiddenBoot = process.argv.includes('--hidden-on-boot');
  if (!isHiddenBoot) {
    mainWindow.maximize();
  }

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
    const appModules = store.get('appModules') as any;
    
    if (initialSlug && appModules?.synkk !== false) {
      console.log('Found saved pharmacy slug and Synkk is enabled, starting background services...', initialSlug);
      startScheduler(initialSlug as string);
      initializePusher(initialSlug as string, mainWindow);
      startRemoteConfigPoller();
    } else {
      console.log('Synkk is disabled or slug is missing, sleeping.');
    }
  });

  // Watch for slug updates from the renderer (when user registers/claims a storefront)
  store.onDidChange('storefront', (newValue: any) => {
    const appModules = store.get('appModules') as any;
    if (newValue && newValue.slug && appModules?.synkk !== false) {
      console.log('Pharmacy slug changed and Synkk is enabled, restarting services...', newValue.slug);
      startScheduler(newValue.slug as string);
      initializePusher(newValue.slug as string, mainWindow);
      startRemoteConfigPoller();
    } else {
      const { stopScheduler } = require('./scheduler');
      stopScheduler();
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

  mainWindow.on('maximize', () => {
    if (mainWindow) {
      // Fade out, resize, fade in
      let opacity = 1;
      const fadeOut = setInterval(() => {
        opacity -= 0.15;
        if (opacity <= 0) {
          clearInterval(fadeOut);
          mainWindow!.setOpacity(0);
          
          mainWindow!.setAlwaysOnTop(false);
          mainWindow!.setMenuBarVisibility(true);
          const route = (global as any).targetRoute || (global as any).lastDashboardRoute || '/dashboard/dispensary';
          mainWindow!.webContents.send('navigate-to', { path: route });
          (global as any).targetRoute = null;
          
          // Small delay to let the maximize settle
          setTimeout(() => {
            let fadeInOpacity = 0;
            const fadeIn = setInterval(() => {
              fadeInOpacity += 0.15;
              if (fadeInOpacity >= 1) {
                clearInterval(fadeIn);
                mainWindow!.setOpacity(1);
              } else {
                mainWindow!.setOpacity(fadeInOpacity);
              }
            }, 15);
          }, 50);
        } else {
          mainWindow!.setOpacity(opacity);
        }
      }, 15);
    }
  });

  let isTransformingToWidget = false;

  const transformToWidget = () => {
    if (!mainWindow) return;
    isTransformingToWidget = true;
    let opacity = 1;
    const fadeOut = setInterval(() => {
      opacity -= 0.15;
      if (opacity <= 0) {
        clearInterval(fadeOut);
        mainWindow!.setOpacity(0);
        
        mainWindow!.unmaximize();
        mainWindow!.setSize(245, 293);
        mainWindow!.setMenuBarVisibility(false);
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        mainWindow!.setPosition(width - 245 - 20, height - 293 - 20);
        mainWindow!.setAlwaysOnTop(true);
        mainWindow!.webContents.send('navigate-to', { path: '/mini-widget' });
        
        // Fade back in
        setTimeout(() => {
          let fadeInOpacity = 0;
          const fadeIn = setInterval(() => {
            fadeInOpacity += 0.15;
            if (fadeInOpacity >= 1) {
              clearInterval(fadeIn);
              mainWindow!.setOpacity(1);
              isTransformingToWidget = false;
            } else {
              mainWindow!.setOpacity(fadeInOpacity);
            }
          }, 15);
        }, 50);
      } else {
        mainWindow!.setOpacity(opacity);
      }
    }, 15);
  };

  mainWindow.on('unmaximize', (e) => {
    if (isTransformingToWidget || !mainWindow) return;
    if (mainWindow.isAlwaysOnTop()) return; // Already in widget mode
    transformToWidget();
  });

  mainWindow.on('minimize', (e) => {
    if (!mainWindow) return;
    if (mainWindow.isAlwaysOnTop()) {
      // It's a widget! Let it truly minimize to the taskbar natively!
      return;
    }

    // Otherwise, turn it into the widget
    e.preventDefault();
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    transformToWidget();
  });

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
  app.setAppUserModelId('PharmaStackX Terminal');
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: app.getPath('exe'),
      args: ['--hidden-on-boot']
    });
  }

  // Automatically bypass certificate errors (e.g. expired SSL certs on legacy Web POS servers)
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });

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
