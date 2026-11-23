import assert from 'node:assert/strict';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, id } = await launchBrave();

try {
  const workerUrl = `chrome-extension://${id}/background.js`;
  const worker = ctx.serviceWorkers().find((candidate) => candidate.url() === workerUrl)
    ?? await ctx.waitForEvent('serviceworker', { predicate: (candidate) => candidate.url() === workerUrl });

  // chrome.action has no icon getter. Record paths accepted by the real API
  // before each transition without replacing the browser's icon handling.
  await worker.evaluate(() => {
    const setIcon = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = async (details) => {
      await setIcon(details);
      globalThis.actionIcons ??= {};
      globalThis.actionIcons[details.tabId ?? 'default'] = details.path;
    };
  });

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  const controlTab = { tabId: await page.evaluate(async () => (await chrome.tabs.getCurrent()).id) };
  const seed = (values) => page.evaluate((values) => chrome.storage.local.set(values), values);
  const readRules = () => page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());

  async function assertStatus(text, color, iconSuffix = '', details = {}) {
    const deadline = Date.now() + 10_000;
    const expectedIcon = `icons/icon-16${iconSuffix}.png`;
    let actualText, path;
    for (;;) {
      actualText = await page.evaluate((details) => chrome.action.getBadgeText(details), details);
      path = await worker.evaluate((tabId) => globalThis.actionIcons?.[tabId ?? 'default'], details.tabId);
      if ((actualText === text && path?.[16] === expectedIcon) || Date.now() >= deadline) break;
      await sleep(50);
    }
    assert.equal(actualText, text, 'toolbar badge text');
    assert.deepEqual(await page.evaluate((details) => chrome.action.getBadgeBackgroundColor(details), details), color);
    assert.deepEqual(path, {
      16: `icons/icon-16${iconSuffix}.png`,
      32: `icons/icon-32${iconSuffix}.png`,
      48: `icons/icon-48${iconSuffix}.png`,
      128: `icons/icon-128${iconSuffix}.png`,
    });
  }

  const now = new Date();
  // Pick a reset hour away from the current hour so the test can't cross it.
  const resetHour = (now.getHours() + 12) % 24;
  const dayStart = new Date(now);
  dayStart.setHours(resetHour, 0, 0, 0);
  if (now < dayStart) dayStart.setDate(dayStart.getDate() - 1);
  const priorDay = new Date(dayStart);
  priorDay.setDate(priorDay.getDate() - 1);

  const settings = {
    version: 1,
    sites: [{ domain: 'example.com', limitMin: 19, passes: 1 }],
    combinedBudgetMin: 60,
    resetHour,
    passSessionMin: 10,
  };
  const stateWithUsage = (minutes, day = dayStart) => ({
    version: 1,
    dayStart: day.getTime(),
    perSiteSeconds: { 'example.com': minutes * 60 },
    passesUntil: {},
    passesUsed: {},
  });
  const red = [179, 33, 36, 255];
  const transparent = [0, 0, 0, 0];

  await seed({ settings, state: stateWithUsage(1.25) });
  await assertStatus('', transparent);
  await assertStatus('', transparent, '', controlTab);

  const site = await ctx.newPage();
  await site.route('https://example.com/**', (route) => route.fulfill({ body: 'Blocked-site fixture' }));
  await site.goto('https://example.com/');
  await site.bringToFront();
  const [activeTab] = await page.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  assert.equal(activeTab.url, 'https://example.com/');
  const siteTab = { tabId: activeTab.id };
  await assertStatus('17m', red, '', siteTab);
  await seed({ state: stateWithUsage(2.25) });
  await assertStatus('16m', red, '', siteTab);
  assert.deepEqual(await readRules(), [], 'under-budget usage updates the badge without a rule change');

  await page.bringToFront();
  await seed({ state: stateWithUsage(15.25) });
  await assertStatus('', transparent, '', controlTab);
  await site.bringToFront();
  await assertStatus('3m', red, '', siteTab);

  await seed({ state: stateWithUsage(19.25) });
  await assertStatus('0', red, '-red', siteTab);
  await assertStatus('', transparent);

  await site.goto('about:blank');
  await assertStatus('', transparent, '', siteTab);
  await site.goto(`chrome-extension://${id}/interstitial.html?s=example.com`);
  await assertStatus('0', red, '-red', siteTab);

  const longSite = { ...settings, sites: [{ ...settings.sites[0], limitMin: 300 }] };
  await seed({ settings: { ...longSite, combinedBudgetMin: 200 } });
  await assertStatus('3h', red, '', siteTab);

  await seed({ settings: longSite, state: stateWithUsage(60.25) });
  await assertStatus('0', red, '-red', siteTab);
  assert.equal((await readRules()).length, 1, 'an exhausted site is still blocked');
  await assertStatus('', transparent);

  await seed({ settings: { ...longSite, combinedBudgetMin: 90 } });
  await assertStatus('29m', red, '', siteTab);

  await seed({ settings: longSite });
  await assertStatus('0', red, '-red', siteTab);
  await seed({ state: stateWithUsage(60, priorDay) });
  await assertStatus('60m', red, '', siteTab);
  assert.deepEqual(await readRules(), [], 'rollover removes the exhausted rule');

  await site.goto('https://example.com/');
  await seed({ state: stateWithUsage(0.25) });
  await assertStatus('59m', red, '', siteTab);
  await seed({ settings: { ...settings, sites: [{ ...settings.sites[0], limitMin: null }] } });
  await assertStatus('', transparent, '', siteTab);
  await seed({ settings: { ...settings, sites: [] } });
  await assertStatus('', transparent, '', siteTab);
  assert.equal(await page.evaluate(() => chrome.action.getPopup({})), `chrome-extension://${id}/popup.html`);

  console.log('verify-badge: passed minute labels, hidden badges, exhaustion, rollover, and popup');
} finally {
  await ctx.close();
}
