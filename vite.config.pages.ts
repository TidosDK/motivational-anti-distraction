import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Single source of truth for the extension version: package.json.
// Bump it with `npm version patch|minor|major` (see README → Versioning);
// the manifest in public/ deliberately carries no version field.
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

// Chrome rejects manifest versions that aren't 1–4 dot-separated integers,
// e.g. npm prereleases like "1.2.0-beta.1". Fail loudly at build time.
const CHROME_VERSION = /^\d+(\.\d+){0,3}$/;

function injectManifestVersion(): Plugin {
  return {
    name: 'inject-manifest-version',
    apply: 'build',
    closeBundle() {
      if (!CHROME_VERSION.test(pkg.version)) {
        this.error(
          `package.json version "${pkg.version}" is not a valid Chrome ` +
            'manifest version (1–4 dot-separated integers, no prerelease ' +
            'suffix). Bump with `npm version patch|minor|major`.',
        );
      }
      const file = resolve(root, 'dist/manifest.json');
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      // Rebuild the object so "version" keeps a tidy spot after "name".
      const { version: _stale, ...rest } = manifest;
      const stamped = {
        name: rest.name,
        version: pkg.version,
        ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'name')),
      };
      writeFileSync(file, JSON.stringify(stamped, null, 2) + '\n');
    },
  };
}

// Builds the three extension pages. Runs first and owns dist/ cleanup.
export default defineConfig({
  root,
  base: './',
  plugins: [injectManifestVersion()],
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
