import Store from 'electron-store';

// We use electron-store for encrypted local storage
// You can provide an encryption key derived from machine ID here
const store = new Store({
  name: 'synkk-store',
  encryptionKey: process.env.Synkk_ENCRYPTION_KEY || 'default-dev-key-1234', // fallback for dev
  defaults: {
    pairing: null,
    sync_log: [],
    settings: {
      founderEmail: process.env.FOUNDER_EMAIL || ''
    }
  }
});

export function getStore(key: string) {
  return store.get(key);
}

export function setStore(key: string, value: any) {
  store.set(key, value);
}

// better-sqlite3 logic could also go here for more complex querying if needed
export { store };
