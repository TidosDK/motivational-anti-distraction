// Shared harness: launch the real Brave browser with the built extension
// loaded, then drive it through the extension's own pages (extension pages
// expose the full chrome.* API; MV3 service workers are not scriptable via
// Playwright's worker.evaluate, so we never touch the worker directly).
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist');
const PROFILE = '/tmp/opencode/madd-e2e-profile';

/** Chromium derives unpacked-extension IDs from the absolute directory path. */
export function extensionId(dir = DIST) {
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

export async function launchBrave() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  // Brave refuses to start MV3 service workers under automation flags on this
  // system, so automated e2e runs use Playwright's Chromium (same engine).
  // Set E2E_BROWSER=brave to run against the real Brave executable instead.
  const useBrave = process.env.E2E_BROWSER === 'brave';
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    ...(useBrave ? { executablePath: '/usr/bin/brave-browser', headless: false } : { channel: 'chromium', headless: true }),
    timeout: 60_000,
    args: [
      ...(useBrave ? ['--headless=new'] : []),
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-first-run',
      '--disable-brave-update',
      '--disable-component-update',
    ],
  });
  const id = extensionId();

  /** Evaluate chrome.* APIs inside the extension's own page context. */
  async function withExtPage(fn, arg) {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/options.html`);
    try {
      return await page.evaluate(fn, arg);
    } finally {
      await page.close();
    }
  }

  const seed = (items) => withExtPage((v) => chrome.storage.local.set(v), items);
  const readStorage = (keys) => withExtPage((k) => chrome.storage.local.get(k), keys);
  const readRules = () => withExtPage(() => chrome.declarativeNetRequest.getDynamicRules());

  return { ctx, id, seed, readStorage, readRules, withExtPage };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
