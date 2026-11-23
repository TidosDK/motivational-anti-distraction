import '../../shared/style.css';
import { dayIndex, keyAtDayIndex } from '../../shared/dayMath';
import { chromeKV, loadHistory, loadInstallMeta, loadSettings, loadState, withStorageLock } from '../../shared/storage';
import { buildHistoryViews, buildStatsView, formatDuration, type HistoryViews, type UsageBudgetStatus, type UsageReportDay } from '../../shared/stats';
import { HISTORY_KEY, META_KEY, SETTINGS_KEY, STATE_KEY } from '../../shared/types';

const stats = document.querySelector<HTMLElement>('#stats')!;
const SHOW_USAGE_CALENDAR: boolean = false;
let selectedWeek: number | undefined;
let selectedDay: string | undefined;

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
const percentage = new Intl.NumberFormat(undefined, { style: 'percent' });
const monthName = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const reportDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

function dateForDay(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function minuteLabel(minutes: number): string {
  return `${minutes > 0 && minutes < 0.01 ? '<0.01' : cellMinutes.format(minutes)} min`;
}

function roundedUsage(minutes: number): string {
  const wholeMinutes = Math.round(minutes);
  return wholeMinutes > 0 ? formatDuration(wholeMinutes * 60) : '0m';
}

function positiveSiteTimes(perSite: UsageReportDay['perSite']): [string, number][] {
  return Object.entries(perSite)
    .filter(([, seconds]) => seconds > 0)
    .sort((a, b) => b[1] - a[1]);
}

function renderDaySites(perSite: UsageReportDay['perSite']): HTMLElement {
  const sites = positiveSiteTimes(perSite);
  if (!sites.length) return el('p', 'muted', 'No website usage recorded for this day.');

  const total = sites.reduce((sum, [, seconds]) => sum + seconds, 0);
  const list = el('ul', 'day-site-list');
  for (const [domain, seconds] of sites) {
    const share = seconds / total;
    const duration = seconds < 60 ? '<1m' : roundedUsage(seconds / 60);
    const shareLabel = share < 0.01 ? `<${percentage.format(0.01)}` : percentage.format(share);
    const row = el('li', 'day-site');
    const meter = bar(share);
    meter.setAttribute('aria-hidden', 'true');
    row.append(
      el('span', 'day-site-name', domain),
      el('span', 'day-site-time', duration),
      el('span', 'muted day-site-share', shareLabel),
      meter,
    );
    list.append(row);
  }
  return list;
}

function combinedBudgetLabel(exceeded: boolean): string {
  return exceeded ? 'Over combined budget' : 'Within combined budget';
}

function budgetStatus({ combinedExceeded, exceededSites }: UsageBudgetStatus): HTMLElement {
  const kind = combinedExceeded ? 'over' : exceededSites.length > 0 ? 'site' : 'within';
  const label = kind === 'site' ? 'Site limit exceeded' : combinedBudgetLabel(combinedExceeded);
  const status = el('span', 'budget-status', label);
  status.dataset.budget = kind;
  return status;
}

function renderHeatmap(cells: UsageReportDay[]): HTMLElement {
  const scroll = el('div', 'heatmap-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Daily usage heatmap');

  const grid = el('div', 'heatmap-grid');
  const firstDate = dateForDay(cells[0].key);
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
    const date = dateForDay(key);

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
    cell.title = `${cellDate.format(date)} · ${minuteLabel(minutes)}`;
    cell.setAttribute('role', 'img');
    cell.setAttribute('aria-label', cell.title);
    grid.append(cell);
  }

  scroll.append(grid);
  return scroll;
}

