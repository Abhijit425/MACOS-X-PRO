// Real filesystem access for Finder / Spotlight. Destructive operations are only ever invoked
// after the renderer has shown a confirmation; deletes go to the Recycle Bin by default.
import { app, shell, protocol, nativeImage, WebContents } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { psJson } from './ps';
import { getSettings } from './settings';
import type { DriveInfo, FileEntry } from '@shared/types';

const isWin = process.platform === 'win32';
const HIDDEN_NAMES = /^(desktop\.ini|thumbs\.db|ntuser.*|\$recycle\.bin|system volume information|\$windows\.~.*|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log.*|config\.msi|recovery|documents and settings|\$winreagent|\$sysreset)$/i;

export function specialFolders() {
  const g = (n: Parameters<typeof app.getPath>[0]) => { try { return app.getPath(n); } catch { return ''; } };
  return {
    home: g('home'), desktop: g('desktop'), documents: g('documents'), downloads: g('downloads'),
    pictures: g('pictures'), videos: g('videos'), music: g('music'),
    recent: isWin ? path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Recent') : '',
  };
}

let labels: Record<string, { label: string; type: string }> = {};
let labelsLoaded = false;
async function loadLabels() {
  if (labelsLoaded || !isWin) return;
  labelsLoaded = true;
  try {
    const v = await psJson<{ DriveLetter: string; FileSystemLabel: string; DriveType: string }[] | { DriveLetter: string; FileSystemLabel: string; DriveType: string }>('Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter, FileSystemLabel, @{n="DriveType";e={[string]$_.DriveType}} | ConvertTo-Json -Compress');
    for (const x of Array.isArray(v) ? v : [v]) if (x) labels[String(x.DriveLetter).toUpperCase()] = { label: x.FileSystemLabel, type: x.DriveType };
  } catch { /* ignore */ }
}

export async function drives(): Promise<DriveInfo[]> {
  if (!isWin) {
    const s = fs.statfsSync('/');
    return [{ mount: '/', label: 'Root', size: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize, type: 'Fixed' }];
  }
  await loadLabels();
  const out: DriveInfo[] = [];
  for (let c = 65; c <= 90; c++) {
    const L = String.fromCharCode(c);
    const root = `${L}:\\`;
    try {
      const s = await fsp.statfs(root);
      const size = s.blocks * s.bsize;
      const info = labels[L];
      out.push({ mount: root, label: info?.label || (L === 'C' ? 'Local Disk' : `Drive`), size, used: size - s.bfree * s.bsize, type: info?.type || 'Fixed' });
    } catch { /* not present */ }
  }
  return out;
}

function toEntry(dir: string, name: string, st: fs.Stats): FileEntry {
  const p = path.join(dir, name);
  return { name, path: p, isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, ext: st.isDirectory() ? '' : path.extname(name).slice(1).toLowerCase(), hidden: name.startsWith('.') || HIDDEN_NAMES.test(name) };
}

export async function listDir(dir: string): Promise<FileEntry[]> {
  const names = await fsp.readdir(dir);
  const showHidden = getSettings().finderShowHidden;
  const out: FileEntry[] = [];
  await Promise.all(names.map(async (n) => {
    try {
      const st = await fsp.stat(path.join(dir, n));
      const e = toEntry(dir, n, st);
      if (!showHidden && e.hidden) return;
      out.push(e);
    } catch { /* unreadable entry (permission/locked) */ }
  }));
  return out;
}

export async function statPath(p: string) {
  const st = await fsp.stat(p);
  return toEntry(path.dirname(p), path.basename(p), st);
}

async function uniqueName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = i === 1 ? `${base} copy${ext}` : `${base} copy ${i}${ext}`;
    i++;
  }
  return candidate;
}

export async function copyItems(srcs: string[], destDir: string) {
  const done: string[] = [];
  for (const s of srcs) {
    if (path.resolve(destDir).toLowerCase().startsWith(path.resolve(s).toLowerCase() + path.sep)) throw new Error(`Cannot copy "${path.basename(s)}" into itself.`);
    const target = path.join(destDir, await uniqueName(destDir, path.basename(s)));
    await fsp.cp(s, target, { recursive: true, errorOnExist: true, force: false });
    done.push(target);
  }
  return done;
}

