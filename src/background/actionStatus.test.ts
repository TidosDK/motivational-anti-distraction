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
    tabs: {
      query: vi.fn().mockResolvedValue([
        { id: 7, url: 'https://example.com/' },
        { id: 8, url: 'https://example.org/' },
      ]),
    },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });

  const settings = {
    ...DEFAULT_SETTINGS,
    sites: [{ domain: 'example.com', limitMin: 90, passes: 1 }],
    combinedBudgetMin: 60,
  };
  const now = new Date(2026, 9, 30, 20).getTime();
  const state = {
    ...freshState(usageDayStart(now, settings.resetHour)),
    perSiteSeconds: { 'example.com': 60 * 60 },
  };

  await updateActionStatus(settings, state, now);
  await updateActionStatus({ ...settings, combinedBudgetMin: 77 }, state, now);
  await updateActionStatus({ ...settings, sites: [] }, state, now);

  const badgeWrites = action.setBadgeText.mock.calls.map(([details]) => details);
  expect(badgeWrites.filter(({ tabId }) => tabId === 7)).toEqual([
    { tabId: 7, text: '0' }, { tabId: 7, text: '17m' }, { tabId: 7, text: '' },
  ]);
  expect(badgeWrites.filter(({ tabId }) => tabId !== 7).map(({ text }) => text))
    .toEqual(['', '', '', '', '', '']);
  expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 7, color: '#b32124' });
  expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 7, color: [0, 0, 0, 0] });
  const normalIcons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
  const redIcons = { 16: 'icons/icon-16-red.png', 32: 'icons/icon-32-red.png', 48: 'icons/icon-48-red.png', 128: 'icons/icon-128-red.png' };
  expect(action.setIcon).toHaveBeenCalledWith({ tabId: 7, path: redIcons });
  expect(action.setIcon).toHaveBeenCalledWith({ tabId: 7, path: normalIcons });
  expect(action.setIcon).toHaveBeenCalledWith({ tabId: 8, path: normalIcons });
});