function renderWeeklyUsage(report: HistoryViews, budgetMin: number): { chart: HTMLElement; sites: HTMLElement } {
  const chart = el('div', 'weekly-usage');
  const first = dayIndex(report.days[0].key);
  const latestWeek = dayIndex(report.totals.lastDay) - 6;
  const earliestWeek = latestWeek - Math.floor((report.days.length - 1) / 7) * 7;
  let week = Math.max(earliestWeek, Math.min(latestWeek, selectedWeek ?? latestWeek));

  const navigation = el('div', 'week-navigation');
  const previous = el('button', 'week-arrow', '‹');
  const next = el('button', 'week-arrow', '›');
  previous.type = next.type = 'button';
  previous.setAttribute('aria-label', 'Previous week');
  next.setAttribute('aria-label', 'Next week');
  const dateRange = el('p', 'week-range');
  dateRange.setAttribute('aria-live', 'polite');
  navigation.append(previous, dateRange, next);

  const summary = el('div', 'week-summary');
  const average = el('dl', 'week-average');
  const averageValue = el('dd', 'week-average-value');
  average.append(el('dt', 'week-average-label', 'Daily average'), averageValue);
  summary.append(average, el('p', 'week-budget muted', `Combined budget ${formatDuration(budgetMin * 60)}`));

  const plot = el('div', 'week-plot');
  const grid = el('div', 'week-days');
  const axis = el('div', 'week-axis');
  axis.setAttribute('aria-hidden', 'true');
  const budgetLine = el('div', 'week-budget-line');
  axis.append(budgetLine);
  plot.append(grid, axis);

  const detail = el('div', 'week-detail');
  detail.setAttribute('aria-live', 'polite');
  chart.append(navigation, summary, plot, detail);

  const sites = el('section', 'day-sites');
  sites.id = 'day-sites';
  const siteHeading = el('h3', undefined, 'Website usage');
  siteHeading.id = 'day-sites-heading';
  const siteContent = el('div');
  sites.setAttribute('aria-labelledby', siteHeading.id);
  sites.append(siteHeading, siteContent);

  function drawWeek(): void {
    previous.disabled = week === earliestWeek;
    next.disabled = week === latestWeek;
    dateRange.textContent = reportDate.formatRange(dateForDay(keyAtDayIndex(week)), dateForDay(keyAtDayIndex(week + 6)));

    const days = report.days.slice(Math.max(0, week - first), Math.max(0, week + 7 - first));
    const scale = Math.max(1, budgetMin, ...days.map(({ minutes }) => minutes)) * 1.12;
    budgetLine.style.bottom = `${budgetMin / scale * 100}%`;
    const mean = days.reduce((sum, day) => sum + day.minutes, 0) / days.length;
    averageValue.textContent = formatDuration(mean * 60);
    grid.replaceChildren();

    const buttons = new Map<string, HTMLButtonElement>();
    function select(day: UsageReportDay): void {
      for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === day.key));
      detail.replaceChildren(
        el('span', 'week-detail-date', cellDate.format(dateForDay(day.key))),
        el('strong', undefined, roundedUsage(day.minutes)),
        budgetStatus(day.budget),
      );
      siteContent.replaceChildren(renderDaySites(day.perSite));
    }

    for (let index = week; index < week + 7; index++) {
      const key = keyAtDayIndex(index);
      const date = dateForDay(key);
      const day = report.days[index - first];
      const button = el('button', 'week-day');
      button.type = 'button';
      button.dataset.day = key;
      const slot = el('span', 'week-bar-slot');
      button.append(slot, el('span', 'week-day-label', weekdayName.format(date)));
      if (day) {
        const fill = el('span', 'week-bar-fill');
        fill.style.height = `${day.minutes / scale * 100}%`;
        fill.dataset.budget = day.budget.combinedExceeded ? 'over' : 'within';
        slot.append(fill);
        button.title = `${cellDate.format(date)} · ${roundedUsage(day.minutes)} · ${combinedBudgetLabel(day.budget.combinedExceeded)}`;
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-controls', sites.id);
        button.addEventListener('click', () => {
          selectedDay = key;
          select(day);
        });
        buttons.set(key, button);
      } else {
        button.disabled = true;
        button.setAttribute('aria-label', `${cellDate.format(date)} · No usage day in this report`);
      }
      grid.append(button);
    }
    select(days.find(({ key }) => key === selectedDay) ?? days[days.length - 1]);
  }

  previous.addEventListener('click', () => {
    week = Math.max(earliestWeek, week - 7);
    selectedWeek = week;
    selectedDay = undefined;
    drawWeek();
  });
  next.addEventListener('click', () => {
    week = Math.min(latestWeek, week + 7);
    selectedWeek = week === latestWeek ? undefined : week;
    selectedDay = undefined;
    drawWeek();
  });
  drawWeek();
  return { chart, sites };
}

function renderHistoryReports(report: HistoryViews, budgetMin: number): HTMLElement {
  const section = el('section', 'card history-reports');
  section.append(el('h2', undefined, SHOW_USAGE_CALENDAR ? 'Usage calendar' : 'Daily usage'));
  let siteBreakdown: HTMLElement | undefined;

  if (!report.days.length) {
    section.append(el('p', 'muted', 'No usage days recorded yet.'));
  } else if (SHOW_USAGE_CALENDAR) {
    section.append(renderHeatmap(report.days));
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
    const { chart, sites } = renderWeeklyUsage(report, budgetMin);
    section.append(chart);
    siteBreakdown = sites;
  }

  const summary = el('div', 'history-summary');
  const streak = el('div', 'history-metric');
  streak.append(el('h3', undefined, 'Under-budget Streaks'));
  const streakValue = el('p', 'report-streak', `Current ${report.streaks.current} · Best ${report.streaks.best} days`);
  streakValue.title = 'Compared with current budgets. Days with zero usage count toward the streak.';
  streak.append(streakValue);

  const totals = el('div', 'history-metric');
  totals.append(el('h3', undefined, 'Total Recorded'));
  const { trackedSec, overrideCount, firstDay, lastDay } = report.totals;
  const overrides = `${overrideCount} ${overrideCount === 1 ? 'override' : 'overrides'}`;
  totals.append(el('p', 'report-totals', `${formatDuration(trackedSec)} tracked · ${overrides}`));
  if (firstDay) {
    const dates = reportDate.formatRange(dateForDay(firstDay), dateForDay(lastDay));
    totals.append(el('p', 'muted report-window', dates));
  }

  summary.append(streak, totals);
  section.append(summary);
  if (siteBreakdown) section.append(siteBreakdown);
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
    const reportSection = renderHistoryReports(reports, settings.combinedBudgetMin);
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
      const parts = positiveSiteTimes(day.record.perSite)
        .map(([d, sec]) => `${d} ${formatDuration(sec)}`);
      row.appendChild(el('div', 'muted history-detail', parts.join(' · ') || 'no usage'));
      const status = el('div', 'history-status');
      const badge = budgetStatus(day.budget);
      const { exceededSites } = day.budget;
      if (exceededSites.length) badge.title = `Exceeded ${exceededSites.join(', ')}`;
      status.append(badge);
      if (day.record.overrides.length > 0) {
        status.append(el('span', 'history-overrides', `${day.record.overrides.length} pass(es) used`));
      }
      row.append(status);
      hist.appendChild(row);
    }
    stats.appendChild(hist);

    const days = reports.daysSinceInstall;
    if (days !== null) {
      const footer = el('footer');
      const estimate = meta?.estimated ? ' (estimated from retained history)' : '';
      footer.append(el('p', 'muted report-install', `${days} usage ${days === 1 ? 'day' : 'days'} since install${estimate}`));
      stats.append(footer);
    }
  })();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STATE_KEY] || changes[HISTORY_KEY] || changes[SETTINGS_KEY] || changes[META_KEY])) render();
});

render();
