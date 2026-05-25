import * as chokidar from 'chokidar';
import { executeSync } from './sync';

let watcher: chokidar.FSWatcher | null = null;

export function startWatching(targetPath: string) {
  if (watcher) {
    watcher.close();
  }

  watcher = chokidar.watch(targetPath, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', async (path) => {
    console.log(`File ${path} has been changed. Triggering sync.`);
    await executeSync();
  });

  console.log(`Watching for changes in ${targetPath}`);
}

export function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
