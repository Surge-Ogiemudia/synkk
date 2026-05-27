import { app, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;
let currentStatus: 'green' | 'amber' | 'red' = 'green';

function getTrayIconPath(status: 'green' | 'amber' | 'red') {
  return path.join(__dirname, `../public/tray-icon-${status}.png`);
}

export function setupTray() {
  const icon = nativeImage.createFromPath(getTrayIconPath('green'));
  tray = new Tray(icon);

  updateTrayMenu();

  tray.setToolTip('Synkk Pharmacy Sync');

  tray.on('click', () => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    }
  });
}

export function updateTrayStatus(status: 'green' | 'amber' | 'red', lastSyncTime: string, medicinesCount: number) {
  currentStatus = status;

  if (tray) {
    const icon = nativeImage.createFromPath(getTrayIconPath(status));
    tray.setImage(icon);
  }

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

  const { BrowserWindow } = require('electron');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Synkk', click: () => { 
        const win = BrowserWindow.getAllWindows()[0];
        if (win) { win.show(); win.focus(); }
    } },
    { type: 'separator' },
    { label: currentStatus === 'amber' ? 'Status: Offline - Queuing...' : `Last sync: ${lastSyncTime}`, enabled: false },
    { label: `Medicines synced: ${medicinesCount}`, enabled: false },
    { type: 'separator' },
    { label: 'View public storefront', click: () => { 
        const { shell } = require('electron');
        const { getStore } = require('../store/local');
        const slug = getStore('storefront')?.slug;
        if (slug) shell.openExternal(`https://${slug}.psx.ng`);
    } },
    { label: (() => {
        const { getStore } = require('../store/local');
        const storeFront = getStore('storefront');
        const isGuest = storeFront?.isGuest !== false && (storeFront?.isGuest === true || storeFront?.slug?.startsWith('guest-'));
        return isGuest ? 'Claim this Storefront' : 'Open Web Dashboard';
      })(), click: () => { 
        const { shell, app } = require('electron');
        const { getStore } = require('../store/local');
        const storeFront = getStore('storefront');
        const isGuest = storeFront?.isGuest !== false && (storeFront?.isGuest === true || storeFront?.slug?.startsWith('guest-'));
        const baseUrl = !app.isPackaged ? 'http://localhost:3000' : 'https://www.psx.ng';
        if (storeFront?.slug) {
          shell.openExternal(isGuest ? `${baseUrl}/auth?claim_slug=${storeFront.slug}` : `${baseUrl}/auth`);
        } else {
          shell.openExternal(`${baseUrl}/auth`);
        }
    } },
    { label: 'Sync now', click: () => { 
        const { executeSync } = require('./sync');
        executeSync().catch(console.error);
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
}
