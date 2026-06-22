import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';

let bubbleWindow: BrowserWindow | null = null;

export function launchBubbleWidget(posNameHint: string = '') {
  if (bubbleWindow) {
    bubbleWindow.focus();
    return;
  }

  // Calculate bottom right corner of the primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const windowWidth = 340;
  const windowHeight = 400;
  
  // Padding from the edges
  const paddingX = 20;
  const paddingY = 20;

  const x = width - windowWidth - paddingX;
  const y = height - windowHeight - paddingY;

  bubbleWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  // Keep it always on top of EVERYTHING (even fullscreen apps usually)
  bubbleWindow.setAlwaysOnTop(true, 'screen-saver');

  const isDev = !app.isPackaged;
  const hash = `#bubble-widget?hint=${encodeURIComponent(posNameHint)}`;
  
  if (isDev) {
    bubbleWindow.loadURL(`http://localhost:5173${hash}`);
    // Don't open dev tools by default for this tiny window
  } else {
    bubbleWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: hash.replace('#', '') });
  }

  bubbleWindow.once('ready-to-show', () => {
    bubbleWindow?.show();
  });

  bubbleWindow.on('closed', () => {
    bubbleWindow = null;
  });
}

export function closeBubbleWidget() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.close();
  }
  bubbleWindow = null;
}
