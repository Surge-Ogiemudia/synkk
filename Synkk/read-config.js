const Store = require('electron-store');
const store = new Store({
  cwd: 'C:\\Users\\HP\\AppData\\Roaming\\synkk'
});
console.log('Pharmacy Slug:', store.get('pharmacySlug'));
