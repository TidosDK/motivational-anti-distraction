import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Builds the MV3 service worker as a single ES module: dist/background.js
export default defineConfig({
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // public/ is owned by the pages build (which stamps the manifest version);
    // copying it again here would overwrite that stamped manifest.
    copyPublicDir: false,
    target: 'chrome120',
    rollupOptions: {
      input: resolve(root, 'src/background/index.ts'),
      output: {
        entryFileNames: 'background.js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
