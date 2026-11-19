import { BrowserWindow, nativeTheme } from 'electron';
import { DEFAULT_SETTINGS, Settings } from '@shared/types';
import { kvGet, kvSet } from './db';

let cache: Settings | null = null;
const listeners = new Set<(s: Settings, prev: Settings) => void>();

export function getSettings(): Settings {
  if (!cache) {
    const stored = kvGet<Partial<Settings>>('settings', {});
    cache = { ...DEFAULT_SETTINGS, ...stored, shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(stored.shortcuts || {}) } };
  }
  return cache;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const prev = getSettings();
  const next = { ...prev, ...patch } as Settings;
  cache = next;
  kvSet('settings', next);
  for (const l of listeners) {
    try { l(next, prev); } catch (e) { console.error(e); }
  }
  broadcast('settings:changed', next);
  return next;
}

export function resetSettings(): Settings {
  const keep = { setupComplete: true, originalWindowsWallpaper: getSettings().originalWindowsWallpaper };
  cache = null;
  kvSet('settings', keep);
  return setSettings({});
}

export function onSettings(fn: (s: Settings, prev: Settings) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resolvedTheme(): 'light' | 'dark' {
  const t = getSettings().theme;
  if (t === 'auto') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return t;
}

export function broadcast(channel: string, ...args: unknown[]) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  }
}
