// Window manager: menu bar strip, shell overlay (Dock + popovers), per-display desktop layer,
// and native app windows. The original Windows desktop is never modified — closing these
// windows (tray → "Restore Windows desktop" or Quit) returns everything to normal instantly.
import { app, BrowserWindow, screen, Display } from 'electron';
import path from 'node:path';
import { builtinById } from '@shared/apps';
import { getSettings, resolvedTheme } from './settings';
import { pinToDesktop, registerTopAppBar, unregisterAppBar, appBarActive, getForegroundWindow, focusWindow } from './native';
import { isWin11 } from './controls';

export const MENUBAR_H = 30;
const isWin = process.platform === 'win32';
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let menubarWin: BrowserWindow | null = null;
let shellWin: BrowserWindow | null = null;
const desktopWins = new Map<number, BrowserWindow>();
const appWins = new Map<string, Set<BrowserWindow>>();
let setupWin: BrowserWindow | null = null;
let captureWin: BrowserWindow | null = null;
let shellVisible = true;
let prevForeground = 0;

export const preloadPath = () => path.join(__dirname, 'preload.js');
export const getShell = () => shellWin;
export const getMenubar = () => menubarWin;
export const isShellVisible = () => shellVisible;

function load(win: BrowserWindow, route: string) {
  if (DEV_URL) void win.loadURL(`${DEV_URL}#/${route}`);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `/${route}` });
}

function webPrefs(extra: Electron.WebPreferences = {}): Electron.WebPreferences {
  return { preload: preloadPath(), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: true, ...extra };
}

