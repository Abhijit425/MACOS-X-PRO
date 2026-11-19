export function bytes(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
}
export const rate = (n: number) => `${bytes(n)}/s`;
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

export function duration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function hm(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
export function timeStr(d: Date, h24: boolean, seconds = false) {
  return d.toLocaleTimeString([], { hour: h24 ? '2-digit' : 'numeric', minute: '2-digit', second: seconds ? '2-digit' : undefined, hour12: !h24 });
}
export function relTime(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
export function dateShort(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
export const basename = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
export const dirname = (p: string) => { const s = p.replace(/[\\/]+$/, ''); const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/')); return i <= 2 ? s.slice(0, i + 1) : s.slice(0, i); };
export const joinPath = (a: string, b: string) => (a.endsWith('\\') || a.endsWith('/') ? a + b : `${a}${a.includes('/') && !a.includes('\\') ? '/' : '\\'}${b}`);

export function kindOf(ext: string, isDir: boolean) {
  if (isDir) return 'Folder';
  const map: Record<string, string> = {
    jpg: 'JPEG image', jpeg: 'JPEG image', png: 'PNG image', gif: 'GIF image', webp: 'WebP image', bmp: 'Bitmap image', svg: 'SVG image', heic: 'HEIC image',
    mp3: 'MP3 audio', wav: 'WAV audio', flac: 'FLAC audio', m4a: 'AAC audio', mp4: 'MPEG-4 movie', mkv: 'Matroska video', mov: 'QuickTime movie', avi: 'AVI video',
    pdf: 'PDF document', doc: 'Word document', docx: 'Word document', xls: 'Excel workbook', xlsx: 'Excel workbook', ppt: 'PowerPoint', pptx: 'PowerPoint', txt: 'Plain text', md: 'Markdown',
    zip: 'ZIP archive', rar: 'RAR archive', '7z': '7-Zip archive', exe: 'Application', msi: 'Installer', lnk: 'Shortcut', json: 'JSON', js: 'JavaScript', ts: 'TypeScript', py: 'Python script', html: 'HTML document', css: 'Stylesheet',
  };
  return map[ext] || (ext ? `${ext.toUpperCase()} file` : 'Document');
}
export const isImage = (ext: string) => /^(jpe?g|png|gif|webp|bmp|svg|avif|ico)$/.test(ext);
export const isAudio = (ext: string) => /^(mp3|wav|flac|m4a|aac|ogg|opus)$/.test(ext);
export const isVideo = (ext: string) => /^(mp4|webm|mkv|mov|m4v)$/.test(ext);
export const isText = (ext: string) => /^(txt|md|json|js|ts|tsx|jsx|css|html|xml|yml|yaml|ini|log|csv|py|java|c|cpp|h|cs|go|rs|sh|bat|ps1|sql|p|i|w|cls|env|toml|cfg)$/.test(ext);
