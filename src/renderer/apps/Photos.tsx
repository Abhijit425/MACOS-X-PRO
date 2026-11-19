import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize, FolderOpen, Play, Pause, Image as ImageIcon, Info, Monitor, Grid3x3 } from 'lucide-react';
import type { FileEntry } from '@shared/types';
import { Window } from '../components/Window';
import { api, fileUrl, thumbUrl } from '../lib/api';
import { useEvent, useSettings } from '../lib/hooks';
import { basename, bytes, dirname, isImage } from '../lib/format';
import { Empty, useToast } from '../components/ui';

export default function Photos() {
  const [, update] = useSettings();
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [idx, setIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [slideshow, setSlideshow] = useState(false);
  const [info, setInfo] = useState(false);
  const toast = useToast();
  const stage = useRef<HTMLDivElement>(null);

  const openFolder = useCallback(async (dir: string, select?: string) => {
    const list = (await api.invoke<FileEntry[]>('fs:list', dir)).filter((f) => !f.isDir && isImage(f.ext)).sort((a, b) => b.mtime - a.mtime);
    setFolder(dir); setFiles(list);
    setIdx(select ? Math.max(0, list.findIndex((f) => f.path.toLowerCase() === select.toLowerCase())) : null);
  }, []);
  const openArg = useCallback((a: Record<string, string>) => {
    if (a.path) void openFolder(dirname(a.path), a.path);
    else if (a.folder) void openFolder(a.folder);
  }, [openFolder]);
  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    if (p.path || p.folder) openArg(p);
    else void api.invoke<{ pictures: string }>('fs:special').then((s) => openFolder(s.pictures)).catch(() => undefined);
  }, [openArg, openFolder]);
  useEvent<Record<string, string>>('app:args', openArg);

  const cur = idx !== null ? files[idx] : null;
  useEffect(() => { setZoom(1); setRot(0); setPan({ x: 0, y: 0 }); }, [idx]);
  useEffect(() => { void api.invoke('win:setTitle', cur ? cur.name : 'Photos').catch(() => undefined); }, [cur]);
  useEffect(() => {
    if (!slideshow || idx === null) return;
    const t = setInterval(() => setIdx((i) => (i === null ? 0 : (i + 1) % files.length)), 3500);
    return () => clearInterval(t);
  }, [slideshow, idx, files.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (idx === null) return;
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(files.length - 1, (i || 0) + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, (i || 0) - 1));
      else if (e.key === 'Escape') { setSlideshow(false); setIdx(null); }
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(8, z * 1.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.1, z / 1.25));
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      else if (e.key.toLowerCase() === 'r') setRot((r) => r + 90);
      else if (e.key === ' ') { e.preventDefault(); setSlideshow((s) => !s); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [idx, files.length]);

  const grid = useMemo(() => files.slice(0, 1500), [files]);
  const pick = async () => { const d = await api.invoke<string | null>('fs:pickFolder'); if (d) void openFolder(d); };

  return (
    <Window title={cur ? cur.name : folder ? basename(folder) : 'Photos'} toolbar={cur ? <>
      <button className="icon-btn" title="Back to grid" onClick={() => { setIdx(null); setSlideshow(false); }}><Grid3x3 size={15} /></button>
      <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))}><ZoomOut size={15} /></button>
      <span className="text-[11px] w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <button className="icon-btn" onClick={() => setZoom((z) => Math.min(8, z * 1.25))}><ZoomIn size={15} /></button>
      <button className="icon-btn" title="Rotate (R)" onClick={() => setRot((r) => r + 90)}><RotateCw size={15} /></button>
      <button className="icon-btn" title="Slideshow (Space)" onClick={() => setSlideshow(!slideshow)}>{slideshow ? <Pause size={15} /> : <Play size={15} />}</button>
      <button className="icon-btn" title="Full screen" onClick={() => void api.invoke('win:toggleMaximize')}><Maximize size={15} /></button>
      <button className={`icon-btn ${info ? 'active' : ''}`} onClick={() => setInfo(!info)}><Info size={15} /></button>
      <button className="btn !py-1 text-[12px]" title="Use as wallpaper" onClick={async () => { await update({ customWallpapers: [...new Set([...(await api.invoke<{ customWallpapers: string[] }>('settings:get')).customWallpapers, cur.path])], wallpaper: cur.path }); toast('Set as wallpaper'); }}><Monitor size={13} /> Set Wallpaper</button>
    </> : <button className="btn text-[12.5px]" onClick={pick}><FolderOpen size={14} /> Open Folder…</button>}>
      {cur ? (
        <div className="h-full flex">
          <div ref={stage} className="flex-1 relative overflow-hidden bg-black/80 flex items-center justify-center"
            onWheel={(e) => setZoom((z) => Math.max(0.1, Math.min(8, z * (e.deltaY < 0 ? 1.12 : 0.89))))}
            onPointerDown={(e) => { if (zoom <= 1) return; const sx = e.clientX - pan.x, sy = e.clientY - pan.y; const mv = (ev: PointerEvent) => setPan({ x: ev.clientX - sx, y: ev.clientY - sy }); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); }}
            onDoubleClick={() => { setZoom(zoom === 1 ? 2 : 1); setPan({ x: 0, y: 0 }); }}>
            <img key={cur.path} src={fileUrl(cur.path)} draggable={false} className="max-w-full max-h-full object-contain transition-transform duration-150" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`, cursor: zoom > 1 ? 'grab' : 'zoom-in' }} alt="" />
            <button className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20" disabled={idx === 0} onClick={() => setIdx((idx || 0) - 1)}><ChevronLeft /></button>
            <button className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20" disabled={idx === files.length - 1} onClick={() => setIdx((idx || 0) + 1)}><ChevronRight /></button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/70 text-[12px] bg-black/40 px-3 rounded-full">{(idx || 0) + 1} / {files.length}</div>
          </div>
          {info && <div className="w-[220px] p-4 text-[12px] space-y-2 border-l border-[rgb(var(--stroke)/var(--stroke-a))]"><div className="font-semibold break-all">{cur.name}</div><div className="muted">{bytes(cur.size)}</div><div className="muted">Modified {new Date(cur.mtime).toLocaleString()}</div><div className="muted break-all">{cur.path}</div><button className="btn text-[12px] w-full" onClick={() => void api.invoke('fs:reveal', cur.path)}>Show in Explorer</button><button className="btn text-[12px] w-full" onClick={() => void api.invoke('fs:open', cur.path)}>Open with default app</button></div>}
        </div>
      ) : grid.length === 0 ? (
        <Empty icon={<ImageIcon size={44} />} title="No photos in this folder" sub={folder} action={<button className="btn btn-primary" onClick={pick}><FolderOpen size={14} /> Choose a Folder</button>} />
      ) : (
        <div className="h-full overflow-y-auto p-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-[3px] content-start">
          {grid.map((f, i) => <button key={f.path} className="aspect-square overflow-hidden bg-[rgb(var(--fg)/.05)] hover:opacity-90" onClick={() => setIdx(i)} title={f.name}><img src={thumbUrl(f.path, 256)} loading="lazy" className="w-full h-full object-cover" alt="" /></button>)}
        </div>
      )}
    </Window>
  );
}
