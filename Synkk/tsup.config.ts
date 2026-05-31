import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main/index.ts'],
  format: ['cjs'],
  target: 'node16',
  outDir: 'dist-main',
  clean: true,
  bundle: true,
  external: ['electron', 'better-sqlite3'],
  noExternal: [
    'express', 
    'cors',
    'axios',
    'node-schedule',
    'nodemailer'
  ]
});
