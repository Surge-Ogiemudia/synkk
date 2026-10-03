import { safeStorage } from 'electron';
import * as os from 'os';
import { getStore, setStore } from '../store/local';

// Authentication for this desktop's calls to PharmaStackX (sync, telemetry,
// order updates). Each install obtains a per-pharmacy device key once, using
// the pharmacy's saved PharmaStackX login, and sends it as a Bearer token; the
// server derives the pharmacy from the key. Until a key is available the app
// keeps sending the legacy shared token, which the server still accepts during
// the transition (it is removed once every install uses device keys).

const PSX_BASE = 'https://www.pharmastackx.com';
const LEGACY_AUTH = `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`;

type SavedDeviceKey = { key: string; slug: string };

let inflight: Promise<string | null> | null = null;

// After a failed attempt (no usable login, server error, or a key for a different
// pharmacy than the active storefront), wait before asking again so the app
// doesn't request a new key on every sync. Restarting the app retries at once.
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
let lastFailure: { slug: string; at: number } | null = null;

function activeSlug(): string | undefined {
  const storefront = getStore('storefront') as any;
  return storefront?.slug || undefined;
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return !payload.exp || payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

/** A valid PharmaStackX login token: the saved one, or a fresh login with the saved credentials. */
async function loginToken(): Promise<string | null> {
  const creds = getStore('psxCredentials') as any;
  if (!creds) return null;
  if (creds.token && !tokenExpired(creds.token)) return creds.token;

  if (!creds.encEmail || !creds.encPass || !safeStorage.isEncryptionAvailable()) return null;
  const email = safeStorage.decryptString(Buffer.from(creds.encEmail, 'base64'));
  const password = safeStorage.decryptString(Buffer.from(creds.encPass, 'base64'));
  const res = await fetch(`${PSX_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  if (!data?.token) return null;
  setStore('psxCredentials', { ...creds, token: data.token });
  return data.token;
}

async function requestDeviceKey(slug: string): Promise<string | null> {
  const token = await loginToken();
  if (!token) return null;
  const res = await fetch(`${PSX_BASE}/api/synkk/device-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label: os.hostname() }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  // The key must belong to the storefront this desktop syncs.
  if (!data?.key || data.slug !== slug) {
    console.warn(`[PsxAuth] Device key is for "${data?.slug}", active storefront is "${slug}".`);
    return null;
  }
  setStore('synkkDeviceKey', { key: data.key, slug: data.slug } as SavedDeviceKey);
  console.log('[PsxAuth] Obtained a device key for', slug);
  return data.key;
}

/** This install's device key for the active storefront, requesting one if needed. */
export async function ensureDeviceKey(): Promise<string | null> {
  const slug = activeSlug();
  if (!slug) return null;
  const saved = getStore('synkkDeviceKey') as SavedDeviceKey | null;
  if (saved?.key && saved.slug === slug) return saved.key;

  if (lastFailure && lastFailure.slug === slug && Date.now() - lastFailure.at < RETRY_AFTER_MS) {
    return null;
  }

  if (!inflight) {
    inflight = requestDeviceKey(slug)
      .catch((err) => {
        console.error('[PsxAuth] Could not obtain a device key:', err?.message || err);
        return null;
      })
      .then((key) => {
        lastFailure = key ? null : { slug, at: Date.now() };
        return key;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Authorization header for PharmaStackX sync, telemetry and order calls. */
export async function psxAuthHeader(): Promise<string> {
  const key = await ensureDeviceKey();
  return key ? `Bearer ${key}` : LEGACY_AUTH;
}

/** Drop a key the server rejected (e.g. revoked) so the next call requests a new one. */
export function handleAuthRejection(status: number | undefined): void {
  if (status === 401 || status === 403) {
    const saved = getStore('synkkDeviceKey') as SavedDeviceKey | null;
    if (saved?.key) {
      console.warn('[PsxAuth] Server rejected the device key; a new one will be requested.');
      setStore('synkkDeviceKey', null);
    }
  }
}
