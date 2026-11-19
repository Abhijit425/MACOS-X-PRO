import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, Folder } from 'lucide-react';
import type { FileEntry, WidgetInstance } from '@shared/types';
import { api, openApp, thumbUrl } from '../lib/api';
import { useClickThrough, useEvent, useMetrics, useSettings, useLocalStorage } from '../lib/hooks';
import { useContextMenu, useDialog, useToast } from '../components/ui';
import { WIDGET_CATALOG, WidgetBody, isMetricWidget } from './widgets';

export default function Desktop({ displayId, primary }: { displayId: string; primary: boolean }) {
  const [s, update] = useSettings();
  const immersive = s.mode === 'immersive';
  const [wall, setWall] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showIcons, setShowIcons] = useLocalStorage('desktopIcons', true);
  const ctx = useContextMenu();
  const widgets = primary && s.widgetsEnabled ? s.widgets : [];
  const needMetrics = widgets.some((w) => isMetricWidget(w.type));
  const metrics = useMetrics(needMetrics);

  // In overlay mode the desktop layer is click-through except on widgets
  useClickThrough('win:hit', immersive || editing);
  useEffect(() => { void api.invoke('win:hit', immersive || editing).catch(() => undefined); }, [immersive, editing]);

  useEffect(() => { void api.invoke<Record<string, string>>('wallpapers:effective').then((m) => setWall(m[displayId] || Object.values(m)[0] || null)).catch(() => undefined); }, [displayId]);
  useEvent<Record<string, string>>('wallpaper:changed', (m) => setWall(m[displayId] || Object.values(m)[0] || null));

  const setWidget = (id: string, patch: Partial<WidgetInstance>) => update({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  const desktopMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-widget],[data-icon]')) return;
    ctx(e, [
      { label: 'New Folder', onClick: async () => { const sf = await api.invoke<{ desktop: string }>('fs:special'); await api.invoke('fs:mkdir', sf.desktop); } },
      { separator: true },
      { label: 'Change Wallpaper…', onClick: () => void openApp('wallpapers') },
      { label: editing ? 'Done Editing Widgets' : 'Edit Widgets…', onClick: () => setEditing((v) => !v) },
      { label: s.widgetsEnabled ? 'Hide Widgets' : 'Show Widgets', onClick: () => update({ widgetsEnabled: !s.widgetsEnabled }) },
      ...(immersive ? [{ label: 'Show Desktop Icons', checked: showIcons, onClick: () => setShowIcons(!showIcons) }] : []),
      { separator: true },
      { label: 'Open Desktop in Finder', onClick: () => void openApp('finder', { place: 'desktop' }) },
      { label: 'System Settings…', onClick: () => void openApp('settings', { section: 'desktop' }) },
      { label: 'Windows Display Settings…', onClick: () => void api.invoke('winsettings:open', 'display') },
    ]);
  };

  return (
    <div className="fixed inset-0 overflow-hidden" onContextMenu={desktopMenu} onMouseDown={(e) => { if (editing && e.target === e.currentTarget) setEditing(false); }}>
      <AnimatePresence>
        {immersive && wall && (
          <motion.div key={wall} className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url("${wall}")` }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.1 }} />
        )}
      </AnimatePresence>
      {immersive && primary && showIcons && <DesktopIcons />}
      {widgets.map((w) => <WidgetFrame key={w.id} w={w} editing={editing} metrics={metrics} onChange={(p) => setWidget(w.id, p)} onRemove={() => update({ widgets: s.widgets.filter((x) => x.id !== w.id) })} onEdit={() => setEditing(true)} />)}
      <AnimatePresence>{editing && primary && <WidgetGallery onDone={() => setEditing(false)} />}</AnimatePresence>
    </div>
  );
}

function WidgetFrame({ w, editing, metrics, onChange, onRemove, onEdit }: { w: WidgetInstance; editing: boolean; metrics: ReturnType<typeof useMetrics>; onChange: (p: Partial<WidgetInstance>) => void; onRemove: () => void; onEdit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ctx = useContextMenu();
  const pos = drag || { x: (w.x / 100) * window.innerWidth, y: (w.y / 100) * window.innerHeight, w: w.w, h: w.h };
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const startMove = (e: React.PointerEvent) => {
    if (e.button !== 0 || (!editing && (e.target as HTMLElement).closest('button,input,a,form,[data-nodrag]'))) return;
    const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      setDrag({ x: clamp(ox + dx, 0, window.innerWidth - pos.w), y: clamp(oy + dy, 0, window.innerHeight - pos.h), w: pos.w, h: pos.h });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (moved) {
        const nx = clamp(ox + ev.clientX - sx, 0, window.innerWidth - pos.w), ny = clamp(oy + ev.clientY - sy, 0, window.innerHeight - pos.h);
        onChange({ x: (Math.round(nx / 8) * 8 / window.innerWidth) * 100, y: (Math.round(ny / 8) * 8 / window.innerHeight) * 100 });
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = pos.w, oh = pos.h;
    const move = (ev: PointerEvent) => setDrag({ x: pos.x, y: pos.y, w: clamp(ow + ev.clientX - sx, 180, 720), h: clamp(oh + ev.clientY - sy, 130, 640) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      onChange({ w: Math.round(clamp(ow + ev.clientX - sx, 180, 720)), h: Math.round(clamp(oh + ev.clientY - sy, 130, 640)) });
      setDrag(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const extraMenu = w.type === 'clock' ? [
    { label: 'Digital', checked: w.options.style !== 'analog', onClick: () => onChange({ options: { ...w.options, style: 'digital' } }) },
    { label: 'Analog', checked: w.options.style === 'analog', onClick: () => onChange({ options: { ...w.options, style: 'analog' } }) },
    { label: 'Show Seconds', checked: !!w.options.seconds, onClick: () => onChange({ options: { ...w.options, seconds: !w.options.seconds } }) },
    { separator: true },
  ] : [];

  return (
    <motion.div ref={ref} data-hit data-widget className="absolute select-none" style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h, zIndex: drag ? 20 : 10 }}
      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: drag ? 1.02 : 1, rotate: editing && !drag ? [0, -0.4, 0.4, 0] : 0 }}
      transition={editing && !drag ? { rotate: { repeat: Infinity, duration: 0.5 }, default: { type: 'spring', stiffness: 400, damping: 30 } } : { type: 'spring', stiffness: 400, damping: 30 }}
      onPointerDown={startMove}
      onContextMenu={(e) => { e.stopPropagation(); ctx(e, [...extraMenu, { label: 'Edit Widgets…', onClick: onEdit }, { label: 'Remove Widget', danger: true, onClick: onRemove }]); }}>
      <div className={`h-full w-full ${editing ? 'pointer-events-none' : ''}`} style={{ filter: drag ? 'drop-shadow(0 20px 30px rgba(0,0,0,.35))' : undefined }}><WidgetBody w={w} metrics={metrics} /></div>
      {editing && (<>
        <button className="absolute -left-2 -top-2 w-6 h-6 rounded-full glass-strong flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}><X size={13} /></button>
        <div className="absolute right-1 bottom-1 w-4 h-4 cursor-nwse-resize rounded-br-[18px] border-r-2 border-b-2 border-[rgb(var(--fg)/.5)]" onPointerDown={startResize} />
      </>)}
    </motion.div>
  );
}

function WidgetGallery({ onDone }: { onDone: () => void }) {
  const [s, update] = useSettings();
  const add = (type: (typeof WIDGET_CATALOG)[number]) => {
    const n = s.widgets.length;
    void update({ widgets: [...s.widgets, { id: `w-${Date.now()}`, type: type.type, x: 30 + (n % 4) * 6, y: 15 + (n % 5) * 6, w: type.w, h: type.h, options: {} }] });
  };
  return (
    <motion.div data-hit initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
      className="absolute left-1/2 -translate-x-1/2 bottom-[120px] glass-strong rounded-[22px] p-4 w-[760px] max-w-[94vw] z-30">
      <div className="flex items-center justify-between mb-3"><div className="font-semibold text-[15px]">Add Widgets</div><button className="btn btn-primary" onClick={onDone}>Done</button></div>
      <div className="grid grid-cols-4 gap-2">
        {WIDGET_CATALOG.map((c) => (
          <button key={c.type} className="tile px-3 py-3 text-left hoverable flex items-center gap-2" onClick={() => add(c)}><Plus size={14} className="text-[rgb(var(--accent))]" /><span className="text-[12.5px]">{c.name}</span></button>
        ))}
      </div>
      <div className="muted text-[11.5px] mt-3">Drag widgets to move them, use the corner handle to resize, right-click for options.</div>
    </motion.div>
  );
}

function DesktopIcons() {
  const [items, setItems] = useState<FileEntry[]>([]);
  const [dir, setDir] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const ctx = useContextMenu();
  const dialog = useDialog();
  const toast = useToast();
  const load = useMemo(() => (d: string) => api.invoke<FileEntry[]>('fs:list', d).then((l) => setItems(l.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)).slice(0, 60))).catch(() => undefined), []);
  useEffect(() => { void api.invoke<{ desktop: string }>('fs:special').then((sf) => { setDir(sf.desktop); void load(sf.desktop); void api.invoke('fs:watch', sf.desktop); }); }, [load]);
  useEvent<string>('fs:changed', (d) => { if (d === dir) void load(dir); });
  const perCol = Math.max(1, Math.floor((window.innerHeight - 160) / 96));
  return (
    <div className="absolute top-[40px] right-[16px] bottom-[110px] flex flex-col flex-wrap-reverse content-start gap-1" style={{ direction: 'rtl' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
      {items.map((f, i) => (
        <button key={f.path} data-icon data-hit style={{ direction: 'ltr', order: i }} title={f.name}
          className={`w-[86px] h-[92px] flex flex-col items-center gap-1 p-1 rounded-lg ${sel === f.path ? 'bg-black/25' : ''}`}
          onMouseDown={() => setSel(f.path)}
          onDoubleClick={() => (f.isDir ? void openApp('finder', { path: f.path }) : void api.invoke('fs:open', f.path).catch((e: Error) => toast(e.message, 'error')))}
          onContextMenu={(e) => { e.stopPropagation(); setSel(f.path); ctx(e, [
            { label: 'Open', onClick: () => (f.isDir ? void openApp('finder', { path: f.path }) : void api.invoke('fs:open', f.path)) },
            { label: 'Show in Finder', onClick: () => void openApp('finder', { path: dir, select: f.path }) },
            { label: 'Rename…', onClick: async () => { const n = await dialog.prompt({ title: 'Rename', input: f.name }); if (n && n !== f.name) await api.invoke('fs:rename', f.path, n).catch((er: Error) => toast(er.message, 'error')); } },
            { separator: true },
            { label: 'Move to Recycle Bin', danger: true, onClick: async () => { if (await dialog.confirm({ title: `Move “${f.name}” to the Recycle Bin?`, confirm: 'Move to Recycle Bin', danger: true })) await api.invoke('fs:trash', [f.path]).catch((er: Error) => toast(er.message, 'error')); } },
          ]); }}>
          {f.isDir ? <Folder size={52} strokeWidth={1.2} className="text-[#5ab8ff]" fill="#5ab8ff66" /> : <img src={thumbUrl(f.path, 96)} className="w-[52px] h-[52px] object-contain drop-shadow" alt="" />}
          <span className={`text-[11.5px] leading-tight text-white text-center line-clamp-2 break-all px-1 rounded ${sel === f.path ? 'bg-[rgb(var(--accent))]' : ''}`} style={{ textShadow: sel === f.path ? undefined : '0 1px 3px rgba(0,0,0,.8)' }}>{f.name}</span>
        </button>
      ))}
      <span style={{ display: 'none' }}>{perCol}</span>
    </div>
  );
}
