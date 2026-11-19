// Menu bar menus. Edit-menu commands are delivered to the app you were using (the menu bar never
// takes keyboard focus), so Copy/Paste etc. act on the foreground Windows application.
import type { MenuItem } from '../components/ui';
import { api, openApp } from '../lib/api';
import type { FileEntry, Settings } from '@shared/types';

const K = { CTRL: 0x11, SHIFT: 0x10, ALT: 0x12, Z: 0x5a, Y: 0x59, X: 0x58, C: 0x43, V: 0x56, A: 0x41, F: 0x46, F4: 0x73, N: 0x4e, S: 0x53, P: 0x50, W: 0x57, LWIN: 0x5b, DOWN: 0x28, UP: 0x28 - 2, LEFT: 0x25, RIGHT: 0x27 };
const keys = (...v: number[]) => () => void api.invoke('keys:send', v);

export interface MenuCtx {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  recent: FileEntry[];
  openPanel: (kind: string) => void;
  power: (action: 'sleep' | 'restart' | 'shutdown' | 'logout' | 'lock') => void;
  appWindows: { app: string; windows: { id: number; title: string }[] }[];
}

export function buildMenu(id: string, c: MenuCtx): MenuItem[] {
  switch (id) {
    case 'logo': return [
      { label: 'About This PC', onClick: () => void openApp('settings', { section: 'about' }) },
      { separator: true },
      { label: 'System Settings…', onClick: () => void openApp('settings') },
      { label: 'Windows Settings…', onClick: () => void api.invoke('winsettings:open', 'about') },
      { label: 'Launchpad', onClick: () => c.openPanel('launchpad') },
      { separator: true },
      { label: 'Recent Items', submenu: c.recent.length ? c.recent.slice(0, 10).map((f) => ({ label: f.name, onClick: () => void api.invoke('fs:open', f.path) })) : [{ label: 'No recent items', disabled: true }] },
      { separator: true },
      { label: 'Force Quit…', shortcut: 'Ctrl+Shift+Esc', onClick: () => void openApp('taskmanager') },
      { separator: true },
      { label: 'Sleep', onClick: () => c.power('sleep') },
      { label: 'Restart…', onClick: () => c.power('restart') },
      { label: 'Shut Down…', onClick: () => c.power('shutdown') },
      { separator: true },
      { label: 'Lock Screen', shortcut: 'Win+L', onClick: () => c.power('lock') },
      { label: 'Log Out…', onClick: () => c.power('logout') },
    ];
    case 'app': return [
      { label: 'About MACOS X PRO', onClick: () => void openApp('settings', { section: 'about' }) },
      { separator: true },
      { label: 'Settings…', onClick: () => void openApp('settings') },
      { label: 'Hide MACOS X PRO (restore Windows desktop)', shortcut: c.settings.shortcuts.toggleShell, onClick: () => void api.invoke('shell:toggle') },
      { separator: true },
      { label: 'Quit MACOS X PRO', onClick: () => void api.invoke('app:quit') },
    ];
    case 'file': return [
      { label: 'New Finder Window', onClick: () => void openApp('finder', { newWindow: '1' }) },
      { label: 'New Note', onClick: () => void openApp('notes', { new: '1' }) },
      { label: 'New Event', onClick: () => void openApp('calendar', { new: '1' }) },
      { separator: true },
      { label: 'Open…', onClick: async () => { const f = await api.invoke<string[]>('fs:pickFiles'); for (const p of f) void api.invoke('fs:open', p); } },
      { label: 'Save', shortcut: 'Ctrl+S', onClick: keys(K.CTRL, K.S) },
      { label: 'Print…', shortcut: 'Ctrl+P', onClick: keys(K.CTRL, K.P) },
      { separator: true },
      { label: 'Close Window', shortcut: 'Alt+F4', onClick: keys(K.ALT, K.F4) },
    ];
    case 'edit': return [
      { label: 'Undo', shortcut: 'Ctrl+Z', onClick: keys(K.CTRL, K.Z) },
      { label: 'Redo', shortcut: 'Ctrl+Y', onClick: keys(K.CTRL, K.Y) },
      { separator: true },
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: keys(K.CTRL, K.X) },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: keys(K.CTRL, K.C) },
      { label: 'Paste', shortcut: 'Ctrl+V', onClick: keys(K.CTRL, K.V) },
      { label: 'Select All', shortcut: 'Ctrl+A', onClick: keys(K.CTRL, K.A) },
      { separator: true },
      { label: 'Find…', shortcut: 'Ctrl+F', onClick: keys(K.CTRL, K.F) },
      { label: 'Clipboard History', onClick: () => void openApp('clipboard') },
      { label: 'Emoji & Symbols', shortcut: 'Win+.', onClick: keys(K.LWIN, 0xbe) },
    ];
    case 'view': return [
      { label: 'Show Desktop', shortcut: 'Win+D', onClick: () => void api.invoke('keys:showDesktop') },
      { label: 'Task View', shortcut: 'Win+Tab', onClick: () => void api.invoke('keys:taskView') },
      { separator: true },
      { label: 'Overlay Mode', checked: c.settings.mode === 'overlay', onClick: () => c.update({ mode: 'overlay' }) },
      { label: 'Immersive Desktop', checked: c.settings.mode === 'immersive', onClick: () => c.update({ mode: 'immersive' }) },
      { separator: true },
      { label: 'Show Widgets', checked: c.settings.widgetsEnabled, onClick: () => c.update({ widgetsEnabled: !c.settings.widgetsEnabled }) },
      { label: 'Automatically Hide Dock', checked: c.settings.dockAutoHide, onClick: () => c.update({ dockAutoHide: !c.settings.dockAutoHide }) },
      { label: 'Dark Mode', checked: c.settings.theme === 'dark', onClick: () => c.update({ theme: c.settings.theme === 'dark' ? 'light' : 'dark' }) },
    ];
    case 'go': return [
      { label: 'Recents', onClick: () => void openApp('finder', { place: 'recents' }) },
      { label: 'Documents', onClick: () => void openApp('finder', { place: 'documents' }) },
      { label: 'Desktop', onClick: () => void openApp('finder', { place: 'desktop' }) },
      { label: 'Downloads', onClick: () => void openApp('finder', { place: 'downloads' }) },
      { label: 'Home', onClick: () => void openApp('finder', { place: 'home' }) },
      { label: 'This PC', onClick: () => void openApp('finder', { place: 'computer' }) },
      { label: 'Applications', onClick: () => c.openPanel('launchpad') },
      { separator: true },
      { label: 'Go to Folder…', onClick: () => void openApp('finder', { goto: '1' }) },
    ];
    case 'window': {
      const items: MenuItem[] = [
        { label: 'Minimize', shortcut: 'Win+↓', onClick: keys(K.LWIN, K.DOWN) },
        { label: 'Snap Left', shortcut: 'Win+←', onClick: keys(K.LWIN, K.LEFT) },
        { label: 'Snap Right', shortcut: 'Win+→', onClick: keys(K.LWIN, K.RIGHT) },
        { separator: true },
      ];
      for (const a of c.appWindows) for (const w of a.windows) items.push({ label: w.title || a.app, onClick: () => void api.invoke('app:focusWindow', w.id) });
      if (!c.appWindows.length) items.push({ label: 'No MACOS X PRO windows open', disabled: true });
      return items;
    }
    case 'help': return [
      { label: 'Keyboard Shortcuts', onClick: () => void openApp('settings', { section: 'shortcuts' }) },
      { label: 'Spotlight', shortcut: c.settings.shortcuts.spotlight, onClick: () => c.openPanel('spotlight') },
      { label: 'Run Setup Assistant Again…', onClick: () => void api.invoke('setup:open') },
      { label: 'Windows Get Help', onClick: () => void api.invoke('apps:launch', 'shell:AppsFolder\\Microsoft.GetHelp_8wekyb3d8bbwe!App') },
    ];
  }
  return [];
}

export const MENU_TITLES: [string, string][] = [['file', 'File'], ['edit', 'Edit'], ['view', 'View'], ['go', 'Go'], ['window', 'Window'], ['help', 'Help']];
