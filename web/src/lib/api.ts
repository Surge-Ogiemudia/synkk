// Orders / leads / source endpoints. These all live on pharmastackx.com (a separate
// domain/deployment from the psx.ng surfaces the iframe tabs use) and are scoped by
// `slug` query params / body fields rather than session cookies, so a plain
// cross-origin fetch works the same way the auth check-identifier call does — no
// credentials, no cookie domain concerns.
const API_BASE = 'https://www.pharmastackx.com';

export async function fetchPendingOrders(slug: string) {
  const res = await fetch(`${API_BASE}/api/orders/pending?slug=${encodeURIComponent(slug)}`);
  return res.json();
}

export async function updateOrderStatus(orderId: string, status: string) {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      // Matches the desktop app's hardcoded dev token — see Synkk/src/main/ipc.ts.
      Authorization: 'Bearer dev-token',
    },
    body: JSON.stringify({ orderId, status }),
  });
  return res.json();
}

export async function acceptLead(pharmacySlug: string, platformRequestId: string, items: any[]) {
  const res = await fetch(`${API_BASE}/api/synkk/requests/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pharmacySlug, platformRequestId, items: items || [] }),
  });
  return res.json();
}

export async function searchSource(query: string, exclude: string) {
  const res = await fetch(
    `${API_BASE}/api/source?query=${encodeURIComponent(query)}&exclude=${encodeURIComponent(exclude)}`
  );
  return res.json();
}

export async function autocompleteSource(query: string) {
  const res = await fetch(`${API_BASE}/api/source/autocomplete?query=${encodeURIComponent(query)}`);
  return res.json();
}

// Terminal module visibility settings — synced to the pharmacy's account (not
// per-browser), so turning a tab off follows the pharmacy to any device they log
// into. Lives on www.psx.ng (session_token-authenticated), a different domain from
// this app, so these need credentials:'include' to actually send the cookie —
// unlike the plain public endpoints above. See that route's CORS handling for why
// it works despite being cross-origin.
export interface TerminalModules {
  psxWeb?: boolean;
  pos?: boolean;
  emr?: boolean;
  dispensary?: boolean;
  orders?: boolean;
  source?: boolean;
  staff?: boolean;
  socialAi?: boolean;
}

export async function getTerminalModules(): Promise<TerminalModules> {
  try {
    const res = await fetch('https://www.psx.ng/api/pharmacy/terminal-modules', {
      credentials: 'include',
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.terminalModules || {};
  } catch (err) {
    console.warn('Failed to fetch terminal modules:', err);
    return {};
  }
}

export async function updateTerminalModules(modules: TerminalModules): Promise<TerminalModules> {
  try {
    const res = await fetch('https://www.psx.ng/api/pharmacy/terminal-modules', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modules),
    });
    const data = await res.json();
    return data.terminalModules || {};
  } catch (err) {
    console.warn('Failed to update terminal modules:', err);
    return {};
  }
}
