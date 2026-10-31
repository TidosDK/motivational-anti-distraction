import '../../shared/style.css';
import { chromeKV, loadHistory, loadSettings, loadState } from '../../shared/storage';
import { buildStatsView, formatDuration } from '../../shared/stats';

const stats = document.querySelector<HTMLElement>('#stats')!;

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

function render(): void {
  void (async () => {
    const now = Date.now();
    const settings = await loadSettings(chromeKV);
    const state = await loadState(chromeKV, settings, now);
    const history = await loadHistory(chromeKV);
    const view = buildStatsView(settings, state, history, now);

    stats.textContent = '';

    // --- Today -------------------------------------------------------------
    const today = el('section', 'card');
    today.appendChild(el('h2', undefined, 'Today'));
    today.appendChild(
      el('p', 'muted', `Usage day since ${view.today.dayStartLabel} · resets ${view.today.resetsAtLabel}`),
    );

    if (view.today.sites.length === 0) {
      today.appendChild(el('p', 'muted', 'No sites blocked yet — add some in Settings.'));
    }
    for (const s of view.today.sites) {
      const row = el('div', 'usage-row');
      const info = el('div', 'usage-info');
      const label = el('div', 'usage-domain', s.domain);
      if (s.passActive) label.appendChild(el('span', 'badge', 'day-pass active'));
      info.appendChild(label);
      info.appendChild(
        el(
          'div',
          'muted',
          `${formatDuration(s.usedSec)}${s.limitMin != null ? ` of ${s.limitMin}m limit` : ' (no per-site limit)'}` +
            ` · passes ${s.passesUsed}/${s.passesTotal}`,
        ),
      );
      row.appendChild(info);
      if (s.fraction != null) row.appendChild(bar(s.fraction));
      today.appendChild(row);
    }

    const combined = el('div', 'usage-row combined');
    const combinedInfo = el('div', 'usage-info');
    combinedInfo.appendChild(el('div', 'usage-domain', 'Combined budget'));
    combinedInfo.appendChild(
      el(
        'div',
        'muted',
        `${formatDuration(view.today.combinedUsedSec)} of ${view.today.combinedBudgetMin}m`,
      ),
    );
    combined.appendChild(combinedInfo);
    combined.appendChild(bar(view.today.combinedFraction));
    today.appendChild(combined);

    if (view.today.overrides.length > 0) {
      today.appendChild(el('h3', undefined, 'Day-passes used today'));
      const list = el('ul', 'overrides');
      for (const o of view.today.overrides) {
        list.appendChild(el('li', undefined, `${o.site} — ${new Date(o.ts).toLocaleTimeString()}`));
      }
      today.appendChild(list);
    }
    stats.appendChild(today);

    // --- History -----------------------------------------------------------
    const hist = el('section', 'card');
    hist.appendChild(el('h2', undefined, 'Recent days'));
    if (view.history.length === 0) {
      hist.appendChild(el('p', 'muted', 'No closed usage days yet.'));
    }
    for (const day of view.history) {
      const row = el('div', 'history-row');
      row.appendChild(el('div', 'history-date', day.key));
      row.appendChild(el('div', 'history-total', formatDuration(day.record.totalSec)));
      const parts = Object.entries(day.record.perSite)
        .filter(([, sec]) => sec > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([d, sec]) => `${d} ${formatDuration(sec)}`);
      row.appendChild(el('div', 'muted history-detail', parts.join(' · ') || 'no usage'));
      if (day.record.overrides.length > 0) {
        row.appendChild(el('div', 'history-overrides', `${day.record.overrides.length} pass(es) used`));
      }
      hist.appendChild(row);
    }
    stats.appendChild(hist);
  })();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.state || changes.history || changes.settings)) render();
});

render();