function guardCrash(win: BrowserWindow, route: string) {
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[window ${route}] renderer gone`, details.reason);
    if (!win.isDestroyed() && details.reason !== 'clean-exit') setTimeout(() => !win.isDestroyed() && load(win, route), 800);
  });
  win.webContents.on('unresponsive', () => console.warn(`[window ${route}] unresponsive`));
  // Never let a page navigate the shell away or open arbitrary windows.
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(DEV_URL || 'file:')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

const primary = () => screen.getPrimaryDisplay();

/** Area below the menu bar on the primary display (where the Dock and popovers live). */
function shellBounds(d: Display = primary()) {
  const wa = d.workArea;
  const s = getSettings();
  if (!s.menuBarEnabled) return wa;
  if (appBarActive()) return wa; // Windows already excluded the menu bar strip from the work area
  return { x: wa.x, y: wa.y + MENUBAR_H, width: wa.width, height: wa.height - MENUBAR_H };
}
function menubarBounds(d: Display = primary()) {
  const wa = d.workArea;
  const y = appBarActive() ? wa.y - MENUBAR_H : wa.y;
  return { x: wa.x, y, width: wa.width, height: MENUBAR_H };
}
function desktopBounds(d: Display) {
  const wa = d.workArea;
  if (d.id === primary().id && appBarActive()) return { x: wa.x, y: wa.y - MENUBAR_H, width: wa.width, height: wa.height + MENUBAR_H };
  return wa;
}

export function createMenubar() {
  if (menubarWin || !getSettings().menuBarEnabled) return;
  menubarWin = new BrowserWindow({
    ...menubarBounds(), frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, focusable: false, thickFrame: false,
    backgroundColor: '#00000000', webPreferences: webPrefs({ backgroundThrottling: false }),
  });
  menubarWin.setAlwaysOnTop(true, 'pop-up-menu');
  menubarWin.setVisibleOnAllWorkspaces(true);
  guardCrash(menubarWin, 'menubar');
  load(menubarWin, 'menubar');
  menubarWin.once('ready-to-show', () => {
    if (!menubarWin) return;
    menubarWin.showInactive();
    if (isWin && getSettings().reserveMenuBarSpace) {
      registerTopAppBar(menubarWin, menubarBounds());
      setTimeout(relayout, 300);
    }
  });
  menubarWin.on('closed', () => { menubarWin = null; });
}

export function createShell() {
  if (shellWin) return;
  shellWin = new BrowserWindow({
    ...shellBounds(), frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, thickFrame: false, focusable: false,
    backgroundColor: '#00000000', webPreferences: webPrefs({ backgroundThrottling: false }),
  });
  shellWin.setAlwaysOnTop(true, 'pop-up-menu');
  shellWin.setIgnoreMouseEvents(true, { forward: true });
  guardCrash(shellWin, 'shell');
  load(shellWin, 'shell');
  shellWin.once('ready-to-show', () => shellWin?.showInactive());
  shellWin.on('closed', () => { shellWin = null; });
}

export function createDesktops() {
  const s = getSettings();
  const needed = s.mode === 'immersive' || s.widgetsEnabled;
  const displays = screen.getAllDisplays();
  for (const [id, w] of desktopWins) {
    if (!needed || !displays.find((d) => d.id === id)) { w.destroy(); desktopWins.delete(id); }
  }
  if (!needed) return;
  for (const d of displays) {
    if (desktopWins.has(d.id)) continue;
    const isPrimary = d.id === primary().id;
    const win = new BrowserWindow({
      ...desktopBounds(d), frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, hasShadow: false, show: false, thickFrame: false, focusable: true,
      backgroundColor: '#00000000', webPreferences: webPrefs(),
    });
    if (s.mode === 'overlay') win.setIgnoreMouseEvents(true, { forward: true });
    const route = `desktop?display=${d.id}&primary=${isPrimary ? 1 : 0}`;
    guardCrash(win, route);
    load(win, route);
    win.once('ready-to-show', () => { win.showInactive(); pinToDesktop(win); });
    win.on('focus', () => setTimeout(() => !win.isDestroyed() && pinToDesktop(win), 30));
    win.on('closed', () => desktopWins.delete(d.id));
    desktopWins.set(d.id, win);
  }
}

export function applyMode() {
  const s = getSettings();
  for (const w of desktopWins.values()) {
    if (s.mode === 'overlay') w.setIgnoreMouseEvents(true, { forward: true });
    else w.setIgnoreMouseEvents(false);
  }
  createDesktops();
}

export function relayout() {
  if (menubarWin && !menubarWin.isDestroyed()) menubarWin.setBounds(menubarBounds());
  if (shellWin && !shellWin.isDestroyed()) shellWin.setBounds(shellBounds());
  for (const d of screen.getAllDisplays()) {
    const w = desktopWins.get(d.id);
    if (w && !w.isDestroyed()) w.setBounds(desktopBounds(d));
  }
  createDesktops();
}

export function setMenubarEnabled(on: boolean) {
  if (on) createMenubar();
  else { unregisterAppBar(); menubarWin?.destroy(); menubarWin = null; }
  setTimeout(relayout, 300);
}

export function setReserveSpace(on: boolean) {
  if (!menubarWin) return;
  if (on) registerTopAppBar(menubarWin, menubarBounds()); else unregisterAppBar();
  setTimeout(relayout, 300);
}

/** Hide/show the whole macOS layer without quitting (Windows desktop fully restored while hidden). */
export function setShellVisible(on: boolean) {
  shellVisible = on;
  if (on) {
    createMenubar();
    createShell();
    createDesktops();
    menubarWin?.showInactive();
    shellWin?.showInactive();
    for (const w of desktopWins.values()) { w.showInactive(); pinToDesktop(w); }
    if (menubarWin && getSettings().reserveMenuBarSpace) registerTopAppBar(menubarWin, menubarBounds());
  } else {
    unregisterAppBar();
    menubarWin?.hide();
    shellWin?.hide();
    for (const w of desktopWins.values()) w.hide();
  }
  setTimeout(relayout, 300);
}

/** The shell captures the mouse (and optionally keyboard focus) while a popover is open. */
export function setShellCapture(capture: boolean, focus: boolean) {
  if (!shellWin) return;
  if (capture) {
    shellWin.setIgnoreMouseEvents(false);
    if (focus) {
      const fg = getForegroundWindow();
      if (fg) prevForeground = fg;
      shellWin.setFocusable(true);
      shellWin.focus();
      shellWin.webContents.focus();
    }
  } else {
    shellWin.setIgnoreMouseEvents(true, { forward: true });
    const hadFocus = shellWin.isFocused();
    shellWin.setFocusable(false);
    if (hadFocus && prevForeground) focusWindow(prevForeground);
    prevForeground = 0;
  }
}
export function setShellHit(hit: boolean) {
  if (!shellWin) return;
  if (hit) shellWin.setIgnoreMouseEvents(false); else shellWin.setIgnoreMouseEvents(true, { forward: true });
}

export function setWindowHit(win: BrowserWindow, hit: boolean) {
  if (hit) win.setIgnoreMouseEvents(false); else win.setIgnoreMouseEvents(true, { forward: true });
}

export function sendToShell(channel: string, ...args: unknown[]) {
  if (!shellWin) return;
  shellWin.webContents.send(channel, ...args);
}

// ---------------- App windows
const useMaterial = () => isWin && isWin11() && !getSettings().reduceTransparency;

export function openApp(id: string, args: Record<string, string> = {}) {
  const def = builtinById(id);
  if (!def || !def.width) return null;
  const set = appWins.get(id) || new Set<BrowserWindow>();
  appWins.set(id, set);
  const forceNew = args.newWindow === '1';
  if (set.size > 0 && (!def.multiWindow || !forceNew)) {
    const w = [...set][set.size - 1];
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    if (Object.keys(args).length) w.webContents.send('app:args', args);
    return w;
  }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = d.workArea;
  const width = Math.min(def.width, wa.width - 80);
  const height = Math.min(def.height, wa.height - 80);
  const offset = set.size * 28;
  const material = useMaterial();
  const dark = resolvedTheme() === 'dark';
  const win = new BrowserWindow({
    width, height, minWidth: def.minWidth, minHeight: def.minHeight,
    x: Math.round(wa.x + (wa.width - width) / 2 + offset), y: Math.round(wa.y + Math.max(20, (wa.height - height) / 2 - 20) + offset),
    title: def.name, show: false, titleBarStyle: 'hidden',
    backgroundColor: material ? '#00000000' : dark ? '#1c1c1f' : '#f4f4f6',
    ...(material ? { backgroundMaterial: 'acrylic' as const } : {}),
    icon: path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '../resources'), 'icon.ico'),
    webPreferences: webPrefs(),
  });
  const q = new URLSearchParams({ ...args, material: material ? '1' : '0' }).toString();
  const route = `app/${id}?${q}`;
  guardCrash(win, route);
  load(win, route);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  set.add(win);
  const notify = () => sendToShell('apps:running', runningBuiltins());
  win.on('closed', () => { set.delete(win); notify(); });
  win.on('focus', () => menubarWin?.webContents.send('app:focused', id));
  notify();
  return win;
}

export function runningBuiltins(): string[] {
  return [...appWins.entries()].filter(([, s]) => s.size > 0).map(([k]) => k);
}

export function windowsOf(id: string) { return [...(appWins.get(id) || [])]; }
export function allAppWindows() { return [...appWins.values()].flatMap((s) => [...s]); }

export function openSetup() {
  if (setupWin) { setupWin.focus(); return; }
  const material = useMaterial();
  setupWin = new BrowserWindow({
    width: 860, height: 600, resizable: false, maximizable: false, titleBarStyle: 'hidden', show: false, center: true,
    backgroundColor: material ? '#00000000' : '#17171a', ...(material ? { backgroundMaterial: 'acrylic' as const } : {}),
    webPreferences: webPrefs(),
  });
  load(setupWin, `setup?material=${material ? 1 : 0}`);
  setupWin.once('ready-to-show', () => setupWin?.show());
  setupWin.on('closed', () => { setupWin = null; if (!getSettings().setupComplete) app.quit(); });
}
export const getSetup = () => setupWin;

export function openCapture(displayId: number, imagePath: string) {
  const d = screen.getAllDisplays().find((x) => x.id === displayId) || primary();
  captureWin?.destroy();
  captureWin = new BrowserWindow({
    ...d.bounds, frame: false, transparent: false, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, show: false, fullscreenable: false,
    backgroundColor: '#000000', webPreferences: webPrefs(),
  });
  captureWin.setAlwaysOnTop(true, 'screen-saver');
  load(captureWin, `capture?display=${d.id}&img=${encodeURIComponent(imagePath)}`);
  captureWin.once('ready-to-show', () => { captureWin?.show(); captureWin?.focus(); });
  captureWin.on('closed', () => { captureWin = null; });
}
export const closeCapture = () => { captureWin?.destroy(); captureWin = null; };

export function destroyAll() {
  unregisterAppBar();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
}

export function hideShellForCapture(hide: boolean) {
  // Keep the overlay out of region screenshots' selection layer
  if (hide) shellWin?.setOpacity(0); else shellWin?.setOpacity(1);
}
