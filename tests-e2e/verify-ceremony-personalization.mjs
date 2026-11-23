import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchBrave, sleep } from './helpers.mjs';

const personal = [
  { text: 'Protect your concentration.', masked: '“Protect your ____.”', answer: 'concentration' },
  { text: 'Remember your priorities.', masked: '“Remember your ____.”', answer: 'priorities' },
];

async function waitFor(check, message) {
  const deadline = Date.now() + 10_000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, message);
    await sleep(50);
  }
}

export async function verifyCeremonyPersonalization(launch = launchBrave, inspect) {
  const { ctx, id } = await launch();
  try {
    const domain = 'example.com';
    const root = `chrome-extension://${id}`;
    const options = await ctx.newPage();
    await options.goto(`${root}/options.html`);
    await waitFor(() => options.evaluate(async () => (await chrome.storage.local.get('meta')).meta?.installTs),
      'the worker initializes before the test seeds usage');
    const ownOnly = options.getByLabel('Use only my quotes');
    const quoteList = options.locator('#user-quotes');
    const optionStatus = options.locator('#quote-status');

    const now = new Date();
    const resetHour = (now.getHours() + 12) % 24;
    const today = new Date(now);
    today.setHours(resetHour, 0, 0, 0);
    if (now < today) today.setDate(today.getDate() - 1);
    const at = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, resetHour);
    const key = (offset) => {
      const date = at(offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const entry = (offset, site = domain) => ({ site, ts: at(offset).getTime() + 1000, affirmed: true });
    const record = (...overrides) => ({ perSite: {}, totalSec: 0, overrides });
    const settings = {
      version: 1, resetHour, combinedBudgetMin: 120, passSessionMin: 10,
      sites: [{ domain, limitMin: 10, passes: 3 }],
    };
    const state = {
      version: 1, dayStart: today.getTime(), perSiteSeconds: { [domain]: 11 * 60 },
      passesUntil: {}, passesUsed: { [domain]: 1 },
    };
    const put = (data) => options.evaluate((value) =>
      navigator.locks.request('extension-data', () => chrome.storage.local.set(value)), data);
    await put({ settings, state, history: {
      [key(0)]: record(entry(0)), [key(1)]: record(entry(1), entry(1, 'example.org')),
      [key(6)]: record(entry(6)), [key(7)]: record(entry(7)),
    } });
    await waitFor(() => options.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length === 1),
      'the exhausted site has an active blocking rule');

    await ownOnly.check();
    await options.locator('#quote-fallback').waitFor();
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(`https://${domain}/`);
    assert.equal(page.url(), `${root}/interstitial.html?s=${domain}`);
    const answer = page.getByRole('textbox', { name: 'Missing word' });
    const unlock = page.getByRole('button', { name: 'Quick Override' });
    const countdown = page.locator('#timer-label');
    const recent = page.locator('#recent-passes');
    const quote = page.locator('#quote');
    await answer.waitFor();
    assert.doesNotMatch(await quote.locator('cite').textContent(), /Personal quote/, 'own-only falls back when the list is empty');
    assert.equal(await recent.textContent(), 'You used 3 day-passes on this site in the last 7 days.');

    for (const { text } of personal) {
      await options.getByLabel('New quote').fill(` ${text} `);
      await options.getByRole('button', { name: 'Add quote' }).click();
      await quoteList.getByText(text, { exact: true }).waitFor();
    }
    assert.equal(await options.locator('#quote-fallback').isVisible(), false);

    await ownOnly.uncheck();
    await waitFor(async () => (await optionStatus.textContent()) === 'Quote preference saved.', 'mixed quote mode saves');
    const mixed = await options.evaluate(async () => {
      const next = () => chrome.runtime.sendMessage({ type: 'nextQuote', plainQuote: true });
      const order = [(await next()).text];
      const { deck } = await chrome.storage.local.get('deck');
      while (order.length < deck.cycleOrder.length) order.push((await next()).text);
      return order;
    });
    assert.ok(mixed.length > personal.length);
    assert.equal(new Set(mixed).size, mixed.length, 'mixed quotes appear exactly once per cycle');
    for (const { text } of personal) assert.ok(mixed.includes(text));

    await ownOnly.check();
    await waitFor(() => options.evaluate(async () => (await chrome.storage.local.get('userQuotes')).userQuotes?.ownOnly),
      'own-only mode saves before the ceremony draws');
    const displayed = async () => {
      await answer.waitFor();
      const masked = await quote.evaluate((element) => Array.from(element.childNodes).map((node) => {
        if (node instanceof HTMLInputElement) return node.placeholder;
        return node.nodeType === Node.TEXT_NODE ? node.textContent : '';
      }).join(''));
      const match = personal.find((item) => item.masked === masked);
      assert.ok(match, `expected a personal challenge, got ${masked}`);
      assert.ok(await answer.evaluate((input) => document.activeElement === input), 'the blank receives focus');
      assert.equal(await quote.locator('input').count(), 1);
      assert.ok(!(await quote.textContent()).includes(match.answer), 'the answer stays out of the quote text');
      assert.equal(await quote.locator('cite').textContent(), '— Personal quote');
      return match;
    };

    await page.reload();
    const first = await displayed();
    const pasteBlocked = await answer.evaluate((input, solution) => {
      const data = new DataTransfer();
      data.setData('text/plain', solution);
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    }, first.answer);
    assert.ok(pasteBlocked, 'the missing-word field blocks paste');
    assert.equal(await answer.inputValue(), '');
    await answer.fill(first.answer);
    await page.clock.runFor(10_000);
    assert.match(await countdown.textContent(), /^(19|20)s$/);
    assert.ok(await unlock.isDisabled(), 'a correct answer cannot skip the countdown');
    if (inspect) await inspect(page, options);

    await page.reload();
    const second = await displayed();
    assert.notEqual(second.text, first.text, 'reload draws the next personal quote');
    assert.match(await countdown.textContent(), /^(29|30)s$/, 'reload restarts the full countdown');
    assert.equal(await answer.inputValue(), '');
    await answer.fill('incorrect');
    await page.clock.fastForward(30_100);
    assert.equal(await countdown.textContent(), 'Ready');
    assert.ok(await unlock.isDisabled(), 'a wrong answer remains locked when the timer finishes');
    await answer.fill(` ${second.answer.toUpperCase()} `);
    assert.ok(await unlock.isEnabled(), 'a correct answer and a finished countdown unlock the button');
    await answer.fill('');
    assert.ok(await unlock.isDisabled(), 'changing the answer locks the button again');

    await put({ history: {}, state: { ...state, passesUsed: {} } });
    await page.reload();
    await displayed();
    assert.ok(await recent.isHidden(), 'the recent-passes line is hidden at zero');

    for (const { text } of personal) {
      const row = quoteList.getByRole('listitem').filter({ hasText: text });
      await row.getByRole('button', { name: /Remove quote/ }).click();
      await row.waitFor({ state: 'detached' });
    }
    await options.locator('#quote-fallback').waitFor();
    await page.reload();
    await answer.waitFor();
    assert.doesNotMatch(await quote.locator('cite').textContent(), /Personal quote/, 'removing the last quote restores the bundled deck');
    console.log('verify-ceremony-personalization: passed deck modes, reload, countdown and word gates, quote editor, and recent passes');
  } finally {
    await ctx.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyCeremonyPersonalization();
