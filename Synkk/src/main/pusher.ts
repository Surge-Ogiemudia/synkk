const Pusher = require('pusher-js');
import { Notification, app } from 'electron';
import { getStore, setStore } from '../store/local';

let pusherClient: Pusher | null = null;
let currentChannel: any = null;

// Real Pusher keys
const PUSHER_KEY = '097f7e40113bef06b815';
const PUSHER_CLUSTER = 'eu';

export function initializePusher(slug: string, mainWindow: any) {
  if (pusherClient) {
    pusherClient.disconnect();
  }

  console.log(`[Pusher] Initializing pusher with key: ${PUSHER_KEY}, cluster: ${PUSHER_CLUSTER}`);
  console.log(`[Pusher] typeof Pusher:`, typeof Pusher);
  if (Pusher) {
    console.log(`[Pusher] Object keys:`, Object.keys(Pusher));
  }
  try {
    const PusherConstructor = Pusher.Pusher || Pusher.default || Pusher;
    console.log(`[Pusher] Constructor is:`, typeof PusherConstructor);
    pusherClient = new PusherConstructor(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
    });
    console.log(`[Pusher] pusherClient created successfully.`);
  } catch (err) {
    console.error(`[Pusher] Failed to create pusherClient:`, err);
  }

  pusherClient.connection.bind('state_change', (states: any) => {
    console.log('[Pusher] Connection State changed from', states.previous, 'to', states.current);
  });

  pusherClient.connection.bind('error', (err: any) => {
    console.error('[Pusher] Connection ERROR:', err);
  });

  const channelName = `pharmacy-${slug}`;
  currentChannel = pusherClient.subscribe(channelName);

  currentChannel.bind('pusher:subscription_succeeded', () => {
    console.log(`[Pusher] Successfully connected and subscribed to ${channelName}!`);
  });

  currentChannel.bind('slug-updated', (data: any) => {
    console.log('[Pusher] Received slug-updated. Changing store slug to:', data.newSlug);
    if (data.newSlug) {
      const sf = getStore('storefront') as any || {};
      sf.slug = data.newSlug;
      setStore('storefront', sf);
    }
  });

  currentChannel.bind('new-order', (data: any) => {
    console.log('[Pusher] Received new order:', data);
    
    // Add badge and flash taskbar
    if (app.setBadgeCount) app.setBadgeCount(1);
    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
      // Tell frontend to show persistent modal
      mainWindow.webContents.send('show-notification-modal', { type: 'order', data });
    }
    // 1. Tell the React UI to refresh the orders list immediately
    if (mainWindow) {
      mainWindow.webContents.send('refresh-orders-list');
    }
  });

  currentChannel.bind('synkk-drug-request', (data: any) => {
    console.log('[Pusher] Received synkk-drug-request:', data);
    
    // Check out-of-stock preference
    const settings = getStore('settings') as any;
    const notifyOutOfStock = settings?.notifyOutOfStock !== false; // Default to true if undefined
    
    if (!data.hasStock && !notifyOutOfStock) {
      console.log('[Pusher] Dropping out-of-stock drug request due to user preference.');
      return;
    }

    // Save lead to local storage
    const leads = (getStore('leads') as any[]) || [];
    const newLead = {
      id: data.platformRequestId || Date.now().toString(),
      medicines: data.medicines || [],
      location: data.location || 'Unknown',
      patientPhone: data.patientPhone || '',
      hasStock: !!data.hasStock,
      timestamp: Date.now(),
      status: 'pending' // pending | accepted | ignored
    };
    
    // Check if we already have this lead to avoid duplicates
    if (!leads.some(l => l.id === newLead.id)) {
      leads.unshift(newLead);
      setStore('leads', leads);
      if (mainWindow) {
        mainWindow.webContents.send('refresh-leads-list');
      }
    }
    
    // Add badge and flash taskbar
    if (app.setBadgeCount) app.setBadgeCount(1);
    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
      // Tell frontend to show persistent modal
      mainWindow.webContents.send('show-notification-modal', { type: 'lead', data: newLead });
    }
    // The notification UI is handled by the new MiniWidget
  });

  console.log(`[Pusher] Subscribed to ${channelName} and listening for orders.`);
}

export function disconnectPusher() {
  if (pusherClient) {
    pusherClient.disconnect();
    pusherClient = null;
    currentChannel = null;
    console.log('[Pusher] Disconnected.');
  }
}
