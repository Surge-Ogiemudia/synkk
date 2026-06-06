const Store = require('electron-store');
const path = require('path');
const store = new Store({
  name: 'synkk-store',
  encryptionKey: process.env.Synkk_ENCRYPTION_KEY || 'default-dev-key-1234',
  cwd: 'C:\\Users\\HP\\AppData\\Roaming\\synkk'
});
console.log('Storefront:', store.get('storefront'));
console.log('Settings:', store.get('settings'));
console.log('Pairing:', store.get('pairing'));
