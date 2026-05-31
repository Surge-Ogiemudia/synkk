import Pusher from 'pusher-js';
import { Notification } from 'electron';
import { getStore } from '../store/local';

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

  currentChannel.bind('synkk-drug-request', (data: any) => {
    console.log('[Pusher] Received synkk-drug-request:', data);
    
    // Check out-of-stock preference
    const settings = getStore('settings') as any;
    const notifyOutOfStock = settings?.notifyOutOfStock !== false; // Default to true if undefined
    
    if (!data.hasStock && !notifyOutOfStock) {
      console.log('[Pusher] Dropping out-of-stock drug request due to user preference.');
      return;
    }

    const title = data.hasStock ? '🚨 Demand Alert (In Stock)!' : '🔔 Demand Alert (Out of Stock)';
    const bodyText = data.hasStock 
      ? `A patient in ${data.location} wants your stocked item! Accept to notify them.`
      : `A patient in ${data.location} is looking for ${data.medicines?.map((m:any) => m.name).join(', ')}.`;

    const notification = new Notification({
      title,
      body: bodyText,
      sound: 'Ping', // Windows native sound
      actions: [{ type: 'button', text: 'Accept' }, { type: 'button', text: 'Reject' }]
    });

    notification.on('action', async (event, index) => {
      if (index === 0) { // Accept clicked
        console.log('[Pusher] User accepted the drug request.');
        try {
          const storefront = getStore('storefront') as any;
          const slug = storefront?.slug || slug; // Use current slug
          
          await fetch('https://www.pharmastackx.com/api/synkk/requests/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pharmacySlug: slug,
              platformRequestId: data.platformRequestId,
              items: data.medicines || []
            })
          });
          console.log('[Pusher] Accept response recorded in PharmastackX.');
        } catch (err) {
          console.error('[Pusher] Failed to send Accept response:', err);
        }
      } else {
        console.log('[Pusher] User rejected the drug request.');
      }
    });

    notification.show();
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
