import '../../shared/style.css';
import { CONFESSIONS, LOCKOUT_SECONDS } from '../../shared/confessions';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const headline = $<HTMLElement>('#headline');
const sub = $<HTMLElement>('#sub');
const quoteEl = $<HTMLElement>('#quote');
const ceremony = $<HTMLFormElement>('#ceremony');
const confessionsBox = $<HTMLElement>('#confessions');
const overrideBtn = $<HTMLButtonElement>('#override');
const timerBar = $<HTMLElement>('#timer-bar');
const timerLabel = $<HTMLElement>('#timer-label');
const passesLeft = $<HTMLElement>('#passes-left');
const hardBlock = $<HTMLElement>('#hard-block');

const domain = new URLSearchParams(location.search).get('s');

document.querySelector('#go-back')!.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.replace('about:blank');
});
document.querySelector('#close-tab')!.addEventListener('click', () => {
  window.close();
});

if (!domain) {
  sub.textContent = 'No site specified.';
} else {
  headline.textContent = `${domain} is blocked for today`;
  const status = (await chrome.runtime.sendMessage({ type: 'siteStatus', domain })) as
    | { known: boolean; exhausted?: boolean; passesTotal?: number; passesUsed?: number; passesActive?: boolean }
    | undefined;

  if (!status?.known) {
    sub.textContent = 'This site is not in your blocked list.';
  } else if (status.passesActive) {
    sub.textContent = 'A day-pass is active for this site — opening it now.';
    location.replace(`https://${domain}`);
  } else {
    const quote = (await chrome.runtime.sendMessage({ type: 'nextQuote' })) as
      | { text: string; author: string }
      | undefined;
    if (quote) {
      quoteEl.textContent = `“${quote.text}”`;
      const cite = document.createElement('cite');
      cite.textContent = `— ${quote.author}`;
      quoteEl.appendChild(document.createElement('br'));
      quoteEl.appendChild(cite);
    }

    const passesRemaining = (status.passesTotal ?? 0) - (status.passesUsed ?? 0);
    if (status.exhausted && passesRemaining > 0) {
      sub.textContent = 'You have used today\u2019s time for this site.';
      await runCeremony(passesRemaining, status.passesTotal ?? 0);
    } else if (status.exhausted) {
      sub.textContent = 'You have used today\u2019s time for this site.';
      hardBlock.hidden = false;
    } else {
      sub.textContent = 'You still have time left on this site today.';
    }
  }
}

async function runCeremony(passesRemaining: number, passesTotal: number): Promise<void> {
  ceremony.hidden = false;
  passesLeft.textContent = `Day-passes left today: ${passesRemaining} of ${passesTotal}`;

  const boxes: HTMLInputElement[] = [];
  for (const text of CONFESSIONS) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', update);
    const span = document.createElement('span');
    span.textContent = text;
    label.append(input, span);
    confessionsBox.appendChild(label);
    boxes.push(input);
  }

  // The 30-second lockout starts now and runs while the quote is shown.
  // It lives only in this page load: reloading restarts it (anti-cheat).
  const start = Date.now();
  function update(): void {
    const elapsed = (Date.now() - start) / 1000;
    const remaining = Math.max(0, LOCKOUT_SECONDS - elapsed);
    timerBar.style.width = `${Math.min(100, (elapsed / LOCKOUT_SECONDS) * 100)}%`;
    timerLabel.textContent = remaining > 0 ? `${Math.ceil(remaining)}s` : 'Ready';
    overrideBtn.disabled = !(remaining <= 0 && boxes.every((b) => b.checked));
  }
  const interval = setInterval(() => {
    update();
    if (Date.now() - start >= LOCKOUT_SECONDS * 1000) clearInterval(interval);
  }, 200);
  update();

  ceremony.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (overrideBtn.disabled) return;
    overrideBtn.disabled = true;
    overrideBtn.textContent = 'Opening…';
    const res = (await chrome.runtime.sendMessage({ type: 'spendPass', domain })) as
      | { ok: boolean; url?: string; reason?: string }
      | undefined;
    if (res?.ok && res.url) {
      location.replace(res.url);
    } else {
      overrideBtn.textContent = 'Quick Override';
      passesLeft.textContent =
        res?.reason === 'no-passes-left' ? 'No day-passes left today.' : 'Could not spend a day-pass.';
      update();
    }
  });
}
