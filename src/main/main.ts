import { app, protocol, Tray, Menu, nativeTheme, screen, shell, dialog, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { initDb, persistNow } from './db';
import { getSettings, onSettings, broadcast, resolvedTheme, setSettings } from './settings';
import { registerIpc } from './ipc';
import { registerFileProtocol, ensureIndex } from './files';
import * as win from './windows';
import { registerShortcuts } from './shortcuts';
import { startClipboardWatch } from './clipboard';
import { startScheduler } from './scheduler';
import { refreshWallpaper, startWallpaperClock, restoreWindowsWallpaper } from './media';
import { scanApps, listApps } from './apps';
import { captureFull, captureRegionStart } from './screenshot';
import { disposePs } from './ps';
import { unregisterAppBar } from './native';
import { runSelfTest } from './selftest';

const AUMID = 'com.abhijit.macosxpro';
const logFile = () => path.join(app.getPath('userData'), 'logs', 'main.log');

// ---- Crash safety: log, never take down the Windows desktop (we never modified it).
function log(...a: unknown[]) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`);
  } catch { /* ignore */ }
}
process.on('uncaughtException', (e) => { log('uncaught', e); });
process.on('unhandledRejection', (e) => { log('unhandled', e as Error); });

protocol.registerSchemesAsPrivileged([{ scheme: 'mxfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!getSettings().setupComplete) win.openSetup();
    else { win.setShellVisible(true); win.openApp('settings'); }
  });
}

app.setAppUserModelId(AUMID);
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// Lean defaults for laptop use: keep GPU compositing, avoid background throttling glitches in overlays
app.commandLine.appendSwitch('enable-gpu-rasterization');

let tray: Tray | null = null;
let quitting = false;

function quit() {
  if (quitting) return;
  quitting = true;
  unregisterAppBar();
  persistNow();
  disposePs();
  win.destroyAll();
  app.quit();
}

function buildTray() {
  const iconFile = path.join(app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'), 'tray.png');
  tray = new Tray(nativeImage.createFromPath(iconFile));
  tray.setToolTip('MACOS X PRO');
  const menu = () => Menu.buildFromTemplate([
    { label: 'MACOS X PRO', enabled: false },
    { type: 'separator' },
    { label: win.isShellVisible() ? 'Restore Windows desktop (hide MACOS X PRO)' : 'Show MACOS X PRO', click: () => { win.setShellVisible(!win.isShellVisible()); tray?.setContextMenu(menu()); } },
    { label: 'Mode', submenu: [
      { label: 'Overlay (menu bar + Dock over Windows)', type: 'radio', checked: getSettings().mode === 'overlay', click: () => setSettings({ mode: 'overlay' }) },
      { label: 'Immersive desktop (full wallpaper + widgets)', type: 'radio', checked: getSettings().mode === 'immersive', click: () => setSettings({ mode: 'immersive' }) },
    ] },
    { label: 'Spotlight', accelerator: getSettings().shortcuts.spotlight, click: () => win.sendToShell('shell:open', 'spotlight') },
    { label: 'System Settings…', click: () => win.openApp('settings') },
    { label: 'Open log folder', click: () => shell.openPath(path.dirname(logFile())) },
    { type: 'separator' },
    { label: 'Quit MACOS X PRO', click: quit },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { if (!win.isShellVisible()) { win.setShellVisible(true); tray?.setContextMenu(menu()); } else win.sendToShell('shell:open', 'launchpad'); });
  onSettings(() => tray?.setContextMenu(menu()));
}

/** Give the Start-menu shortcut our AppUserModelID so Windows toasts are attributed and shown. */
function fixShortcutAumid() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const lnk = path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs\\MACOS X PRO.lnk');
  try {
    if (fs.existsSync(lnk)) {
      const cur = shell.readShortcutLink(lnk);
      if (cur.appUserModelId !== AUMID) shell.writeShortcutLink(lnk, 'update', { ...cur, appUserModelId: AUMID });
    }
  } catch (e) { log('aumid', e); }
}

function startShell() {
  win.createMenubar();
  win.createShell();
  win.createDesktops();
  registerShortcuts({
    spotlight: () => win.sendToShell('shell:open', 'spotlight'),
    launchpad: () => win.sendToShell('shell:open', 'launchpad'),
    controlCentre: () => win.sendToShell('shell:open', 'control'),
    notificationCentre: () => win.sendToShell('shell:open', 'notifications'),
    screenshotFull: () => void captureFull().catch((e) => log('shot', e)),
    screenshotRegion: () => void captureRegionStart().catch((e) => log('shot', e)),
    toggleShell: () => win.setShellVisible(!win.isShellVisible()),
  });
  startClipboardWatch();
  startScheduler();
  startWallpaperClock();
  setTimeout(() => refreshWallpaper(true), 1500);
  // Background warm-ups, staggered so startup stays fast
  setTimeout(() => { if (listApps().length === 0) void scanApps(); else setTimeout(() => void scanApps(), 20000); }, 3000);
  setTimeout(() => void ensureIndex(), 15000);
}

app.whenReady().then(async () => {
  await initDb();
  registerFileProtocol();
  const s = getSettings();
  nativeTheme.themeSource = s.theme === 'auto' ? 'system' : s.theme;
  registerIpc(() => startShell(), quit);
  buildTray();
  fixShortcutAumid();
  try { app.setLoginItemSettings({ openAtLogin: s.launchAtLogin }); } catch { /* ignore */ }

  if (!s.setupComplete) win.openSetup();
  else startShell();
  if (process.env.MX_SELFTEST) void runSelfTest(process.env.MX_SELFTEST, quit, startShell);

  nativeTheme.on('updated', () => broadcast('theme:changed', resolvedTheme()));
  screen.on('display-added', () => win.relayout());
  screen.on('display-removed', () => win.relayout());
  screen.on('display-metrics-changed', () => { clearTimeout(relayoutT); relayoutT = setTimeout(() => win.relayout(), 400); });

  onSettings((next, prev) => {
    if (next.theme !== prev.theme) { nativeTheme.themeSource = next.theme === 'auto' ? 'system' : next.theme; broadcast('theme:changed', resolvedTheme()); }
    if (!next.setupComplete) return;
    if (next.mode !== prev.mode) win.applyMode();
    if (next.widgetsEnabled !== prev.widgetsEnabled) win.createDesktops();
    if (next.menuBarEnabled !== prev.menuBarEnabled) win.setMenubarEnabled(next.menuBarEnabled);
    if (next.reserveMenuBarSpace !== prev.reserveMenuBarSpace) win.setReserveSpace(next.reserveMenuBarSpace);
    if (next.clipboardHistory !== prev.clipboardHistory) startClipboardWatch();
    if (JSON.stringify(next.shortcuts) !== JSON.stringify(prev.shortcuts)) registerShortcuts();
    if (next.launchAtLogin !== prev.launchAtLogin) { try { app.setLoginItemSettings({ openAtLogin: next.launchAtLogin }); } catch { /* ignore */ } }
    if (next.wallpaper !== prev.wallpaper || next.wallpaperDynamic !== prev.wallpaperDynamic || JSON.stringify(next.wallpaperPerDisplay) !== JSON.stringify(prev.wallpaperPerDisplay) || next.wallpaperApplyToWindows !== prev.wallpaperApplyToWindows) {
      refreshWallpaper(true);
      if (!next.wallpaperApplyToWindows && prev.wallpaperApplyToWindows) restoreWindowsWallpaper();
    }
  });
}).catch((e) => {
  log('startup', e);
  dialog.showErrorBox('MACOS X PRO could not start', `${(e as Error).message}\n\nYour Windows desktop has not been changed. Details were written to:\n${logFile()}`);
  app.quit();
});

let relayoutT: NodeJS.Timeout;
app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('before-quit', () => { quitting = true; unregisterAppBar(); persistNow(); });
app.on('will-quit', () => { disposePs(); });
export { BrowserWindow };
