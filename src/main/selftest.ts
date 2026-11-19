// Developer self-test: launches every surface and app, captures screenshots and renderer errors.
// Only active when MX_SELFTEST=<output dir> is set in the environment.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_APPS } from '@shared/apps';
import * as win from './windows';
import { setSettings, getSettings } from './settings';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSelfTest(outDir: string, quit: () => void, startShell: () => void) {
  fs.mkdirSync(outDir, { recursive: true });
  const errors: string[] = [];
  const hook = (w: BrowserWindow, name: string) => {
    w.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') errors.push(`[${name}] ${e.level}: ${e.message} (${e.sourceId}:${e.lineNumber})`); });
    w.webContents.on('render-process-gone', (_e, d) => errors.push(`[${name}] CRASH ${d.reason}`));
  };
  const shot = async (w: BrowserWindow | null | undefined, name: string) => {
    if (!w || w.isDestroyed()) { errors.push(`[${name}] window missing`); return; }
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    const b = w.getBounds();
    fs.appendFileSync(path.join(outDir, 'bounds.txt'), `${name} ${b.x} ${b.y} ${b.width} ${b.height}\n`);
  };
  for (const w of BrowserWindow.getAllWindows()) hook(w, w.webContents.getURL().split('#/')[1] || 'win');
  if (!getSettings().setupComplete) {
    await sleep(4000);
    const sw = win.getSetup();
    await shot(sw, 'setup');
    sw?.webContents.executeJavaScript("document.querySelectorAll('button.btn-primary')[0]?.click()");
    await sleep(1500); await shot(sw, 'setup-2');
    setSettings({ setupComplete: true, mode: 'immersive', theme: 'dark', weatherCity: { name: 'Kolkata', lat: 22.57, lon: 88.36 } });
    sw?.destroy();
    startShell();
  }
  app.on('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', () => hook(w, w.webContents.getURL().split('#/')[1] || 'win')));
  await sleep(7000);
  await shot(win.getMenubar(), 'menubar');
  const desk = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#/desktop'));
  if (desk) { desk.webContents.setBackgroundThrottling(false); desk.moveTop(); desk.webContents.invalidate(); await sleep(1200); }
  await shot(desk, 'desktop');
  await shot(win.getShell(), 'shell-idle');
  for (const p of ['spotlight', 'launchpad', 'control', 'notifications']) {
    win.sendToShell('shell:open', p);
    await sleep(1800);
    await shot(win.getShell(), `shell-${p}`);
    win.sendToShell('shell:open', p);
    await sleep(700);
  }
  win.sendToShell('popover:open', { kind: 'menu', x: 10, payload: 'logo' });
  await sleep(900); await shot(win.getShell(), 'shell-menu-logo');
  win.sendToShell('popover:open', { kind: 'menu', x: 10, payload: 'logo' });
  await sleep(500);
  for (const a of BUILTIN_APPS) {
    const w = win.openApp(a.id);
    if (w) hook(w, a.id);
    await sleep(3200);
    await shot(w, `app-${a.id}`);
    w?.destroy();
    await sleep(300);
  }
  setSettings({ theme: 'light' });
  await sleep(800);
  const fw = win.openApp('finder'); await sleep(2500); await shot(fw, 'app-finder-light'); fw?.destroy();
  const sw = win.openApp('settings'); await sleep(2500); await shot(sw, 'app-settings-light'); sw?.destroy();
  win.sendToShell('shell:open', 'control'); await sleep(1500); await shot(win.getShell(), 'shell-control-light');
  await shot(win.getMenubar(), 'menubar-light');
  fs.writeFileSync(path.join(outDir, 'errors.txt'), errors.join('\n') || 'no errors');
  quit();
}
