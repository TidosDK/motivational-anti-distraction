import '../../shared/style.css';
import { buildBackup, buildHistoryCsv, buildOverridesCsv, parseBackup } from '../../shared/backup';
import { dayKey } from '../../shared/dayMath';
import { normalizeDomain } from '../../shared/domains';
import { chromeKV, loadDeck, loadHistory, loadSettings, loadState, normalizeSettings, saveSettings, withStorageLock } from '../../shared/storage';
import { DECK_KEY, HISTORY_KEY, SETTINGS_KEY, STATE_KEY, type Settings } from '../../shared/types';

document.querySelector<HTMLElement>('#version')!.textContent =
  `v${chrome.runtime.getManifest().version}`;

let settings: Settings = await loadSettings(chromeKV);

const tbody = document.querySelector('#site-table tbody')!;
const emptyHint = document.querySelector<HTMLElement>('#empty-hint')!;
const addForm = document.querySelector<HTMLFormElement>('#add-site')!;
const addInput = document.querySelector<HTMLInputElement>('#add-domain')!;
const addError = document.querySelector<HTMLElement>('#add-error')!;
const budgetInput = document.querySelector<HTMLInputElement>('#combined-budget')!;
const resetInput = document.querySelector<HTMLInputElement>('#reset-hour')!;
const passSessionInput = document.querySelector<HTMLInputElement>('#pass-session')!;
const saveStatus = document.querySelector<HTMLElement>('#save-status')!;

let statusTimer: ReturnType<typeof setTimeout> | undefined;

async function save(message = 'Saved'): Promise<void> {
  const snapshot = structuredClone(settings);
  try {
    await withStorageLock(() => saveSettings(chromeKV, snapshot));
    saveStatus.textContent = message;
  } catch (error) {
    saveStatus.textContent = errorMessage('Could not save settings.', error);
  }
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (saveStatus.textContent = ''), 2000);
}

function renderSites(): void {
  tbody.textContent = '';
  emptyHint.hidden = settings.sites.length > 0;
  for (const site of settings.sites) {
    const row = document.createElement('tr');

    const domainCell = document.createElement('td');
    domainCell.textContent = site.domain;

    const limitCell = document.createElement('td');
    const limit = document.createElement('input');
    limit.type = 'number';
    limit.min = '1';
    limit.step = '1';
    limit.placeholder = '—';
    limit.title = 'Leave empty for no per-site limit (combined budget still applies)';
    if (site.limitMin != null) limit.value = String(site.limitMin);
    limit.addEventListener('change', () => {
      const v = limit.value.trim();
      site.limitMin = v === '' ? null : Math.max(1, Math.round(Number(v)) || 1);
      limit.value = site.limitMin == null ? '' : String(site.limitMin);
      void save();
    });
    limitCell.appendChild(limit);

    const passesCell = document.createElement('td');
    const passes = document.createElement('input');
    passes.type = 'number';
    passes.min = '0';
    passes.step = '1';
    passes.value = String(site.passes);
    passes.addEventListener('change', () => {
      site.passes = Math.max(0, Math.round(Number(passes.value)) || 0);
      passes.value = String(site.passes);
      void save();
    });
    passesCell.appendChild(passes);

    const removeCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      settings.sites = settings.sites.filter((s) => s.domain !== site.domain);
      renderSites();
      void save('Removed');
    });
    removeCell.appendChild(remove);

    row.append(domainCell, limitCell, passesCell, removeCell);
    tbody.appendChild(row);
  }
}

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addError.textContent = '';
  const domain = normalizeDomain(addInput.value);
  if (!domain) {
    addError.textContent = 'Please enter a valid domain, e.g. youtube.com';
    return;
  }
  if (settings.sites.some((s) => s.domain === domain)) {
    addError.textContent = `${domain} is already blocked.`;
    return;
  }
  settings.sites.push({ domain, limitMin: null, passes: 1 });
  settings.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  addInput.value = '';
  renderSites();
  void save(`Blocked ${domain}`);
});

budgetInput.addEventListener('change', () => {
  settings.combinedBudgetMin = Math.max(1, Math.round(Number(budgetInput.value)) || 1);
  budgetInput.value = String(settings.combinedBudgetMin);
  void save();
});

