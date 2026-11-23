import assert from 'node:assert/strict';
import { launchBrave, sleep } from './helpers.mjs';

const { ctx, id, seed, readRules } = await launchBrave();

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
      globalThis.lastActionIcon = details.path;
    };
  });

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);

  async function assertStatus(text, color, iconSuffix = '') {
    const deadline = Date.now() + 10_000;
    let actualText = await page.evaluate(() => chrome.action.getBadgeText({}));
    while (actualText !== text && Date.now() < deadline) {
      await sleep(50);
      actualText = await page.evaluate(() => chrome.action.getBadgeText({}));
    }
    assert.equal(actualText, text, 'toolbar badge text');
    assert.deepEqual(await page.evaluate(() => chrome.action.getBadgeBackgroundColor({})), color);
    const path = await worker.evaluate(() => globalThis.lastActionIcon);
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
    sites: [{ domain: 'example.com', limitMin: null, passes: 1 }],
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

  await seed({ settings, state: stateWithUsage(13) });
  await assertStatus('47', red);
  await seed({ state: stateWithUsage(14) });
  await assertStatus('46', red);
  assert.deepEqual(await readRules(), [], 'under-budget usage updates the badge without a rule change');

  await seed({ state: stateWithUsage(60) });
  await assertStatus('0', red, '-red');
  assert.equal((await readRules()).length, 1, 'an exhausted site is still blocked');

  await seed({ settings: { ...settings, combinedBudgetMin: 90 } });
  await assertStatus('30', red);

  await seed({ settings });
  await assertStatus('0', red, '-red');
  await seed({ state: stateWithUsage(60, priorDay) });
  await assertStatus('60', red);
  assert.deepEqual(await readRules(), [], 'rollover removes the exhausted rule');

  await seed({ settings: { ...settings, sites: [] } });
  await assertStatus('', [0, 0, 0, 0]);
  assert.equal(await page.evaluate(() => chrome.action.getPopup({})), `chrome-extension://${id}/popup.html`);

  console.log('verify-badge: passed usage updates, exhaustion, settings recovery, rollover, empty list, and popup');
} finally {
  await ctx.close();
}
