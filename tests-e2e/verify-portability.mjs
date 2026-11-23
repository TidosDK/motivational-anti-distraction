import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrave, sleep } from './helpers.mjs';

const keys = ['settings', 'state', 'history', 'deck', 'userQuotes'];
const restoreStatus = '#data-status';

async function download(page, button, filename) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  assert.match(file.suggestedFilename(), filename);
  return readFile(await file.path());
}

async function importFile(page, buffer, confirm = null) {
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import-backup').click()]);
  const file = { name: 'backup.json', mimeType: 'application/json', buffer };
  if (confirm === null) {
    await picker.setFiles(file);
    return;
  }
  const confirmation = page.waitForEvent('dialog').then(async (dialog) => {
    assert.equal(dialog.type(), 'confirm');
    assert.match(dialog.message(), /Replace the current settings/);
    await (confirm ? dialog.accept() : dialog.dismiss());
  });
  await Promise.all([confirmation, picker.setFiles(file)]);
}

async function waitUntil(condition, message) {
  const deadline = Date.now() + 10_000;
  while (!await condition()) {
    assert.ok(Date.now() < deadline, message);
    await sleep(50);
  }
}

export async function verifyPortability(launch = launchBrave) {
  const now = new Date();
  const resetHour = (now.getHours() + 12) % 24;
  const dayStart = new Date(now);
  dayStart.setHours(resetHour, 0, 0, 0);
  if (now < dayStart) dayStart.setDate(dayStart.getDate() - 1);
  const passExpiry = Date.now() + 180_000;

  const settings = {
    version: 1,
    sites: [
      { domain: 'example.com', limitMin: 10, passes: 1 },
      { domain: 'example.org', limitMin: 3, passes: 2 },
    ],
    combinedBudgetMin: 120, resetHour, passSessionMin: 13,
  };
  const state = {
    version: 1, dayStart: dayStart.getTime(),
    perSiteSeconds: { 'example.com': 1200, 'example.org': 300 },
    passesUntil: { 'example.org': passExpiry }, passesUsed: { 'example.org': 1 },
  };
  const history = {
    '2026-10-01': { perSite: { 'example.org': 60 }, totalSec: 60, overrides: [] },
    '2026-10-02': {
      perSite: { 'example.com': 180 }, totalSec: 180,
      overrides: [{ site: 'example.com', ts: new Date(2026, 9, 2, 14, 5).getTime(), affirmed: true }],
    },
  };
  const userQuotes = { quotes: ['Protect your concentration.', 'A small step counts.', 'Remember your priorities.'], ownOnly: true };
  const deck = { cycleOrder: [2, 0, 1], position: 1 };

  const original = await launch();
  let data, files, expectedPopup;
  try {
    const page = await original.ctx.newPage();
    await page.goto(`chrome-extension://${original.id}/options.html`);
    data = { settings, state, history, deck, userQuotes };
    await page.evaluate((data) => navigator.locks.request('extension-data', () => chrome.storage.local.set(data)), data);

    const popup = await original.ctx.newPage();
    await popup.goto(`chrome-extension://${original.id}/popup.html`);
    await popup.waitForFunction(() => document.body.textContent.includes('1h 35m left of 120m'));
    expectedPopup = await popup.locator('#popup').textContent();
    await page.bringToFront();
    await original.ctx.setOffline(true);

    files = {
      'backup.json': await download(page, '#export-backup', /^anti-distraction-backup-\d{4}-\d{2}-\d{2}\.json$/),
      'history.csv': await download(page, '#export-history', /^anti-distraction-history-\d{4}-\d{2}-\d{2}\.csv$/),
      'overrides.csv': await download(page, '#export-overrides', /^anti-distraction-overrides-\d{4}-\d{2}-\d{2}\.csv$/),
    };
    const backup = JSON.parse(files['backup.json'].toString());
    assert.equal(backup.format, 'motivational-anti-distraction-backup');
    assert.equal(backup.version, 1);
    assert.ok(Number.isFinite(Date.parse(backup.exportedAt)));
    assert.deepEqual(backup.data, data);
    assert.equal(files['history.csv'].toString(),
      'day,example.com,example.org,combined_minutes,override_count\r\n2026-10-01,0,1,1,0\r\n2026-10-02,3,0,3,1\r\n');
    assert.equal(files['overrides.csv'].toString(), 'site,timestamp,affirmed\r\nexample.com,2026-10-02T14:05:00,true\r\n');
  } finally {
    await original.ctx.close();
  }

  const fresh = await launch();
  try {
    const { ctx, id } = fresh;
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/options.html`);
    await page.locator('#export-backup').waitFor();
    const stats = await ctx.newPage();
    await stats.goto(`chrome-extension://${id}/stats.html`);
    await stats.getByText('No closed usage days yet.').waitFor();
    await page.bringToFront();
    await ctx.setOffline(true);
    const before = await page.evaluate((keys) => chrome.storage.local.get(keys), keys);
    assert.equal(before.settings, undefined, 'restore uses a fresh extension profile');
    await page.evaluate((keys) => {
      globalThis.restoreEvents = [];
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const changed = Object.keys(changes).filter((key) => keys.includes(key));
        if (changed.length) globalThis.restoreEvents.push(changed.sort());
      });
    }, keys);

    await importFile(page, files['backup.json'], false);
    await page.waitForFunction((selector) => document.querySelector(selector).textContent === 'Import cancelled.', restoreStatus);
    assert.deepEqual(await page.evaluate((keys) => chrome.storage.local.get(keys), keys), before);
    await importFile(page, Buffer.from('malformed JSON'));
    await page.waitForFunction((selector) => /malformed JSON/.test(document.querySelector(selector).textContent), restoreStatus);
    assert.deepEqual(await page.evaluate((keys) => chrome.storage.local.get(keys), keys), before);

    await importFile(page, files['backup.json'], true);
    await page.waitForFunction((selector) => document.querySelector(selector).textContent === 'Backup restored.', restoreStatus);
    assert.deepEqual(await page.evaluate((keys) => chrome.storage.local.get(keys), keys), data);
    assert.deepEqual(await page.evaluate(() => globalThis.restoreEvents), [['deck', 'history', 'settings', 'state', 'userQuotes']]);
    assert.equal(await page.locator('#pass-session').inputValue(), '13');
    assert.ok(await page.getByLabel('Use only my quotes').isChecked());
    assert.deepEqual(await page.locator('#user-quotes li span').allTextContents(), userQuotes.quotes);
    const historyDates = ['2026-10-02', '2026-10-01'];
    await stats.locator('.history-row').first().waitFor();
    assert.deepEqual(await stats.locator('.history-date').allTextContents(), historyDates);
    assert.deepEqual(await stats.locator('.history-total').allTextContents(), ['3m', '1m']);
    await stats.reload();
    await stats.locator('.history-row').first().waitFor();
    assert.deepEqual(await stats.locator('.history-date').allTextContents(), historyDates);

    const invalid = JSON.parse(files['backup.json'].toString());
    invalid.data.state.dayStart = Date.now() + 2 * 86_400_000;
    await importFile(page, Buffer.from(JSON.stringify(invalid)));
    await page.waitForFunction((selector) => /state\.dayStart/.test(document.querySelector(selector).textContent), restoreStatus);
    assert.deepEqual(await page.evaluate((keys) => chrome.storage.local.get(keys), keys), data);

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForFunction(() => document.body.textContent.includes('1h 35m left of 120m'));
    assert.equal(await popup.locator('#popup').textContent(), expectedPopup);

    await waitUntil(async () => page.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const expiry = await chrome.alarms.get('pass-expire:example.org');
      return rules.length === 1 && rules[0].action.redirect.url.includes('s=example.com') && expiry != null;
    }), 'import reapplies blocking and schedules the restored active pass');
    const restoredExpiry = await page.evaluate(async () => (await chrome.alarms.get('pass-expire:example.org')).scheduledTime);
    assert.equal(restoredExpiry, passExpiry);

    const quote = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'nextQuote' }));
    assert.equal(quote.text, 'Protect your ____.');
    assert.equal(quote.expectedWord, 'concentration');
    const drawn = await page.evaluate(async () => (await chrome.storage.local.get('deck')).deck);
    assert.deepEqual(drawn, { cycleOrder: data.deck.cycleOrder, position: data.deck.position + 1 });

    const blocked = await ctx.newPage();
    await blocked.goto('https://example.com/');
    assert.match(blocked.url(), /\/interstitial\.html\?s=example\.com$/);
  } finally {
    await fresh.ctx.close();
  }
  console.log('verify-portability: passed offline downloads, atomic restore, rejected files, popup, history, blocking, active pass, and personal deck');
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyPortability();
