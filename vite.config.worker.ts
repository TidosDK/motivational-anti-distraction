import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Builds the MV3 service worker as a single ES module: dist/background.js
export default defineConfig({
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    rollupOptions: {
      input: resolve(root, 'src/background/index.ts'),
      output: {
        entryFileNames: 'background.js',
        format: 'es',
        inlineDynamicImports: true,
      },
    },
  },
});
