import '../../shared/style.css';
import { chromeKV, loadSettings, loadState } from '../../shared/storage';
import { buildPopupView, formatDuration } from '../../shared/stats';

const popup = document.querySelector<HTMLElement>('#popup')!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function bar(fraction: number): HTMLElement {
  const outer = el('div', 'meter');
  const inner = el('div', 'meter-fill');
  inner.style.width = `${Math.round(fraction * 100)}%`;
  outer.appendChild(inner);
  return outer;
}

/** "5:00 PM" / "5:00 PM tomorrow" — popup-sized reset label. */
function fmtReset(ts: number, now: number): string {
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = new Date(ts).toDateString() === new Date(now).toDateString();
  return sameDay ? time : `${time} tomorrow`;
}

function render(): void {
  void (async () => {
    const now = Date.now();
    const settings = await loadSettings(chromeKV);
    const state = await loadState(chromeKV, settings, now);
    const view = buildPopupView(settings, state, now);

    popup.textContent = '';
    popup.appendChild(el('h1', undefined, 'Time left today'));
    popup.appendChild(el('p', 'muted', `Resets ${fmtReset(view.resetsAt, now)}`));

    if (view.sites.length === 0) {
      popup.appendChild(el('p', 'muted', 'No sites blocked yet — add some in Options.'));
    }
    for (const s of view.sites) {
      const row = el('div', 'usage-row');
      const info = el('div', 'usage-info');
      const label = el('div', 'usage-domain', s.domain);
      if (s.remainingSec === 0) label.appendChild(el('span', 'badge', 'exhausted'));
      info.appendChild(label);
      info.appendChild(
        el(
          'div',
          'muted',
          s.remainingSec != null
            ? `${formatDuration(s.remainingSec)} left of ${s.limitMin}m · ${formatDuration(s.usedSec)} used`
            : `${formatDuration(s.usedSec)} used · no per-site limit`,
        ),
      );
      row.appendChild(info);
      if (s.fraction != null) row.appendChild(bar(s.fraction));
      popup.appendChild(row);
    }

    const combined = el('div', 'usage-row combined');
    const combinedInfo = el('div', 'usage-info');
    combinedInfo.appendChild(el('div', 'usage-domain', 'Combined budget'));
    combinedInfo.appendChild(
      el(
        'div',
        'muted',
        `${formatDuration(view.combinedRemainingSec)} left of ${view.combinedBudgetMin}m`,
      ),
    );
    combined.appendChild(combinedInfo);
    combined.appendChild(bar(view.combinedFraction));
    popup.appendChild(combined);

    const footer = el('div', 'popup-footer');
    const link = el('a', undefined, 'Open Options');
    link.id = 'open-options';
    link.href = '#';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      void chrome.runtime.openOptionsPage();
    });
    footer.appendChild(link);
    popup.appendChild(footer);
  })();
}

// Live updates: the worker rewrites `state` on every accrual flush, and
// settings edits land here too — same pattern as the stats page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.state || changes.settings)) render();
});

render();
