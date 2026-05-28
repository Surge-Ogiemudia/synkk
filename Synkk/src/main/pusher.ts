import Pusher from 'pusher-js';
import { Notification } from 'electron';

let pusherClient: Pusher | null = null;
let currentChannel: any = null;

// Real Pusher keys
const PUSHER_KEY = '097f7e40113bef06b815';
const PUSHER_CLUSTER = 'eu';

export function initializePusher(slug: string, mainWindow: any) {
  if (pusherClient) {
    pusherClient.disconnect();
  }

  // Initialize Pusher Client
  pusherClient = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
  });

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

  currentChannel.bind('new-order', (data: any) => {
    console.log('[Pusher] Received new order:', data);
    
    // 1. Show Native Desktop Notification
    const notification = new Notification({
      title: '🚨 New Online Order!',
      body: `${data.patientName} just ordered ${data.itemsCount} items. (₦${data.totalAmount})`,
      sound: 'Ping' // Windows native sound
    });
    
    notification.on('click', () => {
      // Bring window to front
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        
        // Tell renderer to switch to the Orders tab
        mainWindow.webContents.send('navigate-to-orders');
      }
    });
    
    notification.show();

    // 2. Tell the React UI to refresh the orders list immediately
    if (mainWindow) {
      mainWindow.webContents.send('refresh-orders-list');
    }
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
