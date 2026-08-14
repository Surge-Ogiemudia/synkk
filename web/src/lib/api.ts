import { auth } from './auth';

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

export interface TerminalModules {
  psxWeb?: boolean;
  pos?: boolean;
  emr?: boolean;
  dispensary?: boolean;
  orders?: boolean;
  source?: boolean;
  staff?: boolean;
  socialAi?: boolean;
  synkk?: boolean;
}

export interface TerminalModulesConfig {
  modules: TerminalModules;
  allowedModules?: TerminalModules;
}

export async function getTerminalModules(): Promise<TerminalModulesConfig> {
  let adminAllowed: TerminalModules | undefined = undefined;

  try {
    const currentProfile = auth.getProfile();
    const slug = currentProfile?.slug;
    const rawAdminMap = localStorage.getItem('psx-admin-allowed-modules');
    if (rawAdminMap && slug) {
      const map = JSON.parse(rawAdminMap);
      if (map[slug]) adminAllowed = map[slug];
    }
    if (!adminAllowed && slug) {
      const rawSingle = localStorage.getItem(`psx-allowed-modules-${slug}`);
      if (rawSingle) adminAllowed = JSON.parse(rawSingle);
    }
  } catch (e) {}

  try {
    const res = await fetch('https://www.psx.ng/api/pharmacy/terminal-modules', {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      const config: TerminalModulesConfig = {
        modules: data.terminalModules || data.modules || {},
        allowedModules: data.allowedModules || data.allowed || adminAllowed,
      };
      try {
        localStorage.setItem('psx-terminal-modules-config', JSON.stringify(config));
      } catch (e) {}
      return config;
    }
  } catch (err) {
    console.warn('Failed to fetch terminal modules from API:', err);
  }

  // Fallback to local cache if network fails
  try {
    const cached = localStorage.getItem('psx-terminal-modules-config');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (adminAllowed) parsed.allowedModules = adminAllowed;
      return parsed;
    }
  } catch (e) {}

  return { modules: {}, allowedModules: adminAllowed };
}

export async function updateTerminalModules(modules: TerminalModules): Promise<TerminalModulesConfig> {
  try {
    const cached = localStorage.getItem('psx-terminal-modules-config');
    const parsed = cached ? JSON.parse(cached) : {};
    const updatedConfig: TerminalModulesConfig = { ...parsed, modules };
    localStorage.setItem('psx-terminal-modules-config', JSON.stringify(updatedConfig));
  } catch (e) {}

  try {
    const res = await fetch('https://www.psx.ng/api/pharmacy/terminal-modules', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modules),
    });
    if (res.ok) {
      const data = await res.json();
      const config: TerminalModulesConfig = {
        modules: data.terminalModules || data.modules || modules,
        allowedModules: data.allowedModules || data.allowed || undefined,
      };
      try {
        localStorage.setItem('psx-terminal-modules-config', JSON.stringify(config));
      } catch (e) {}
      return config;
    }
  } catch (err) {
    console.warn('Failed to update terminal modules on API:', err);
  }

  return { modules };
}
