import { app, BrowserWindow, screen, ipcMain } from 'electron';
import * as path from 'path';

let overlayWindow: BrowserWindow | null = null;
let closeTimeout: NodeJS.Timeout | null = null;
let overlayData: any = null;

export function showNotificationOverlay(data: any) {
  if (overlayWindow) {
    overlayWindow.close();
  }
  
  overlayData = data;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const windowWidth = 350;
  const windowHeight = 240;

  overlayWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: width - windowWidth - 20,
    y: height - windowHeight - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Load the React app
  const isDev = !app.isPackaged;
  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/#/overlay');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'overlay' });
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show();
  });

  // Automatically close after 5 minutes
  if (closeTimeout) clearTimeout(closeTimeout);
  closeTimeout = setTimeout(() => {
    closeOverlay();
  }, 5 * 60 * 1000);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

export function closeOverlay() {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
}

ipcMain.on('overlay-ready', (e) => {
  if (overlayData) {
    e.reply('show-overlay-data', overlayData);
  }
});

ipcMain.on('close-overlay', () => {
  closeOverlay();
});
