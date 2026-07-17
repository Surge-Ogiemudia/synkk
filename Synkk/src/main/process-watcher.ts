import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: string;
  path: string;
  name: string;
}

export class ProcessWatcher {
  private initialSnapshot: Map<string, ProcessInfo> = new Map();
  private isWatching: boolean = false;
  private watchInterval: NodeJS.Timeout | null = null;
  private readonly BROWSER_EXECUTABLES = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'launcher.exe', 'chrome_proxy.exe', 'msedge_proxy.exe'];

  /**
   * Captures the current state of running processes.
   * This MUST be called BEFORE telling the user to open their app.
   */
  async takeSnapshot(): Promise<void> {
    const processes = await this.getRunningProcesses();
    this.initialSnapshot.clear();
    processes.forEach(p => this.initialSnapshot.set(p.pid, p));
    console.log(`[ProcessWatcher] Snapshot taken: ${this.initialSnapshot.size} processes running.`);
  }

  /**
   * Starts polling for a new process. Resolves when a new process is found.
   * @param timeoutMs Maximum time to wait in milliseconds.
   */
  async watchForNewApp(timeoutMs: number = 60000, onScan?: (appName: string) => void): Promise<{ type: 'browser' | 'local-app' | 'timeout', details?: any }> {
    if (this.isWatching) return Promise.reject('Already watching');
    
    // Ensure we have a baseline
    if (this.initialSnapshot.size === 0) {
      await this.takeSnapshot();
    }

    this.isWatching = true;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.watchInterval = setInterval(async () => {
        if (!this.isWatching) {
          reject(new Error('Watch cancelled'));
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          this.stop();
          resolve({ type: 'timeout' });
          return;
        }

        try {
          const currentProcesses = await this.getRunningProcesses();
          
          // Find any process that wasn't in the initial snapshot
          for (const p of currentProcesses) {
            if (!this.initialSnapshot.has(p.pid)) {
              
              if (onScan) {
                // Throttle UI updates slightly by only sending standard exe names
                const nameLow = p.name ? p.name.toLowerCase() : '';
                if (nameLow && !nameLow.includes('svchost') && !nameLow.includes('conhost') && !nameLow.includes('wmic')) {
                  onScan(p.name);
                }
              }

              // Ignore background Windows processes and blank paths
              if (!p.path || p.path.toLowerCase().includes('\\windows\\system32\\')) continue;

              const isBrowser = this.BROWSER_EXECUTABLES.includes(p.name.toLowerCase());
              
              if (isBrowser) {
                this.stop();
                console.log(`[ProcessWatcher] Detected Browser Launch: ${p.name}`);
                resolve({ type: 'browser', details: p });
                return;
              }

              // Found a new standard desktop application!
              // Now hunt for the database
              const dbFile = this.huntForDatabase(p.path);
              
              if (dbFile) {
                this.stop();
                console.log(`[ProcessWatcher] Detected Desktop App Launch: ${p.name} at ${p.path}`);
                resolve({ 
                  type: 'local-app', 
                  details: { ...p, dbPath: dbFile } 
                });
                return;
              }
              
              // If we found a new process but it's not a browser and has no database,
              // it's likely just a background helper (like updater.exe). Ignore it and keep watching!
              console.log(`[ProcessWatcher] Ignoring non-relevant background process: ${p.name}`);
            }
          }
        } catch (err) {
          console.error('[ProcessWatcher] Error during polling:', err);
        }
      }, 2000); // Poll every 2 seconds
    });
  }

  stop() {
    this.isWatching = false;
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  private async getRunningProcesses(): Promise<ProcessInfo[]> {
    try {
      // WMIC is fast and returns exactly what we need on Windows
      const { stdout } = await execAsync('wmic process get processid,executablepath /format:csv');
      return this.parseWmicOutput(stdout);
    } catch (err) {
      // Fallback to PowerShell if WMIC is deprecated/removed
      try {
        const { stdout } = await execAsync('powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress"');
        const data = JSON.parse(stdout);
        const arr = Array.isArray(data) ? data : [data];
        return arr.filter(p => p.ExecutablePath).map(p => ({
          pid: String(p.ProcessId),
          path: p.ExecutablePath,
          name: path.basename(p.ExecutablePath)
        }));
      } catch (psErr) {
        console.error('[ProcessWatcher] Failed both WMIC and PowerShell process gathering', psErr);
        return [];
      }
    }
  }

  private parseWmicOutput(output: string): ProcessInfo[] {
    const lines = output.trim().split('\\n');
    const results: ProcessInfo[] = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length >= 3) {
        // Node, ExecutablePath, ProcessId
        const execPath = parts.slice(1, parts.length - 1).join(',').trim(); // Handle commas in paths
        const pid = parts[parts.length - 1].trim();
        
        if (execPath) {
          results.push({
            pid,
            path: execPath,
            name: path.basename(execPath)
          });
        }
      }
    }
    return results;
  }

  private huntForDatabase(exePath: string): string | null {
    const results = this.deepHuntForDatabase(exePath);
    return results.length > 0 ? results[0] : null;
  }

  private static readonly DB_EXTENSIONS = [
    '.db', '.sqlite', '.sqlite3', '.db3',
    '.mdb', '.accdb',
    '.fdb',
    '.mdf', '.ldf', '.sdf',
    '.dbf', '.dat',
  ];

  private static readonly SKIP_DIRS = [
    'node_modules', 'cache', 'temp', 'tmp', 'logs', 'log',
    '__pycache__', '.git', 'updates', 'crashpad', 'gpu_cache',
    'code_cache', 'shader_cache',
  ];

  deepHuntForDatabase(exePath: string): string[] {
    const parsedPath = path.parse(exePath);
    const installDir = parsedPath.dir;
    const appName = parsedPath.name;
    const driveLetter = parsedPath.root || 'C:\\';
    const found: string[] = [];

    const searchDirs = [
      installDir,
      path.join(process.env.APPDATA || '', appName),
      path.join(process.env.LOCALAPPDATA || '', appName),
      path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', appName),
      path.join(driveLetter, appName),
      path.join(process.env.USERPROFILE || '', 'Documents', appName),
    ];

    for (const dir of searchDirs) {
      const results = this.scanDirDeep(dir);
      for (const r of results) {
        if (!found.includes(r)) found.push(r);
      }
    }

    console.log(`[ProcessWatcher] Deep hunt for ${appName}: found ${found.length} database files.`);
    return found;
  }

  private scanDirDeep(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const lower = entry.name.toLowerCase();
          if (ProcessWatcher.SKIP_DIRS.includes(lower)) continue;
          try {
            const sub = this.scanDirDeep(fullPath);
            results.push(...sub);
          } catch (_) {}
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ProcessWatcher.DB_EXTENSIONS.includes(ext)) {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size > 10240) {
                console.log(`[ProcessWatcher] Found database: ${fullPath} (${(stat.size / 1024).toFixed(0)}KB)`);
                results.push(fullPath);
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    return results;
  }
}

export const processWatcher = new ProcessWatcher();
