import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface DiscoveredPOS {
  name: string;
  executablePath: string;
  type: string;
}

const IGNORE_LIST = ['chrome', 'edge', 'windows', 'microsoft', 'adobe', 'intel', 'nvidia', 'node', 'npm', 'git', 'java', 'python', 'vscode', 'temp'];

export async function scanForPOS(): Promise<DiscoveredPOS[]> {
  const discovered: DiscoveredPOS[] = [];
  
  const searchPaths = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
    path.join(os.homedir(), 'AppData', 'Roaming'),
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];

  const allFolders: string[] = [];

  for (const baseDir of searchPaths) {
    if (!fs.existsSync(baseDir)) continue;
    
    try {
      const folders = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
        
      for (const folder of folders) {
        const lowerFolder = folder.toLowerCase();
        // Skip common non-POS junk to save AI tokens
        if (IGNORE_LIST.some(ignore => lowerFolder.includes(ignore))) continue;
        allFolders.push(folder);
      }
    } catch (e) {
      console.warn(`Could not read directory ${baseDir}:`, e);
    }
  }

  if (allFolders.length === 0) return [];

  try {
    console.log("Asking Vercel AI Backend to analyze", allFolders.length, "installed programs...");
    
    const response = await fetch('https://www.pharmastackx.com/api/synkk-ai/scan-pos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ allFolders })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Vercel Backend returned ${response.status}: ${err.error || response.statusText}`);
    }

    const data = await response.json();
    const identifiedFolders: string[] = data.identifiedFolders || [];
    console.log("AI discovered POS systems:", identifiedFolders);

    for (const folder of identifiedFolders) {
       for (const baseDir of searchPaths) {
         if (!fs.existsSync(baseDir)) continue;
         const fullPath = path.join(baseDir, folder);
         
         if (fs.existsSync(fullPath)) {
            let mainExePath = fullPath;
            try {
               const contents = fs.readdirSync(mainExePath);
               const exes = contents.filter(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('uninstall') && !f.toLowerCase().includes('uninst'));
               if (exes.length > 0) {
                   const matchingExe = exes.find(e => e.toLowerCase().includes(folder.toLowerCase()));
                   mainExePath = path.join(mainExePath, matchingExe || exes[0]);
               }
            } catch(e) {}

            const displayName = folder.charAt(0).toUpperCase() + folder.slice(1);
            if (!discovered.some(d => d.name === displayName)) {
              discovered.push({
                name: displayName,
                executablePath: mainExePath,
                type: 'Discovered POS'
              });
            }
            break; // Stop searching other baseDirs once found
         }
       }
    }
  } catch (error) {
     console.error("AI scanning failed:", error);
  }

  return discovered;
}
