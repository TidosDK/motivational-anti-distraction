import { computeBadgeStatus } from '../shared/stats';
import type { DayState, Settings } from '../shared/types';

const ICON_SIZES = [16, 32, 48, 128];

export async function updateActionStatus(settings: Settings, state: DayState, now: number): Promise<void> {
  const { badgeText, overBudget } = computeBadgeStatus(settings, state, now);
  const suffix = overBudget ? '-red' : '';
  const path = Object.fromEntries(ICON_SIZES.map((size) => [size, `icons/icon-${size}${suffix}.png`]));

  await chrome.action.setIcon({ path });
  await chrome.action.setBadgeBackgroundColor({ color: badgeText ? '#b32124' : [0, 0, 0, 0] });
  await chrome.action.setBadgeText({ text: badgeText });
}
