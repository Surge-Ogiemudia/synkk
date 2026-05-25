import * as chokidar from 'chokidar';
import * as fs from 'fs';
import { executeSync } from '../main/sync';

let exportWatcher: chokidar.FSWatcher | null = null;

// Watches common export locations for manual CSV/Excel exports
export function startExportWatcher(paths: string[]) {
  if (exportWatcher) {
    exportWatcher.close();
  }

  exportWatcher = chokidar.watch(paths, {
    persistent: true,
    ignoreInitial: true,
    depth: 1, // Only watch the top level of Downloads/Desktop/Documents
  });

  exportWatcher.on('add', async (filePath) => {
    // Only react to likely inventory export files
    if (filePath.endsWith('.csv') || filePath.endsWith('.xlsx')) {
      console.log(`Detected new export file: ${filePath}`);
      // In reality, we'd verify the file contents match the expected schema
      // before triggering the sync.
      await executeSync();
    }
  });

  console.log(`Watching for manual exports in: ${paths.join(', ')}`);
}

export function stopExportWatcher() {
  if (exportWatcher) {
    exportWatcher.close();
    exportWatcher = null;
  }
}
