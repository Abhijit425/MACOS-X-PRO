// Wallpaper engine (bundled + imported, dynamic day/night, rotation, per-display, optional sync
// to the real Windows wallpaper) and the local music library scanner.
import { app, dialog, BrowserWindow, screen } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSettings, setSettings, broadcast } from './settings';
import { kvGet, kvSet } from './db';
import { setWindowsWallpaper, getWindowsWallpaper } from './native';
import type { WallpaperInfo } from '@shared/types';

const resRoot = () => (app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'));
const wallDir = () => path.join(resRoot(), 'wallpapers');
const toUrl = (p: string) => `mxfile://local/${encodeURIComponent(p)}`;

interface ManifestItem { id: string; name: string; category: string; tone: 'light' | 'dark'; file: string }
let manifest: ManifestItem[] | null = null;
function getManifest(): ManifestItem[] {
  if (!manifest) {
    try { manifest = JSON.parse(fs.readFileSync(path.join(wallDir(), 'manifest.json'), 'utf8')); } catch { manifest = []; }
  }
  return manifest!;
}

export function listWallpapers(): WallpaperInfo[] {
  const builtin = getManifest().map((m) => ({ id: m.id, name: m.name, category: m.category, tone: m.tone, path: path.join(wallDir(), m.file), thumb: toUrl(path.join(wallDir(), 'thumbs', m.file)) }));
  const custom = getSettings().customWallpapers.filter((p) => fs.existsSync(p)).map((p) => ({ id: p, name: path.basename(p).replace(/\.[^.]+$/, ''), category: 'custom', tone: 'dark' as const, path: p, thumb: `mxfile://thumb/${encodeURIComponent(p)}?s=480`, custom: true }));
  return [...builtin, ...custom];
}

// Dynamic groups: the chosen wallpaper automatically follows the time of day.
const DYNAMIC: Record<string, { from: number; id: string }[]> = {
  sonoma: [{ from: 0, id: 'sonoma-night' }, { from: 7, id: 'sonoma-dawn' }, { from: 19, id: 'sonoma-night' }],
  ridge: [{ from: 0, id: 'ridge-night' }, { from: 6, id: 'ridge-dusk' }, { from: 8, id: 'ridge-day' }, { from: 17, id: 'ridge-dusk' }, { from: 20, id: 'ridge-night' }],
};
export const dynamicGroupOf = (id: string) => Object.keys(DYNAMIC).find((g) => DYNAMIC[g].some((x) => x.id === id)) || null;

function resolveId(id: string): string {
  const s = getSettings();
  if (s.wallpaperDynamic) {
    const g = dynamicGroupOf(id);
    if (g) {
      const h = new Date().getHours();
      let pick = DYNAMIC[g][0].id;
      for (const step of DYNAMIC[g]) if (h >= step.from) pick = step.id;
      return pick;
    }
  }
  return id;
}

export function wallpaperPath(idOrPath: string): string {
  if (path.isAbsolute(idOrPath) && fs.existsSync(idOrPath)) return idOrPath;
  const id = resolveId(idOrPath);
  const m = getManifest().find((x) => x.id === id) || getManifest()[0];
  return m ? path.join(wallDir(), m.file) : '';
}

export function effectiveWallpapers(): Record<string, string> {
  const s = getSettings();
  const out: Record<string, string> = {};
  for (const d of screen.getAllDisplays()) out[String(d.id)] = wallpaperPath(s.wallpaperPerDisplay[String(d.id)] || s.wallpaper);
  return out;
}

let lastEffective = '';
export function refreshWallpaper(force = false) {
  const eff = effectiveWallpapers();
  const key = JSON.stringify(eff);
  if (!force && key === lastEffective) return;
  lastEffective = key;
  broadcast('wallpaper:changed', Object.fromEntries(Object.entries(eff).map(([k, v]) => [k, toUrl(v)])));
  const s = getSettings();
  if (s.wallpaperApplyToWindows) {
    if (!s.originalWindowsWallpaper) {
      const orig = getWindowsWallpaper();
      if (orig) setSettings({ originalWindowsWallpaper: orig });
    }
    const primary = eff[String(screen.getPrimaryDisplay().id)];
    if (primary) setWindowsWallpaper(primary);
  }
}

export function restoreWindowsWallpaper() {
  const orig = getSettings().originalWindowsWallpaper;
  if (orig && fs.existsSync(orig)) return setWindowsWallpaper(orig);
  return false;
}

let rotateTimer: NodeJS.Timeout | null = null;
let lastRotate = Date.now();
export function startWallpaperClock() {
  if (rotateTimer) return;
  rotateTimer = setInterval(() => {
    const s = getSettings();
    if (s.wallpaperRotate && Date.now() - lastRotate >= s.wallpaperRotateMinutes * 60000) {
      lastRotate = Date.now();
      const pool = listWallpapers().filter((w) => s.wallpaperRotateCategory === 'all' || w.category === s.wallpaperRotateCategory);
      if (pool.length > 1) {
        const cur = pool.findIndex((w) => w.id === s.wallpaper);
        setSettings({ wallpaper: pool[(cur + 1) % pool.length].id });
      }
    }
    refreshWallpaper();
  }, 60000);
}

export async function importWallpapers(win: BrowserWindow | null) {
  const r = await dialog.showOpenDialog(win!, { title: 'Import wallpapers', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }] });
  if (r.canceled) return [];
  const dir = path.join(app.getPath('userData'), 'wallpapers');
  await fsp.mkdir(dir, { recursive: true });
  const added: string[] = [];
  for (const f of r.filePaths) {
    const dest = path.join(dir, `${crypto.randomBytes(4).toString('hex')}-${path.basename(f)}`);
    await fsp.copyFile(f, dest);
    added.push(dest);
  }
  setSettings({ customWallpapers: [...getSettings().customWallpapers, ...added] });
  return added;
}

