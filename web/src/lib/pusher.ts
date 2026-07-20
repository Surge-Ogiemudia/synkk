import Pusher from 'pusher-js';
import { addLead } from './leads';

// Same public app key/cluster the desktop app uses (Synkk/src/main/pusher.ts).
// Pusher app keys are meant to be embedded client-side — auth for channel access,
// if any, happens on Pusher's side, not by keeping this secret.
const PUSHER_KEY = '097f7e40113bef06b815';
const PUSHER_CLUSTER = 'eu';

let client: Pusher | null = null;
let boundSlug: string | null = null;

// Desktop ran this once at app startup, in the main process, independent of which
// screen was showing, so notifications kept flowing in the background. Call this
// once near the top of the authenticated app (DashboardLayout) for the same effect.
export function ensurePusherConnected(slug: string) {
  if (!slug || boundSlug === slug) return;
  if (client) client.disconnect();

  client = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
  boundSlug = slug;
  const channel = client.subscribe(`pharmacy-${slug}`);

  channel.bind('new-order', () => {
    window.dispatchEvent(new Event('refresh-orders-list'));
  });

  channel.bind('synkk-drug-request', (data: any) => {
    addLead(data);
    window.dispatchEvent(new Event('refresh-leads-list'));
  });
}

export function disconnectPusher() {
  if (client) {
    client.disconnect();
    client = null;
    boundSlug = null;
  }
}
