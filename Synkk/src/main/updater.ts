import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check immediately, then every 4 hours
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    console.log(`Update available: v${info.version}`);
    broadcastToRenderer('update-status', { 
      status: 'available', 
      version: info.version 
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
    broadcastToRenderer('update-status', { 
      status: 'downloading', 
      percent: Math.round(progress.percent) 
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Update downloaded: v${info.version}. Will install on quit.`);
    broadcastToRenderer('update-status', { 
      status: 'ready', 
      version: info.version 
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err.message);
    // Don't broadcast errors to the user - updates are silent. Just log.
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date.');
  });
}

function broadcastToRenderer(channel: string, data: any) {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  } catch (e) {
    // Silent fail - renderer may not be ready yet
  }
}
