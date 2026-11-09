import '../../shared/style.css';
import { normalizeDomain } from '../../shared/domains';
import { chromeKV, loadSettings, saveSettings } from '../../shared/storage';
import type { Settings } from '../../shared/types';

document.querySelector<HTMLElement>('#version')!.textContent =
  `v${chrome.runtime.getManifest().version}`;

const settings: Settings = await loadSettings(chromeKV);

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
  await saveSettings(chromeKV, settings);
  saveStatus.textContent = message;
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

budgetInput.value = String(settings.combinedBudgetMin);
budgetInput.addEventListener('change', () => {
  settings.combinedBudgetMin = Math.max(1, Math.round(Number(budgetInput.value)) || 1);
  budgetInput.value = String(settings.combinedBudgetMin);
  void save();
});

resetInput.value = String(settings.resetHour);
resetInput.addEventListener('change', () => {
  settings.resetHour = Math.min(23, Math.max(0, Math.round(Number(resetInput.value)) || 0));
  resetInput.value = String(settings.resetHour);
  void save();
});

passSessionInput.value = String(settings.passSessionMin);
passSessionInput.addEventListener('change', () => {
  settings.passSessionMin = Math.max(1, Math.round(Number(passSessionInput.value)) || 1);
  passSessionInput.value = String(settings.passSessionMin);
  void save();
});

renderSites();