resetInput.addEventListener('change', () => {
  settings.resetHour = Math.min(23, Math.max(0, Math.round(Number(resetInput.value)) || 0));
  resetInput.value = String(settings.resetHour);
  void save();
});

passSessionInput.addEventListener('change', () => {
  settings.passSessionMin = Math.max(1, Math.round(Number(passSessionInput.value)) || 1);
  passSessionInput.value = String(settings.passSessionMin);
  void save();
});

function renderSettings(): void {
  budgetInput.value = String(settings.combinedBudgetMin);
  resetInput.value = String(settings.resetHour);
  passSessionInput.value = String(settings.passSessionMin);
  renderSites();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SETTINGS_KEY]) return;
  const restored = normalizeSettings(changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined);
  if (JSON.stringify(settings) === JSON.stringify(restored)) return;
  settings = restored;
  renderSettings();
});

renderSettings();

const backupFile = document.querySelector<HTMLInputElement>('#backup-file')!;
const importButton = document.querySelector<HTMLButtonElement>('#import-backup')!;
const dataStatus = document.querySelector<HTMLElement>('#data-status')!;

function errorMessage(message: string, error: unknown): string {
  return error instanceof Error ? `${message} ${error.message}` : message;
}

function showDataStatus(message: string, isError = false): void {
  dataStatus.textContent = message;
  dataStatus.classList.toggle('error', isError);
}

function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to accept the download before revoking its URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showDataStatus(`Exported ${filename}.`);
}

async function exportBackup(): Promise<void> {
  try {
    const backup = await withStorageLock(async () => {
      const now = Date.now();
      const settings = await loadSettings(chromeKV);
      const state = await loadState(chromeKV, settings, now);
      const history = await loadHistory(chromeKV);
      const deck = await loadDeck(chromeKV);
      return buildBackup(settings, state, history, deck, now);
    });
    download(JSON.stringify(backup, null, 2) + '\n', 'application/json', `anti-distraction-backup-${dayKey(Date.now())}.json`);
  } catch (error) {
    showDataStatus(errorMessage('Could not export backup.', error), true);
  }
}

async function exportCsv(kind: 'history' | 'overrides'): Promise<void> {
  try {
    const history = await withStorageLock(() => loadHistory(chromeKV));
    const content = kind === 'history' ? buildHistoryCsv(history) : buildOverridesCsv(history);
    download(content, 'text/csv;charset=utf-8', `anti-distraction-${kind}-${dayKey(Date.now())}.csv`);
  } catch (error) {
    showDataStatus(errorMessage('Could not export CSV.', error), true);
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error('The file read was cancelled.'));
    reader.readAsText(file);
  });
}

async function importBackup(file: File): Promise<void> {
  importButton.disabled = true;
  showDataStatus('Checking backup…');
  try {
    const result = parseBackup(await readFile(file));
    if (!result.ok) {
      showDataStatus(result.errors.join('\n'), true);
      return;
    }
    if (!window.confirm('Replace the current settings, usage, history, and quote-deck position with this backup?')) {
      showDataStatus('Import cancelled.');
      return;
    }

    const data = result.data;
    await withStorageLock(() => chromeKV.set({
      [SETTINGS_KEY]: data.settings,
      [STATE_KEY]: data.state,
      [HISTORY_KEY]: data.history,
      [DECK_KEY]: data.deck,
    }));
    settings = data.settings;
    renderSettings();
    showDataStatus('Backup restored.');
  } catch (error) {
    showDataStatus(errorMessage('Could not restore backup.', error), true);
  } finally {
    importButton.disabled = false;
  }
}

document.querySelector('#export-backup')!.addEventListener('click', () => void exportBackup());
document.querySelector('#export-history')!.addEventListener('click', () => void exportCsv('history'));
document.querySelector('#export-overrides')!.addEventListener('click', () => void exportCsv('overrides'));
importButton.addEventListener('click', () => backupFile.click());
backupFile.addEventListener('change', () => {
  const file = backupFile.files?.[0];
  backupFile.value = '';
  if (file && !importButton.disabled) void importBackup(file);
});
