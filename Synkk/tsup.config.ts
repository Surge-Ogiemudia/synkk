import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main/index.ts'],
  outDir: 'dist-main',
  format: ['cjs'],
  external: ['electron'],
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ''
  }
});
