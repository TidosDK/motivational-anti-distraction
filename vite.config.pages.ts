import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Builds the three extension pages. Runs first and owns dist/ cleanup.
export default defineConfig({
  root,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        options: resolve(root, 'options.html'),
        interstitial: resolve(root, 'interstitial.html'),
        stats: resolve(root, 'stats.html'),
      },
    },
  },
});
