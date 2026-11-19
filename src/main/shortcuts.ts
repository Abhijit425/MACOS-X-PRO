import { globalShortcut } from 'electron';
import { getSettings } from './settings';
import type { Shortcuts } from '@shared/types';

type Handlers = Record<keyof Shortcuts, () => void>;
let handlers: Handlers | null = null;
let status: Record<string, { accelerator: string; ok: boolean }> = {};

export function registerShortcuts(h?: Handlers) {
  if (h) handlers = h;
  if (!handlers) return status;
  globalShortcut.unregisterAll();
  status = {};
  const sc = getSettings().shortcuts;
  for (const key of Object.keys(sc) as (keyof Shortcuts)[]) {
    const acc = sc[key];
    if (!acc) { status[key] = { accelerator: '', ok: false }; continue; }
    let ok = false;
    try { ok = globalShortcut.register(acc, handlers[key]); } catch { ok = false; }
    status[key] = { accelerator: acc, ok }; // ok=false → another app already owns this key combo
  }
  return status;
}
export const shortcutStatus = () => status;
