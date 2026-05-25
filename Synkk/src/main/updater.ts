import { autoUpdater } from 'electron-updater';
import { ipcMain } from 'electron';

export function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    console.log('Update available.');
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded.');
    // Notify user or install on quit
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater.', err);
  });
}
