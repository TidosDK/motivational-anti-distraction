import '../../shared/style.css';
import { LOCKOUT_SECONDS, quoteCharacters, quoteTypingProgress, typingQuoteText } from '../../shared/ceremony';
import type { Quote } from '../../shared/quotes';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const headline = $<HTMLElement>('#headline');
const sub = $<HTMLElement>('#sub');
const quoteEl = $<HTMLElement>('#quote');
const ceremony = $<HTMLFormElement>('#ceremony');
const answer = $<HTMLTextAreaElement>('#quote-answer');
const typingStatus = $<HTMLElement>('#typing-status');
const recentPasses = $<HTMLElement>('#recent-passes');
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
    | {
        known: boolean;
        exhausted?: boolean;
        passesTotal?: number;
        passesUsed?: number;
        passesLast7Days?: number;
        passesActive?: boolean;
        passExpiresAt?: number | null;
      }
    | undefined;

  if (!status?.known) {
    sub.textContent = 'This site is not in your blocked list.';
  } else if (status.passesActive) {
    const mins = status.passExpiresAt
      ? Math.max(0, Math.ceil((status.passExpiresAt - Date.now()) / 60_000))
      : null;
    sub.textContent = mins != null
      ? `A day-pass is active for this site (${mins} min left) — opening it now.`
      : 'A day-pass is active for this site — opening it now.';
    location.replace(`https://${domain}`);
  } else {
    const passesTotal = status.passesTotal ?? 0;
    const passesRemaining = passesTotal - (status.passesUsed ?? 0);
    const canSpend = !!status.exhausted && passesRemaining > 0;
    const quote = (await chrome.runtime.sendMessage({ type: 'nextQuote' })) as Quote | undefined;
    sub.textContent = status.exhausted
      ? 'You have used today’s time for this site.'
      : 'You still have time left on this site today.';

    if (canSpend) {
      if (quote) runCeremony(quote, passesRemaining, passesTotal);
      else sub.textContent = 'Could not load the ceremony. Reload to try again.';
    } else {
      if (quote) renderQuote(quote);
      hardBlock.hidden = !status.exhausted;
    }

    const count = status.passesLast7Days ?? 0;
    if (status.exhausted && count > 0) {
      recentPasses.textContent = `You used ${count} ${count === 1 ? 'day-pass' : 'day-passes'} on this site in the last 7 days.`;
      recentPasses.hidden = false;
    }
  }
}

function renderQuote(quote: Quote, content: string | Node = `“${quote.text}”`): void {
  const cite = document.createElement('cite');
  cite.textContent = `— ${quote.author}`;
  quoteEl.replaceChildren(content, cite);
}

function runCeremony(quote: Quote, passesRemaining: number, passesTotal: number): void {
  const text = typingQuoteText(quote.text);
  const characters = quoteCharacters(text);
  const readableQuote = document.createElement('span');
  readableQuote.id = 'quote-target';
  readableQuote.className = 'visually-hidden';
  readableQuote.textContent = text;

  const preview = document.createElement('span');
  preview.id = 'quote-preview';
  preview.setAttribute('aria-hidden', 'true');
  const letters = characters.map((character) => {
    const span = document.createElement('span');
    span.textContent = character;
    return span;
  });
  preview.append(...letters);
  const prompt = document.createDocumentFragment();
  prompt.append(readableQuote, preview);
  renderQuote(quote, prompt);

  answer.addEventListener('paste', (event) => event.preventDefault());
  answer.addEventListener('drop', (event) => event.preventDefault());
  answer.addEventListener('input', updateTyping);

  answer.value = '';
  ceremony.hidden = false;
  passesLeft.textContent = `Day-passes left today: ${passesRemaining} of ${passesTotal}`;
  answer.focus({ preventScroll: true });
  let spending = false;
  let complete = false;

  // The 30-second lockout starts now and runs while the quote is shown.
  // It lives only in this page load: reloading restarts it (anti-cheat).
  const start = Date.now();
  function updateTimer(): void {
    const elapsed = (Date.now() - start) / 1000;
    const remaining = Math.max(0, LOCKOUT_SECONDS - elapsed);
    timerBar.style.width = `${Math.min(100, (elapsed / LOCKOUT_SECONDS) * 100)}%`;
    timerLabel.textContent = remaining > 0 ? `${Math.ceil(remaining)}s` : 'Ready';
    overrideBtn.disabled = spending || remaining > 0 || !complete;
  }

  function updateTyping(): void {
    const progress = quoteTypingProgress(characters, answer.value);
    complete = progress.complete;
    for (const [index, letter] of letters.entries()) letter.dataset.typing = progress.marks[index];

    let message = '';
    if (complete) message = 'Quote matched.';
    else if (progress.hasExtra) message = 'Remove the extra characters.';
    else if (progress.hasErrors) message = 'Check the underlined characters.';
    if (typingStatus.textContent !== message) typingStatus.textContent = message;
    answer.setAttribute('aria-invalid', String(progress.hasExtra || progress.hasErrors));
    updateTimer();
  }

  const interval = setInterval(() => {
    updateTimer();
    if (Date.now() - start >= LOCKOUT_SECONDS * 1000) clearInterval(interval);
  }, 200);
  updateTyping();

  ceremony.addEventListener('submit', async (e) => {
    e.preventDefault();
    updateTyping();
    if (overrideBtn.disabled) return;
    spending = true;
    overrideBtn.disabled = true;
    overrideBtn.textContent = 'Opening…';
    const res: { ok: boolean; url?: string; reason?: string } | undefined = await chrome.runtime
      .sendMessage({ type: 'spendPass', domain }).catch(() => undefined);
    if (res?.ok && res.url) {
      location.replace(res.url);
    } else {
      spending = false;
      overrideBtn.textContent = 'Quick Override';
      passesLeft.textContent =
        res?.reason === 'no-passes-left' ? 'No day-passes left today.' : 'Could not spend a day-pass.';
      updateTimer();
    }
  });
}