export async function moveItems(srcs: string[], destDir: string) {
  const done: string[] = [];
  for (const s of srcs) {
    if (path.dirname(s).toLowerCase() === path.resolve(destDir).toLowerCase()) continue;
    if (path.resolve(destDir).toLowerCase().startsWith(path.resolve(s).toLowerCase() + path.sep)) throw new Error(`Cannot move "${path.basename(s)}" into itself.`);
    const target = path.join(destDir, await uniqueName(destDir, path.basename(s)));
    try {
      await fsp.rename(s, target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
      await fsp.cp(s, target, { recursive: true, errorOnExist: true });
      await fsp.rm(s, { recursive: true });
    }
    done.push(target);
  }
  return done;
}

export async function trashItems(paths: string[]) {
  for (const p of paths) await shell.trashItem(p);
  return true;
}

export async function deletePermanently(paths: string[]) {
  for (const p of paths) {
    const r = path.parse(p);
    if (r.root === p || p.length <= 3) throw new Error('Refusing to delete a drive root.');
    await fsp.rm(p, { recursive: true, force: false });
  }
  return true;
}

const INVALID = /[<>:"/\\|?*\u0000-\u001f]/;
export async function renameItem(p: string, newName: string) {
  newName = newName.trim();
  if (!newName || INVALID.test(newName) || /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(newName)) throw new Error('That name contains characters Windows does not allow.');
  const target = path.join(path.dirname(p), newName);
  if (target.toLowerCase() !== p.toLowerCase() && fs.existsSync(target)) throw new Error(`"${newName}" already exists.`);
  await fsp.rename(p, target);
  return target;
}

export async function createFolder(dir: string, name = 'untitled folder') {
  const n = await uniqueName(dir, name);
  const p = path.join(dir, n);
  await fsp.mkdir(p);
  return p;
}

export async function createTextFile(dir: string, name = 'untitled.txt') {
  const n = await uniqueName(dir, name);
  const p = path.join(dir, n);
  await fsp.writeFile(p, '', { flag: 'wx' });
  return p;
}

export async function readText(p: string, max = 256 * 1024) {
  const fh = await fsp.open(p, 'r');
  try {
    const buf = Buffer.alloc(max);
    const { bytesRead } = await fh.read(buf, 0, max, 0);
    const slice = buf.subarray(0, bytesRead);
    if (slice.includes(0)) return { binary: true, text: '' };
    return { binary: false, text: slice.toString('utf8'), truncated: bytesRead === max };
  } finally { await fh.close(); }
}

export async function writeText(p: string, text: string) { await fsp.writeFile(p, text, 'utf8'); return true; }

export async function recentFiles(limit = 40): Promise<FileEntry[]> {
  const dir = specialFolders().recent;
  if (!dir || !fs.existsSync(dir)) return [];
  const links = (await fsp.readdir(dir)).filter((n) => n.toLowerCase().endsWith('.lnk'));
  const withTime = await Promise.all(links.map(async (n) => { try { return { n, t: (await fsp.stat(path.join(dir, n))).mtimeMs }; } catch { return null; } }));
  const sorted = withTime.filter(Boolean).sort((a, b) => b!.t - a!.t).slice(0, limit * 2) as { n: string; t: number }[];
  const out: FileEntry[] = [];
  for (const { n, t } of sorted) {
    try {
      const target = shell.readShortcutLink(path.join(dir, n)).target;
      if (!target || !fs.existsSync(target)) continue;
      const st = await fsp.stat(target);
      const e = toEntry(path.dirname(target), path.basename(target), st);
      e.mtime = t;
      out.push(e);
      if (out.length >= limit) break;
    } catch { /* ignore */ }
  }
  return out;
}

// ---------- Lightweight file index for Spotlight (user folders only, lazy, in-memory)
let index: { name: string; lower: string; path: string; isDir: boolean }[] = [];
let indexedAt = 0;
let indexing: Promise<void> | null = null;
const SKIP_DIRS = /^(node_modules|\.git|\.svn|appdata|\$recycle\.bin|__pycache__|\.cache|\.venv|venv|dist|build|obj|bin)$/i;

async function buildIndex() {
  const sf = specialFolders();
  const roots = [...new Set([sf.desktop, sf.documents, sf.downloads, sf.pictures, sf.videos, sf.music].filter(Boolean))];
  const next: typeof index = [];
  const MAX = 80000;
  async function walkDir(dir: string, depth: number) {
    if (depth > 7 || next.length > MAX) return;
    let ents: fs.Dirent[];
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (next.length > MAX) return;
      if (e.name.startsWith('.') || HIDDEN_NAMES.test(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.test(e.name)) continue;
        next.push({ name: e.name, lower: e.name.toLowerCase(), path: p, isDir: true });
        await walkDir(p, depth + 1);
      } else if (e.isFile()) {
        next.push({ name: e.name, lower: e.name.toLowerCase(), path: p, isDir: false });
      }
    }
  }
  for (const r of roots) await walkDir(r, 0);
  index = next;
  indexedAt = Date.now();
}

export function ensureIndex() {
  if (!getSettings().fileIndexing) return Promise.resolve();
  if (indexing) return indexing;
  if (Date.now() - indexedAt < 10 * 60 * 1000 && index.length) return Promise.resolve();
  indexing = buildIndex().finally(() => { indexing = null; });
  return indexing;
}

export async function searchFiles(query: string, limit = 50, root?: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (root) return liveSearch(root, q, limit);
  if (!index.length) await ensureIndex(); else void ensureIndex();
  const words = q.split(/\s+/);
  const hits = index.filter((e) => words.every((w) => e.lower.includes(w)));
  hits.sort((a, b) => Number(b.lower.startsWith(q)) - Number(a.lower.startsWith(q)) || a.name.length - b.name.length);
  return hits.slice(0, limit).map((h) => ({ name: h.name, path: h.path, isDir: h.isDir }));
}

async function liveSearch(root: string, q: string, limit: number) {
  const out: { name: string; path: string; isDir: boolean }[] = [];
  let visited = 0;
  async function walkDir(dir: string, depth: number) {
    if (depth > 6 || out.length >= limit || visited > 40000) return;
    let ents: fs.Dirent[];
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      visited++;
      if (out.length >= limit) return;
      if (e.name.toLowerCase().includes(q)) out.push({ name: e.name, path: path.join(dir, e.name), isDir: e.isDirectory() });
      if (e.isDirectory() && !SKIP_DIRS.test(e.name) && !HIDDEN_NAMES.test(e.name)) await walkDir(path.join(dir, e.name), depth + 1);
    }
  }
  await walkDir(root, 0);
  return out;
}

