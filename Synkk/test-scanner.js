const path = require('path');
const os = require('os');
const fs = require('fs');

const KNOWN_POS_SYSTEMS = [
  { folderName: 'virtualrx', name: 'VirtualRx', exe: 'VirtualRx.exe', type: 'Desktop POS' },
  { folderName: 'pioneerrx', name: 'PioneerRx', exe: 'PioneerRx.exe', type: 'Desktop POS' },
  { folderName: 'rx30', name: 'Rx30 Pharmacy System', exe: 'Rx30.exe', type: 'Desktop POS' },
  { folderName: 'qs1', name: 'QS/1 NRx', exe: 'nRx.exe', type: 'Desktop POS' },
  { folderName: 'liberty', name: 'Liberty Software', exe: 'Liberty.exe', type: 'Desktop POS' },
  { folderName: 'square', name: 'Square POS', exe: 'Square.exe', type: 'Desktop POS' },
];

function scanForPOS() {
  const discovered = [];
  
  const searchPaths = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
    path.join(os.homedir(), 'AppData', 'Roaming'),
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];

  for (const baseDir of searchPaths) {
    if (!fs.existsSync(baseDir)) {
        console.log("Path does not exist:", baseDir);
        continue;
    }
    
    try {
      const folders = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
        
      for (const folder of folders) {
        for (const pos of KNOWN_POS_SYSTEMS) {
          if (folder.toLowerCase() === pos.folderName.toLowerCase() || folder.toLowerCase().includes(pos.folderName.toLowerCase())) {
            const exePath = path.join(baseDir, folder, pos.exe);
            
            if (!discovered.some(d => d.name === pos.name)) {
              discovered.push({
                name: pos.name,
                executablePath: fs.existsSync(exePath) ? exePath : path.join(baseDir, folder),
                type: pos.type
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn(`Could not read directory ${baseDir}:`, e);
    }
  }

  return discovered;
}

console.log(scanForPOS());
