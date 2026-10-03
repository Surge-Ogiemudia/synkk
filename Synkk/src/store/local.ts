import Store from 'electron-store';
import { app, safeStorage } from 'electron';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Local settings (pairing, storefront, POS credentials, sync log) are encrypted
// with a random per-install key. The key itself is protected by the OS
// (safeStorage → Windows DPAPI), so it never ships in the code and a copied
// store file can't be read on another machine or user account.
//
// Older versions encrypted 'synkk-store' with a hardcoded default key; on first
// run that data is migrated into 'synkk-store-v2' and the old file is removed
// only after the new store has been written.

const LEGACY_NAME = 'synkk-store';
const STORE_NAME = 'synkk-store-v2';
const LEGACY_KEY = process.env.Synkk_ENCRYPTION_KEY || 'default-dev-key-1234';

const defaults = {
  pairing: null,
  sync_log: [],
  settings: {
    founderEmail: process.env.FOUNDER_EMAIL || ''
  }
};

let instance: Store | null = null;

function storeFile(name: string): string {
  return path.join(app.getPath('userData'), `${name}.json`);
}

function keyFile(): string {
  return path.join(app.getPath('userData'), `${STORE_NAME}.key`);
}

/** Returns the per-install key, creating it if needed; null if OS encryption is unavailable. */
function loadOrCreateKey(): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;

  if (fs.existsSync(keyFile())) {
    try {
      return safeStorage.decryptString(fs.readFileSync(keyFile()));
    } catch (err) {
      // The key can't be unlocked (e.g. the Windows user profile changed). Start a
      // fresh store rather than failing to launch; the pharmacy will need to re-pair.
      console.error('[Store] Could not unlock store key, starting a fresh store:', err);
      try { fs.unlinkSync(storeFile(STORE_NAME)); } catch (_) {}
    }
  }

  const key = randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile(), safeStorage.encryptString(key));
  return key;
}

function readLegacyData(): Record<string, unknown> | null {
  if (!fs.existsSync(storeFile(LEGACY_NAME))) return null;
  try {
    const legacy = new Store({ name: LEGACY_NAME, encryptionKey: LEGACY_KEY });
    return { ...legacy.store };
  } catch (err) {
    console.error('[Store] Could not read legacy store for migration:', err);
    return null;
  }
}

function createStore(): Store {
  const key = loadOrCreateKey();

  if (!key) {
    // OS encryption unavailable: keep working exactly as before.
    console.warn('[Store] OS-level encryption unavailable; using legacy store.');
    return new Store({ name: LEGACY_NAME, encryptionKey: LEGACY_KEY, defaults });
  }

  if (fs.existsSync(storeFile(STORE_NAME))) {
    try {
      const secure = new Store({ name: STORE_NAME, encryptionKey: key, defaults });
      // Already migrated; clear a legacy file left behind by an earlier failed delete.
      if (fs.existsSync(storeFile(LEGACY_NAME))) {
        try { fs.unlinkSync(storeFile(LEGACY_NAME)); } catch (_) {}
      }
      return secure;
    } catch (err) {
      console.error('[Store] Secure store unreadable, recreating it:', err);
      try { fs.unlinkSync(storeFile(STORE_NAME)); } catch (_) {}
    }
  }

  // New secure store: carry over any legacy data in its very first write, and only
  // then remove the legacy file, so an interrupted migration simply runs again.
  const legacyData = readLegacyData();
  const secure = new Store({ name: STORE_NAME, encryptionKey: key, defaults: { ...defaults, ...(legacyData || {}) } });
  if (legacyData) {
    try {
      fs.unlinkSync(storeFile(LEGACY_NAME));
      console.log('[Store] Migrated settings to the secure store.');
    } catch (err) {
      console.error('[Store] Migrated, but could not remove the legacy store file:', err);
    }
  }
  return secure;
}

function getInstance(): Store {
  if (!instance) instance = createStore();
  return instance;
}

export function getStore(key: string) {
  return getInstance().get(key);
}

export function setStore(key: string, value: any) {
  getInstance().set(key, value);
}

// Created on first use (after the app is ready), so safeStorage is available.
const store = new Proxy({} as Store, {
  get(_target, prop) {
    const target = getInstance() as any;
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
  set(_target, prop, value) {
    (getInstance() as any)[prop] = value;
    return true;
  },
});

export { store };
