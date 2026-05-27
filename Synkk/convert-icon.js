const pngToIco = require('png-to-ico').default;
const fs = require('fs');
pngToIco('public/icon.png').then(buf => fs.writeFileSync('public/icon.ico', buf)).catch(console.error);
