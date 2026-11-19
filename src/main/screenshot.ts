import { desktopCapturer, screen, nativeImage, app, shell } from 'electron';
import { writeImage } from './clipboard';
import fs from 'node:fs';
import path from 'node:path';
import { notify } from './notify';
import { openCapture, closeCapture, hideShellForCapture } from './windows';

const shotsDir = () => { const d = path.join(app.getPath('pictures'), 'Screenshots'); fs.mkdirSync(d, { recursive: true }); return d; };
const stamp = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function grabDisplay(displayId?: number) {
  const d = screen.getAllDisplays().find((x) => x.id === displayId) || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src) throw new Error('No screen source available');
  return { image: src.thumbnail, display: d };
}

function save(img: Electron.NativeImage, toClipboard = true) {
  const file = path.join(shotsDir(), `Screenshot ${stamp()}.png`);
  fs.writeFileSync(file, img.toPNG());
  if (toClipboard) void writeImage(img.toPNG()).catch(() => undefined);
  notify('Screenshot', 'Screenshot saved', `${path.basename(file)} — also copied to clipboard`);
  return file;
}

export async function captureFull(opts: { delay?: number; displayId?: number; clipboard?: boolean } = {}) {
  if (opts.delay) await sleep(opts.delay * 1000);
  hideShellForCapture(false);
  const { image } = await grabDisplay(opts.displayId);
  return save(image, opts.clipboard !== false);
}

let pending: { image: Electron.NativeImage; display: Electron.Display; file: string } | null = null;
export async function captureRegionStart(opts: { delay?: number } = {}) {
  if (opts.delay) await sleep(opts.delay * 1000);
  const { image, display } = await grabDisplay();
  const tmp = path.join(app.getPath('temp'), `mx-capture-${Date.now()}.png`);
  fs.writeFileSync(tmp, image.toPNG());
  pending = { image, display, file: tmp };
  openCapture(display.id, tmp);
}

export function captureRegionFinish(rect: { x: number; y: number; width: number; height: number } | null) {
  closeCapture();
  if (!pending) return null;
  const { image, display, file } = pending;
  pending = null;
  try { fs.unlinkSync(file); } catch { /* ignore */ }
  if (!rect || rect.width < 3 || rect.height < 3) return null;
  const s = display.scaleFactor;
  const crop = image.crop({ x: Math.round(rect.x * s), y: Math.round(rect.y * s), width: Math.round(rect.width * s), height: Math.round(rect.height * s) });
  return save(crop);
}

export async function listWindowSources() {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 200 } });
  return sources.filter((s) => s.name && !/^MACOS X PRO$/.test(s.name)).map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() }));
}

export async function captureWindow(id: string) {
  const d = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor } });
  const src = sources.find((s) => s.id === id);
  if (!src) throw new Error('That window is no longer available.');
  return save(src.thumbnail);
}

export const openShotsFolder = () => shell.openPath(shotsDir());
export const lastShots = () => {
  const dir = shotsDir();
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 8).map((x) => path.join(dir, x.f));
};
export { nativeImage };
