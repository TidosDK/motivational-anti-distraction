import { afterEach, expect, it, vi } from 'vitest';
import { usageDayStart } from '../shared/dayMath';
import { freshState } from '../shared/storage';
import { DEFAULT_SETTINGS } from '../shared/types';
import { updateActionStatus } from './actionStatus';

afterEach(() => vi.unstubAllGlobals());

it('sets the badge and restores the normal icon when the budget recovers or sites are cleared', async () => {
  const action = {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setIcon: vi.fn(),
  };
  vi.stubGlobal('chrome', {
    action,
    tabs: { query: vi.fn().mockResolvedValue([]) },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });

  const settings = {
    ...DEFAULT_SETTINGS,
    sites: [{ domain: 'example.com', limitMin: null, passes: 1 }],
    combinedBudgetMin: 60,
  };
  const now = new Date(2026, 9, 30, 20).getTime();
  const state = {
    ...freshState(usageDayStart(now, settings.resetHour)),
    perSiteSeconds: { 'example.com': 60 * 60 },
  };

  await updateActionStatus(settings, state, now);
  await updateActionStatus({ ...settings, combinedBudgetMin: 210 }, state, now);
  await updateActionStatus({ ...settings, combinedBudgetMin: 660 }, state, now);
  await updateActionStatus({ ...settings, combinedBudgetMin: 107 }, state, now);
  await updateActionStatus(settings, state, now);
  await updateActionStatus({ ...settings, sites: [] }, state, now);

  expect(action.setBadgeText.mock.calls.map(([details]) => details.text)).toEqual([
    '0', '2h', '9h+', '47', '0', '',
  ]);
  expect(action.setBadgeBackgroundColor).toHaveBeenNthCalledWith(1, { color: '#b32124' });
  expect(action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({ color: [0, 0, 0, 0] });
  const normalIcons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
  const redIcons = { 16: 'icons/icon-16-red.png', 32: 'icons/icon-32-red.png', 48: 'icons/icon-48-red.png', 128: 'icons/icon-128-red.png' };
  expect(action.setIcon).toHaveBeenNthCalledWith(1, { path: redIcons });
  expect(action.setIcon).toHaveBeenNthCalledWith(2, { path: normalIcons });
  expect(action.setIcon).toHaveBeenNthCalledWith(5, { path: redIcons });
  expect(action.setIcon).toHaveBeenLastCalledWith({ path: normalIcons });
});
