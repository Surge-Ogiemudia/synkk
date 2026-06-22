import * as vm from 'vm';
import { BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Omni-Node Sandboxed Executor
 * 
 * Safely executes dynamic JavaScript payloads sent from the PharmastackX AI Co-Founder.
 * This effectively makes the Synkk app "immortal" as its logic can be updated instantly
 * over the wire without releasing a new binary.
 */
export async function executeOmniScript(scriptString: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      console.log(`[OmniExecutor] Spinning up secure V8 sandbox to execute remote script...`);

      // 1. Create a secure execution context.
      // We inject specific global variables that the AI might need.
      // We expose 'require' so it can load SQLite or Puppeteer if needed.
      const sandbox = {
        console: {
          log: (...args: any[]) => console.log('[OmniScript Log]', ...args),
          error: (...args: any[]) => console.error('[OmniScript Error]', ...args),
          warn: (...args: any[]) => console.warn('[OmniScript Warn]', ...args)
        },
        fetch: fetch,
        require: require,
        __dirname: __dirname,
        process: process,
        Buffer: Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        // Expose electron specifically for hidden window manipulation
        electron: {
          BrowserWindow,
          ipcMain,
          safeStorage
        },
        fs,
        path,
        // A built-in resolve/reject so async scripts can report back when finished
        __omniResolve: resolve,
        __omniReject: reject
      };

      vm.createContext(sandbox);

      // 2. Wrap the incoming script so that it has access to modern async/await
      // and automatically resolves the promise if it's synchronous.
      // We instruct the AI to call `__omniResolve(data)` when it's done if it's doing async work,
      // or just return the data synchronously.
      const wrappedScript = `
        (async () => {
          try {
            ${scriptString}
          } catch (e) {
            __omniReject(e);
          }
        })();
      `;

      // 3. Execute!
      const script = new vm.Script(wrappedScript);
      const result = script.runInContext(sandbox, {
        timeout: 60000 // Force kill the script if it hangs for more than 60 seconds
      });

      // If the script was entirely synchronous and returned a value directly (instead of using __omniResolve)
      if (result !== undefined && !(result instanceof Promise)) {
        resolve(result);
      }

      // Note: If the script is async, it MUST call __omniResolve(result) or it will time out.
      // We set a fallback timeout just in case it forgets to call resolve.
      setTimeout(() => {
        reject(new Error('OmniScript timed out or failed to call __omniResolve().'));
      }, 65000);

    } catch (error: any) {
      console.error('[OmniExecutor] Script execution failed:', error.message);
      reject(error);
    }
  });
}
