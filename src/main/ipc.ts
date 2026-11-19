import { ipcMain, BrowserWindow, shell, dialog, app, clipboard, nativeImage, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { getSettings, setSettings, resetSettings, resolvedTheme } from './settings';
import * as sys from './system';
import * as ctl from './controls';
import * as apps from './apps';
import * as files from './files';
import * as clip from './clipboard';
import * as data from './data';
import * as sched from './scheduler';
import * as notif from './notify';
import * as media from './media';
import * as shot from './screenshot';
import * as win from './windows';
import { registerShortcuts, shortcutStatus } from './shortcuts';
import { foregroundInfo, sendKeys, VK } from './native';

type Handler = (e: IpcMainInvokeEvent, ...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = (name: string, fn: Handler) => ipcMain.handle(`mx:${name}`, async (e, ...args) => {
  try { return { ok: true, value: await fn(e, ...args) }; } catch (err) { return { ok: false, error: (err as Error).message || String(err) }; }
});
const senderWin = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

export function registerIpc(onSetupDone: () => void, quit: () => void) {
  // Settings & theme
  h('settings:get', () => getSettings());
  h('settings:set', (_e, patch) => setSettings(patch));
  h('settings:reset', () => resetSettings());
  h('theme:resolved', () => resolvedTheme());
  h('setup:complete', (e, patch) => { setSettings({ ...patch, setupComplete: true }); senderWin(e)?.close(); onSetupDone(); });
  h('setup:open', () => win.openSetup());

  // System info & metrics
  h('sys:info', () => sys.sysInfo());
  h('metrics:subscribe', (e) => sys.subscribeMetrics(e.sender));
  h('metrics:unsubscribe', (e) => sys.unsubscribeMetrics(e.sender));
  h('metrics:last', () => sys.lastMetrics());
  h('processes', () => sys.processes());
  h('process:kill', (_e, pid: number) => sys.killProcess(pid));
  h('running', async () => ({ exes: await sys.runningExes(), builtins: win.runningBuiltins() }));
  h('battery', () => sys.batteryNow());
  h('foreground', () => {
    const f = foregroundInfo();
    if (!f) return null;
    const exe = path.basename(f.exe || '').toLowerCase();
    const known = apps.listApps().find((a) => a.exe === exe);
    const pretty = known?.name || (exe ? exe.replace(/\.exe$/, '').replace(/(^|[-_ ])(\w)/g, (_m, s, c) => s + c.toUpperCase()) : '');
    return { title: f.title, exe, name: exe === 'explorer.exe' ? 'Finder' : pretty };
  });

  // Controls
  h('controls:state', () => ctl.getControlState());
  h('volume:set', (_e, v: number) => ctl.setVolume(v));
  h('mute:set', (_e, m: boolean) => ctl.setMute(m));
  h('brightness:set', (_e, v: number) => ctl.setBrightness(v));
  h('bluetooth:get', () => ctl.getBluetooth());
  h('bluetooth:set', (_e, on: boolean) => ctl.setBluetooth(on));
  h('wifi:get', (_e, scan: boolean) => ctl.getWifi(scan));
  h('wifi:connect', (_e, ssid: string) => ctl.connectWifi(ssid));
  h('wifi:disconnect', () => ctl.disconnectWifi());
  h('ostheme:set', (_e, m: 'light' | 'dark') => ctl.setOsTheme(m));
  h('winsettings:open', (_e, page: string) => ctl.openWindowsSettings(page));
  h('power', (_e, action) => ctl.power(action));
  h('recyclebin:empty', () => ctl.emptyRecycleBin());
  h('keys:send', (_e, vks: number[]) => sendKeys(vks.filter((v) => Number.isInteger(v) && v > 0 && v < 256)));
  h('keys:showDesktop', () => sendKeys([VK.LWIN, VK.D]));
  h('keys:taskView', () => sendKeys([VK.LWIN, VK.TAB]));
  h('keys:media', (_e, k: 'play' | 'next' | 'prev') => sendKeys([k === 'play' ? VK.MEDIA_PLAY_PAUSE : k === 'next' ? VK.MEDIA_NEXT : VK.MEDIA_PREV]));

  // Applications
  h('apps:list', () => apps.listApps());
  h('apps:scan', () => apps.scanApps());
  h('apps:launch', (_e, target: string) => apps.launchTarget(target));
  h('dock:resolve', (_e, file: string) => { const d = apps.resolveDockTarget(file); apps.ensureIconFor(d.id, d.target); return d; });
  h('apps:iconFile', (_e, id: string) => apps.iconFileFor(id));
  h('app:open', (_e, id: string, args?: Record<string, string>) => { win.openApp(id, args || {}); return true; });
  h('app:windows', (_e, id: string) => win.windowsOf(id).map((w) => ({ id: w.id, title: w.getTitle(), minimized: w.isMinimized() })));
  h('app:closeAll', (_e, id: string) => { for (const w of win.windowsOf(id)) w.close(); return true; });
  h('app:focusWindow', (_e, wid: number) => { const w = BrowserWindow.fromId(wid); if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });

  // Window controls (for the calling window)
  h('win:close', (e) => senderWin(e)?.close());
  h('win:minimize', (e) => senderWin(e)?.minimize());
  h('win:toggleMaximize', (e) => { const w = senderWin(e); if (!w) return false; if (w.isMaximized()) w.unmaximize(); else w.maximize(); return w.isMaximized(); });
  h('win:isMaximized', (e) => senderWin(e)?.isMaximized() ?? false);
  h('win:setTitle', (e, t: string) => senderWin(e)?.setTitle(t));
  h('win:hit', (e, hit: boolean) => { const w = senderWin(e); if (w) win.setWindowHit(w, hit); });
  h('shell:capture', (_e, capture: boolean, focus: boolean) => win.setShellCapture(capture, focus));
  h('shell:hit', (_e, hit: boolean) => win.setShellHit(hit));
  h('shell:send', (_e, channel: string, payload: unknown) => win.sendToShell(channel, payload));
  h('menubar:send', (_e, channel: string, payload: unknown) => win.getMenubar()?.webContents.send(channel, payload));
  h('shell:toggle', () => win.setShellVisible(!win.isShellVisible()));

  // Files
  h('fs:special', () => files.specialFolders());
  h('fs:drives', () => files.drives());
  h('fs:list', (_e, dir: string) => files.listDir(dir));
  h('fs:stat', (_e, p: string) => files.statPath(p));
  h('fs:copy', (_e, srcs: string[], dest: string) => files.copyItems(srcs, dest));
  h('fs:move', (_e, srcs: string[], dest: string) => files.moveItems(srcs, dest));
  h('fs:trash', (_e, paths: string[]) => files.trashItems(paths));
  h('fs:delete', (_e, paths: string[]) => files.deletePermanently(paths));
  h('fs:rename', (_e, p: string, n: string) => files.renameItem(p, n));
  h('fs:mkdir', (_e, dir: string, name?: string) => files.createFolder(dir, name));
  h('fs:mkfile', (_e, dir: string, name?: string) => files.createTextFile(dir, name));
  h('fs:readText', (_e, p: string) => files.readText(p));
  h('fs:writeText', (_e, p: string, t: string) => files.writeText(p, t));
  h('fs:open', async (_e, p: string) => { const err = await shell.openPath(p); if (err) throw new Error(err); return true; });
  h('fs:reveal', (_e, p: string) => shell.showItemInFolder(p));
  h('fs:recent', () => files.recentFiles());
  h('fs:search', (_e, q: string, limit?: number, root?: string) => files.searchFiles(q, limit, root));
  h('fs:watch', (e, dir: string) => files.watchDir(e.sender, dir));
  h('fs:unwatch', (e, dir: string) => files.unwatchDir(e.sender.id, dir));
  h('fs:startDrag', (e, paths: string[]) => {
    const icon = nativeImage.createFromPath(path.join(app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'), 'tray.png'));
    e.sender.startDrag({ file: paths[0], files: paths, icon });
  });
  h('fs:pickFolder', async (e) => { const r = await dialog.showOpenDialog(senderWin(e)!, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  h('fs:pickFiles', async (e, filters?: Electron.FileFilter[]) => { const r = await dialog.showOpenDialog(senderWin(e)!, { properties: ['openFile', 'multiSelections'], filters }); return r.canceled ? [] : r.filePaths; });
  h('clipboard:writeText', (_e, t: string) => clipboard.writeText(t));
  h('clipboard:copyFiles', (_e, paths: string[]) => clipboard.writeText(paths.join('\r\n')));

  // Clipboard history
  h('clips:list', () => clip.listClips());
  h('clips:copy', (_e, id: string) => clip.copyClip(id));
  h('clips:pin', (_e, id: string, p: boolean) => clip.pinClip(id, p));
  h('clips:delete', (_e, id: string) => clip.deleteClip(id));
  h('clips:clear', () => clip.clearClips());

  // Notes / Calendar / Tasks / Clock
  h('notes:list', () => data.listNotes());
  h('notes:save', (_e, n) => data.saveNote(n));
  h('notes:delete', (_e, id: string) => data.deleteNote(id));
  h('events:list', (_e, from: number, to: number) => data.listEvents(from, to));
  h('events:save', (_e, ev) => data.saveEvent(ev));
  h('events:delete', (_e, id: string) => data.deleteEvent(id));
  h('tasks:list', () => sched.listTasks());
  h('tasks:add', (_e, t: string) => sched.addTask(t));
  h('tasks:toggle', (_e, id: string) => sched.toggleTask(id));
  h('tasks:delete', (_e, id: string) => sched.deleteTask(id));
  h('alarms:list', () => sched.getAlarms());
  h('alarms:save', (_e, a) => sched.saveAlarms(a));
  h('timers:list', () => sched.getTimers());
  h('timers:start', (_e, ms: number, label: string) => sched.startTimer(ms, label));
  h('timers:pause', (_e, id: string, p: boolean) => sched.pauseTimer(id, p));
  h('timers:cancel', (_e, id: string) => sched.cancelTimer(id));
  h('focus:start', (_e, m: number) => sched.startFocus(m));
  h('focus:stop', () => sched.stopFocus());
  h('focus:state', () => sched.focusState());
  h('activity', (_e, days?: number) => sched.activity(days));

  // Notifications
  h('notifications:list', () => notif.listNotifications());
  h('notifications:read', () => notif.markAllRead());
  h('notifications:clear', (_e, id?: string) => notif.clearNotifications(id));
  h('notify', (_e, appName: string, title: string, body: string) => notif.notify(appName, title, body));

  // Wallpapers & music
  h('wallpapers:list', () => media.listWallpapers());
  h('wallpapers:effective', () => { const eff = media.effectiveWallpapers(); return Object.fromEntries(Object.entries(eff).map(([k, v]) => [k, `mxfile://local/${encodeURIComponent(v)}`])); });
  h('wallpapers:import', (e) => media.importWallpapers(senderWin(e)));
  h('wallpapers:remove', (_e, p: string) => media.removeCustomWallpaper(p));
  h('wallpapers:restoreWindows', () => media.restoreWindowsWallpaper());
  h('wallpapers:dynamicGroup', (_e, id: string) => media.dynamicGroupOf(id));
  h('music:scan', (_e, folders: string[]) => media.scanMusic(folders));

  // Screenshots
  h('shot:full', (_e, o) => shot.captureFull(o || {}));
  h('shot:region', (_e, o) => shot.captureRegionStart(o || {}));
  h('shot:regionFinish', (_e, rect) => shot.captureRegionFinish(rect));
  h('shot:windows', () => shot.listWindowSources());
  h('shot:window', (_e, id: string) => shot.captureWindow(id));
  h('shot:folder', () => shot.openShotsFolder());
  h('shot:recent', () => shot.lastShots());

  h('startup:list', async () => {
    const { psJson } = await import('./ps');
    const r = await psJson<{ Name: string; Command: string; Location: string; User: string }[] | { Name: string; Command: string; Location: string; User: string } | null>('Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location, User | ConvertTo-Json -Compress', 20000);
    return Array.isArray(r) ? r : r ? [r] : [];
  });
  h('app:loginItem', () => app.getLoginItemSettings());

  // Shortcuts / app
  h('shortcuts:status', () => shortcutStatus());
  h('shortcuts:apply', () => registerShortcuts());
  h('app:quit', () => quit());
  h('app:relaunch', () => { app.relaunch(); quit(); });
  h('app:paths', () => ({ userData: app.getPath('userData'), exe: app.getPath('exe') }));
  h('openExternal', (_e, url: string) => { if (!/^https?:\/\//i.test(url)) throw new Error('Only web links are allowed'); return shell.openExternal(url); });
}
