// Clipboard history. Uses the Windows clipboard sequence number so we only read the clipboard
// when it actually changed (no repeated bitmap copies).
import { app, clipboard, nativeImage, ClipboardItem } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, run } from './db';
import { getSettings, broadcast } from './settings';
import { clipboardSequence } from './native';
import type { ClipItem } from '@shared/types';

const clipDir = () => path.join(app.getPath('userData'), 'clips');
let lastSeq: number | null = null;
let lastHash = '';
let timer: NodeJS.Timeout | null = null;
let suppressUntil = 0;

export function listClips(): ClipItem[] {
  return all<Omit<ClipItem, 'pinned'> & { pinned: number }>('SELECT id,kind,text,image,ts,pinned FROM clipboard ORDER BY pinned DESC, ts DESC LIMIT 500').map((c) => ({ ...c, pinned: !!c.pinned }));
}

let busy = false;
async function capture() {
  const seq = clipboardSequence();
  if (seq !== null) { if (seq === lastSeq) return; lastSeq = seq; }
  if (Date.now() < suppressUntil || busy) return;
  busy = true;
  try {
    const items = await clipboard.read();
    const types = items.flatMap((i) => i.types);
    let item: Omit<ClipItem, 'id' | 'ts' | 'pinned'> | null = null;
    let full: Buffer | null = null;
    let h = '';
    const imgType = types.find((t) => t.startsWith('image/'));
    if (imgType) {
      if (seq === null) return; // without a sequence number we avoid polling bitmaps
      const owner = items.find((i) => i.types.includes(imgType))!;
      const blob = (await owner.getType(imgType)) as Blob;
      const buf = Buffer.from(await blob.arrayBuffer());
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) {
        const thumb = img.resize({ width: Math.min(360, img.getSize().width) });
        full = img.toPNG();
        h = crypto.createHash('sha1').update(buf.subarray(0, 65536)).digest('hex');
        item = { kind: 'image', text: `Image ${img.getSize().width}×${img.getSize().height}`, image: thumb.toDataURL() };
      }
    } else if (types.includes('text/plain')) {
      const text = await clipboard.readText();
      if (text && text.trim()) {
        h = crypto.createHash('sha1').update(text).digest('hex');
        item = { kind: 'text', text: text.slice(0, 20000), image: null };
      }
    }
    if (!item || h === lastHash) return;
    lastHash = h;
    run('DELETE FROM clipboard WHERE hash=? AND pinned=0', [h]);
    const id = crypto.randomUUID();
    if (full) { try { fs.mkdirSync(clipDir(), { recursive: true }); fs.writeFileSync(path.join(clipDir(), `${id}.png`), full); } catch { /* ignore */ } }
    run('INSERT INTO clipboard(id,kind,text,image,ts,pinned,hash) VALUES(?,?,?,?,?,0,?)', [id, item.kind, item.text, item.image, Date.now(), h]);
    const max = getSettings().clipboardMax;
    run('DELETE FROM clipboard WHERE pinned=0 AND id NOT IN (SELECT id FROM clipboard WHERE pinned=0 ORDER BY ts DESC LIMIT ?)', [max]);
    broadcast('clipboard:changed', listClips());
  } finally { busy = false; }
}

export async function writeImage(png: Buffer) {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
}

export function startClipboardWatch() {
  stopClipboardWatch();
  if (!getSettings().clipboardHistory) return;
  timer = setInterval(() => { capture().catch(() => undefined); }, 900);
}
export function stopClipboardWatch() { if (timer) clearInterval(timer); timer = null; }

export async function copyClip(id: string) {
  const c = all<{ kind: string; text: string; image: string | null }>('SELECT kind,text,image FROM clipboard WHERE id=?', [id])[0];
  if (!c) return false;
  suppressUntil = Date.now() + 1500;
  if (c.kind === 'text') await clipboard.writeText(c.text);
  else {
    const f = path.join(clipDir(), `${id}.png`);
    await writeImage(fs.existsSync(f) ? fs.readFileSync(f) : nativeImage.createFromDataURL(c.image || '').toPNG());
  }
  return true;
}
export function pinClip(id: string, pinned: boolean) { run('UPDATE clipboard SET pinned=? WHERE id=?', [pinned ? 1 : 0, id]); broadcast('clipboard:changed', listClips()); }
export function deleteClip(id: string) { try { fs.rmSync(path.join(clipDir(), `${id}.png`), { force: true }); } catch { /* ignore */ } run('DELETE FROM clipboard WHERE id=?', [id]); broadcast('clipboard:changed', listClips()); }
export function clearClips() { run('DELETE FROM clipboard WHERE pinned=0'); broadcast('clipboard:changed', listClips()); }
