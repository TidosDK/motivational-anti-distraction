import '../../shared/style.css';
import { chromeKV, loadHistory, loadInstallMeta, loadSettings, loadState, withStorageLock } from '../../shared/storage';
import { buildHistoryViews, buildStatsView, formatDuration, type HistoryViews } from '../../shared/stats';
import { HISTORY_KEY, META_KEY, SETTINGS_KEY, STATE_KEY, type InstallMeta } from '../../shared/types';

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

const cellDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const cellMinutes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const monthName = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });

function renderHeatmap(cells: HistoryViews['heatmap']): HTMLElement {
  const scroll = el('div', 'heatmap-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Daily usage heatmap');

  const grid = el('div', 'heatmap-grid');
  const firstDate = new Date(`${cells[0].key}T00:00:00Z`);
  const leadingDays = (firstDate.getUTCDay() + 6) % 7;
  grid.style.setProperty('--weeks', String(Math.ceil((leadingDays + cells.length) / 7)));

  const weekdays = el('div', 'heatmap-weekdays');
  weekdays.setAttribute('aria-hidden', 'true');
  for (const [row, name] of [[2, 'Mon'], [4, 'Wed'], [6, 'Fri']] as const) {
    const weekday = el('span', 'heatmap-weekday', name);
    weekday.style.gridRow = String(row);
    weekdays.append(weekday);
  }
  grid.append(weekdays);

  let lastMonthColumn = -2;
  for (const [offset, { key, minutes, bucket }] of cells.entries()) {
    const dayInGrid = leadingDays + offset;
    const column = Math.floor(dayInGrid / 7) + 2;
    const date = new Date(`${key}T00:00:00Z`);

    if ((date.getUTCDate() === 1 || (offset === 0 && date.getUTCDate() <= 24)) && column > lastMonthColumn + 2) {
      const month = el('span', 'heatmap-month', monthName.format(date));
      month.style.gridColumn = String(column);
      month.setAttribute('aria-hidden', 'true');
      grid.append(month);
      lastMonthColumn = column;
    }

    const cell = el('span', 'heatmap-cell');
    cell.dataset.day = key;
    cell.dataset.bucket = String(bucket);
    cell.style.gridColumn = String(column);
    cell.style.gridRow = String(dayInGrid % 7 + 2);
    const time = minutes > 0 && minutes < 0.01 ? '<0.01' : cellMinutes.format(minutes);
    cell.title = `${cellDate.format(date)} · ${time} min`;
    cell.setAttribute('role', 'img');
    cell.setAttribute('aria-label', cell.title);
    grid.append(cell);
  }

  scroll.append(grid);
  return scroll;
}

function renderHistoryReports(report: HistoryViews, meta: InstallMeta | undefined): HTMLElement {
  const section = el('section', 'card history-reports');
  section.append(el('h2', undefined, 'Usage calendar'));

  if (report.heatmap.length) {
    section.append(renderHeatmap(report.heatmap));
    const legend = el('div', 'heatmap-legend muted');
    legend.append('Less');
    for (let bucket = 0; bucket <= 5; bucket++) {
      const swatch = el('span', 'heatmap-cell');
      swatch.dataset.bucket = String(bucket);
      swatch.setAttribute('aria-hidden', 'true');
      legend.append(swatch);
    }
    legend.append('More');
    section.append(legend);
  } else {
    section.append(el('p', 'muted', 'No usage days recorded yet.'));
  }

  const summary = el('div', 'history-summary');
  const streak = el('div', 'history-metric');
  streak.append(el('h3', undefined, 'Under-budget streaks'));
  const streakValue = el('p', 'report-streak', `Current ${report.streaks.current} · Best ${report.streaks.best} days`);
  streakValue.title = 'Compared with current budgets. Days with zero usage count toward the streak.';
  streak.append(streakValue, el('p', 'muted', 'Compared with current budgets'));

  const totals = el('div', 'history-metric');
  totals.append(el('h3', undefined, 'Recorded totals'));
  const { trackedSec, overrideCount, firstDay, lastDay, dayCount } = report.totals;
  const overrides = `${overrideCount} ${overrideCount === 1 ? 'override' : 'overrides'}`;
  totals.append(el('p', 'report-totals', `${formatDuration(trackedSec)} tracked · ${overrides}`));
  if (firstDay) {
    const dates = firstDay === lastDay ? firstDay : `${firstDay} – ${lastDay}`;
    totals.append(el('p', 'muted report-window', `${dates} · ${dayCount} usage ${dayCount === 1 ? 'day' : 'days'}`));
  }
  if (report.daysSinceInstall !== null) {
    const days = report.daysSinceInstall;
    const estimate = meta?.estimated ? ' (estimated from retained history)' : '';
    totals.append(el('p', 'muted report-install', `${days} usage ${days === 1 ? 'day' : 'days'} since install${estimate}`));
  }

  summary.append(streak, totals);
  section.append(summary);
  return section;
}

function render(): void {
  void (async () => {
    const { settings, state, history, now, meta } = await withStorageLock(async () => {
      const now = Date.now();
      const settings = await loadSettings(chromeKV);
      const state = await loadState(chromeKV, settings, now);
      const history = await loadHistory(chromeKV);
      const meta = await loadInstallMeta(chromeKV);
      return { settings, state, history, now, meta };
    });
    const view = buildStatsView(settings, state, history, now);
    const reports = buildHistoryViews(history, settings, state, now, meta?.installTs);
    const previousCalendar = stats.querySelector<HTMLElement>('.heatmap-scroll');
    const scrollLeft = previousCalendar?.scrollLeft;
    const keepLatest = !previousCalendar || previousCalendar.scrollWidth - previousCalendar.clientWidth - previousCalendar.scrollLeft <= 1;
    const keepFocus = previousCalendar === document.activeElement;

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
    const reportSection = renderHistoryReports(reports, meta);
    stats.append(reportSection);
    const calendar = reportSection.querySelector<HTMLElement>('.heatmap-scroll');
    if (calendar) {
      if (keepFocus) calendar.focus({ preventScroll: true });
      calendar.scrollLeft = keepLatest ? calendar.scrollWidth : scrollLeft ?? 0;
    }

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
  if (area === 'local' && (changes[STATE_KEY] || changes[HISTORY_KEY] || changes[SETTINGS_KEY] || changes[META_KEY])) render();
});

render();
