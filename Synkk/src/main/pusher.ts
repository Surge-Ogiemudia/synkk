const Pusher = require('pusher-js');
import { Notification, app } from 'electron';
import { getStore, setStore } from '../store/local';
import { showNotificationOverlay } from './overlay';

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

  currentChannel.bind('new-order', (data: any) => {
    console.log('[Pusher] Received new order:', data);
    
    // Add badge and flash taskbar
    if (app.setBadgeCount) app.setBadgeCount(1);
    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
      // Tell frontend to show persistent modal
      mainWindow.webContents.send('show-notification-modal', { type: 'order', data });
    }
    // Read Notification Settings
    const orderSettings = getStore('settings') || {};
    const orderAlarmDuration = orderSettings.alarmDuration || 'infinite';

    // Spawn our custom persistent overlay
    showNotificationOverlay({ type: 'order', data, alarmDuration: orderAlarmDuration });
    
    // 1. Show Native Desktop Notification (fallback)
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
        mainWindow.flashFrame(false);
        if (app.setBadgeCount) app.setBadgeCount(0);
        
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
    // Read Notification Settings
    const leadSettings = getStore('settings') || {};
    const leadAlarmDuration = leadSettings.alarmDuration || 'infinite';

    // Spawn our custom persistent overlay
    showNotificationOverlay({ type: 'lead', data: newLead, alarmDuration: leadAlarmDuration });

    const title = data.hasStock ? '🚨 Demand Alert (In Stock)!' : '🔔 Demand Alert (Out of Stock)';
    const bodyText = data.hasStock 
      ? `A patient in ${data.location} wants your stocked item! First to accept gets the lead.`
      : `A patient in ${data.location} is looking for ${data.medicines?.map((m:any) => m.name).join(', ')}.`;

    const notification = new Notification({
      title,
      body: bodyText,
      sound: 'Ping', // Windows native sound
      actions: [{ type: 'button', text: 'Accept Lead' }, { type: 'button', text: 'Ignore' }]
    });

    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.flashFrame(false);
        if (app.setBadgeCount) app.setBadgeCount(0);
        mainWindow.webContents.send('navigate-to-leads');
      }
    });

    notification.on('action', async (event, index) => {
      const currentLeads = (getStore('leads') as any[]) || [];
      const leadIndex = currentLeads.findIndex(l => l.id === newLead.id);
      
      if (index === 0) { // Accept clicked
        console.log('[Pusher] User accepted the drug request lead.');
        
        if (leadIndex !== -1) {
          currentLeads[leadIndex].status = 'accepted';
          setStore('leads', currentLeads);
          if (mainWindow) mainWindow.webContents.send('refresh-leads-list');
        }

        try {
          const storefront = getStore('storefront') as any;
          const currentSlug = storefront?.slug || slug;
          
          await fetch('https://www.pharmastackx.com/api/synkk/requests/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pharmacySlug: currentSlug,
              platformRequestId: newLead.id,
              items: newLead.medicines
            })
          });
          console.log('[Pusher] Accept response recorded in PharmastackX.');
        } catch (err) {
          console.error('[Pusher] Failed to send Accept response:', err);
        }
      } else { // Ignore clicked
        console.log('[Pusher] User ignored the drug request lead.');
        if (leadIndex !== -1) {
          currentLeads[leadIndex].status = 'ignored';
          setStore('leads', currentLeads);
          if (mainWindow) mainWindow.webContents.send('refresh-leads-list');
        }
      }
      
      // If action was clicked, optionally open the window anyway
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.flashFrame(false);
        if (app.setBadgeCount) app.setBadgeCount(0);
        mainWindow.webContents.send('navigate-to-leads');
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