export async function removeCustomWallpaper(p: string) {
  const s = getSettings();
  setSettings({ customWallpapers: s.customWallpapers.filter((x) => x !== p), wallpaper: s.wallpaper === p ? 'sonoma-dawn' : s.wallpaper });
  if (p.startsWith(path.join(app.getPath('userData'), 'wallpapers'))) await fsp.rm(p, { force: true });
}

// ---------------- Music library
export interface Track { path: string; url: string; title: string; artist: string; album: string; duration: number; cover: string | null; track: number }
const AUDIO = /\.(mp3|m4a|flac|wav|ogg|opus|aac|wma)$/i;

export async function scanMusic(folders: string[]): Promise<Track[]> {
  const { parseFile } = await import('music-metadata');
  const coverDir = path.join(app.getPath('userData'), 'covers');
  await fsp.mkdir(coverDir, { recursive: true });
  const cache = kvGet<Record<string, Track & { mtime: number }>>('music:cache', {});
  const files: { p: string; m: number }[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 6 || files.length > 8000) return;
    let ents: fs.Dirent[];
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (AUDIO.test(e.name)) { try { files.push({ p, m: (await fsp.stat(p)).mtimeMs }); } catch { /* ignore */ } }
    }
  }
  for (const f of folders) await walk(f, 0);
  const out: Track[] = [];
  const nextCache: typeof cache = {};
  for (const { p, m } of files) {
    const c = cache[p];
    if (c && c.mtime === m) { out.push(c); nextCache[p] = c; continue; }
    let t: Track = { path: p, url: toUrl(p), title: path.basename(p).replace(AUDIO, ''), artist: 'Unknown Artist', album: 'Unknown Album', duration: 0, cover: null, track: 0 };
    try {
      const md = await parseFile(p, { duration: true, skipCovers: false });
      const pic = md.common.picture?.[0];
      let cover: string | null = null;
      if (pic) {
        const key = crypto.createHash('sha1').update(`${md.common.album || ''}|${md.common.artist || p}`).digest('hex').slice(0, 16);
        const cf = path.join(coverDir, `${key}.${pic.format.includes('png') ? 'png' : 'jpg'}`);
        if (!fs.existsSync(cf)) await fsp.writeFile(cf, pic.data);
        cover = toUrl(cf);
      }
      t = { ...t, title: md.common.title || t.title, artist: md.common.artist || md.common.albumartist || t.artist, album: md.common.album || t.album, duration: md.format.duration || 0, cover, track: md.common.track?.no || 0 };
    } catch { /* unreadable tags: keep filename */ }
    out.push(t);
    nextCache[p] = { ...t, mtime: m };
  }
  kvSet('music:cache', nextCache);
  return out;
}
