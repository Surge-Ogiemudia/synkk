import { app, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;
let currentStatus: 'green' | 'amber' | 'red' = 'green';

export function setupTray() {
  const iconPath = path.join(__dirname, '../../public/tray-icon-green.png'); // Placeholder
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  updateTrayMenu();

  tray.setToolTip('Synkk Pharmacy Sync');

  tray.on('click', () => {
    // Bring window to front
    // This logic might need access to mainWindow from index
  });
}

export function updateTrayStatus(status: 'green' | 'amber' | 'red', lastSyncTime: string, medicinesCount: number) {
  currentStatus = status;
  // Change icon based on status
  // const iconPath = path.join(__dirname, `../../public/tray-icon-${status}.png`);
  // tray?.setImage(nativeImage.createFromPath(iconPath));

  if (status === 'red') {
    new Notification({
      title: 'Synkk needs your attention',
      body: 'Your storefront may not be showing your latest stock.',
    }).show();
  }

  updateTrayMenu(lastSyncTime, medicinesCount);
}

function updateTrayMenu(lastSyncTime: string = 'Never', medicinesCount: number = 0) {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Synkk', click: () => { /* open window */ } },
    { type: 'separator' },
    { label: currentStatus === 'amber' ? 'Status: Offline - Queuing...' : `Last sync: ${lastSyncTime}`, enabled: false },
    { label: `Medicines synced: ${medicinesCount}`, enabled: false },
    { type: 'separator' },
    { label: 'View my storefront', click: () => { /* open browser */ } },
    { label: 'Sync now', click: () => { /* trigger manual sync */ } },
    { label: 'Settings', click: () => { /* open settings view */ } },
    { label: 'Help', click: () => { /* open help URL */ } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
}