// ---------- Directory watching for live Finder refresh
const watchers = new Map<string, fs.FSWatcher>();
export function watchDir(wc: WebContents, dir: string) {
  const key = `${wc.id}:${dir}`;
  if (watchers.has(key)) return;
  try {
    let t: NodeJS.Timeout | null = null;
    const w = fs.watch(dir, { persistent: false }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { if (!wc.isDestroyed()) wc.send('fs:changed', dir); }, 250);
    });
    w.on('error', () => { w.close(); watchers.delete(key); });
    watchers.set(key, w);
    wc.once('destroyed', () => unwatchDir(wc.id, dir));
  } catch { /* ignore */ }
}
export function unwatchDir(wcId: number, dir: string) {
  const key = `${wcId}:${dir}`;
  watchers.get(key)?.close();
  watchers.delete(key);
}

// ---------- mxfile:// protocol: streams local files (with Range support for audio/video seeking)
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', wma: 'audio/x-ms-wma',
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', m4v: 'video/mp4',
  pdf: 'application/pdf', txt: 'text/plain', json: 'application/json',
};

const thumbCache = new Map<string, Buffer>();
export function registerFileProtocol() {
  protocol.handle('mxfile', async (req) => {
    const url = new URL(req.url);
    const p = decodeURIComponent(url.pathname.slice(1));
    try {
      if (url.host === 'thumb') {
        const size = Number(url.searchParams.get('s') || 256);
        const key = `${p}|${size}`;
        let buf = thumbCache.get(key);
        if (!buf) {
          const img = await nativeImage.createThumbnailFromPath(p, { width: size, height: size });
          buf = img.toPNG();
          thumbCache.set(key, buf);
          if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value as string);
        }
        return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' } });
      }
      const st = await fsp.stat(p);
      const type = MIME[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.get('range');
      if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
        const stream = fs.createReadStream(p, { start, end });
        return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers: { 'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes' } });
      }
      const stream = fs.createReadStream(p);
      return new Response(Readable.toWeb(stream) as ReadableStream, { headers: { 'content-type': type, 'content-length': String(st.size), 'accept-ranges': 'bytes' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
