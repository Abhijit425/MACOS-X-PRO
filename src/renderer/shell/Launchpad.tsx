import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, RefreshCw } from 'lucide-react';
import { BUILTIN_APPS } from '@shared/apps';
import type { AppEntry } from '@shared/types';
import { api, openApp } from '../lib/api';
import { useSettings, useMotionPrefs } from '../lib/hooks';
import { BuiltinIcon, ExternalIcon } from '../components/AppIcon';
import { useContextMenu, useDialog, useToast } from '../components/ui';

type Item = { key: string; name: string; category: string; icon: (s: number) => React.ReactNode; launch: () => unknown; target?: string };

export function Launchpad({ apps, onClose, scanning, rescan }: { apps: AppEntry[]; onClose: () => void; scanning: boolean; rescan: () => void }) {
  const [s, update] = useSettings();
  const motionPrefs = useMotionPrefs();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [page, setPage] = useState(0);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [hint, setHint] = useState<{ key: string; mode: 'merge' | 'before' } | null>(null);
  const ctx = useContextMenu();
  const dialog = useDialog();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const wheelLock = useRef(0);

  const items = useMemo(() => {
    const m = new Map<string, Item>();
    for (const a of BUILTIN_APPS) m.set(`b:${a.id}`, { key: `b:${a.id}`, name: a.name, category: a.category, icon: (sz) => <BuiltinIcon id={a.id} size={sz} />, launch: () => openApp(a.id) });
    for (const a of apps) m.set(`a:${a.id}`, { key: `a:${a.id}`, name: a.name, category: a.category, target: a.target, icon: (sz) => <ExternalIcon icon={a.icon} name={a.name} size={sz} />, launch: () => api.invoke('apps:launch', a.target) });
    return m;
  }, [apps]);

  const folders = s.launchpadFolders;
  const inFolder = useMemo(() => new Set(folders.flatMap((f) => f.apps)), [folders]);
  const order = useMemo(() => {
    const known = s.launchpadOrder.filter((k) => (k.startsWith('f:') ? folders.some((f) => `f:${f.id}` === k) : items.has(k) && !inFolder.has(k)));
    const rest = [...items.keys()].filter((k) => !known.includes(k) && !inFolder.has(k)).sort((a, b) => (a.startsWith('b:') === b.startsWith('b:') ? items.get(a)!.name.localeCompare(items.get(b)!.name) : a.startsWith('b:') ? -1 : 1));
    const fk = folders.map((f) => `f:${f.id}`).filter((k) => !known.includes(k));
    return [...known, ...fk, ...rest];
  }, [s.launchpadOrder, items, folders, inFolder]);

  const categories = useMemo(() => ['All', ...[...new Set([...items.values()].map((i) => i.category))].sort()], [items]);
  const query = q.trim().toLowerCase();
  const visible = query || cat !== 'All'
    ? [...items.values()].filter((i) => (!query || i.name.toLowerCase().includes(query)) && (cat === 'All' || i.category === cat)).map((i) => i.key)
    : order;

  const [dims, setDims] = useState({ cols: 7, rows: 5 });
  useEffect(() => {
    const calc = () => setDims({ cols: Math.max(4, Math.min(8, Math.floor((window.innerWidth - 160) / 150))), rows: Math.max(3, Math.min(5, Math.floor((window.innerHeight - 240) / 140))) });
    calc(); window.addEventListener('resize', calc); return () => window.removeEventListener('resize', calc);
  }, []);
  const per = dims.cols * dims.rows;
  const pages = Math.max(1, Math.ceil(visible.length / per));
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [pages, page]);
  useEffect(() => { setPage(0); }, [query, cat]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60); }, []);

  const launch = (it: Item) => { onClose(); void Promise.resolve(it.launch()).catch((e: Error) => toast(e.message, 'error')); };

  const commitOrder = (next: string[]) => update({ launchpadOrder: next });
  const onDrop = (target: string) => {
    if (!drag || drag === target) return;
    if (hint?.mode === 'merge' && !drag.startsWith('f:')) {
      if (target.startsWith('f:')) {
        const fid = target.slice(2);
        void update({ launchpadFolders: folders.map((f) => (f.id === fid ? { ...f, apps: [...f.apps.filter((a) => a !== drag), drag] } : { ...f, apps: f.apps.filter((a) => a !== drag) })) });
      } else if (!target.startsWith('f:')) {
        const id = Math.random().toString(36).slice(2, 9);
        const a = items.get(target), b = items.get(drag);
        const name = a && b && a.category === b.category ? a.category : 'Folder';
        const nextOrder = order.map((k) => (k === target ? `f:${id}` : k)).filter((k) => k !== drag);
        void update({ launchpadFolders: [...folders, { id, name, apps: [target, drag] }], launchpadOrder: nextOrder });
      }
    } else {
      const next = order.filter((k) => k !== drag);
      next.splice(next.indexOf(target), 0, drag);
      commitOrder(next);
    }
    setDrag(null); setHint(null);
  };

  const removeFromFolder = (fid: string, key: string) => {
    const nextFolders = folders.map((f) => (f.id === fid ? { ...f, apps: f.apps.filter((a) => a !== key) } : f)).filter((f) => f.apps.length > 0);
    void update({ launchpadFolders: nextFolders, launchpadOrder: [...order.filter((k) => nextFolders.some((f) => `f:${f.id}` === k) || !k.startsWith('f:')), key] });
  };

  const tile = (key: string, i: number) => {
    if (key.startsWith('f:')) {
      const f = folders.find((x) => x.id === key.slice(2));
      if (!f) return null;
      return (
        <Tile key={key} name={f.name} highlight={hint?.key === key} draggable onDragStart={() => setDrag(key)} onDragEnd={() => { setDrag(null); setHint(null); }}
          onDragOverItem={(mode) => setHint({ key, mode })} onDropItem={() => onDrop(key)} onClick={() => setOpenFolder(f.id)} delay={i}
          onContextMenu={(e) => ctx(e, [{ label: 'Open Folder', onClick: () => setOpenFolder(f.id) }, { label: 'Rename Folder…', onClick: async () => { const n = await dialog.prompt({ title: 'Rename folder', input: f.name }); if (n) void update({ launchpadFolders: folders.map((x) => (x.id === f.id ? { ...x, name: n } : x)) }); } }, { label: 'Ungroup Folder', onClick: () => { void update({ launchpadFolders: folders.filter((x) => x.id !== f.id), launchpadOrder: order.flatMap((k) => (k === key ? f.apps : [k])) }); } }])}>
          <div className="w-[76px] h-[76px] rounded-[18px] p-[8px] grid grid-cols-3 gap-[4px]" style={{ background: 'rgba(255,255,255,.22)', backdropFilter: 'blur(10px)' }}>
            {f.apps.slice(0, 9).map((k) => <div key={k} className="flex items-center justify-center">{items.get(k)?.icon(17)}</div>)}
          </div>
        </Tile>
      );
    }
    const it = items.get(key);
    if (!it) return null;
    return (
      <Tile key={key} name={it.name} highlight={hint?.key === key && hint.mode === 'merge'} insertBefore={hint?.key === key && hint.mode === 'before'} draggable={!query && cat === 'All'} delay={i}
        onDragStart={() => setDrag(key)} onDragEnd={() => { setDrag(null); setHint(null); }} onDragOverItem={(mode) => setHint({ key, mode })} onDropItem={() => onDrop(key)}
        onClick={() => launch(it)}
        onContextMenu={(e) => ctx(e, [
          { label: 'Open', onClick: () => launch(it) },
          ...(it.target ? [{ label: 'Show in Finder', onClick: () => { onClose(); void api.invoke('fs:reveal', it.target!); } }] : []),
          { label: 'Add to Dock', onClick: () => {
            const dockItem = key.startsWith('b:') ? { kind: 'builtin' as const, id: key.slice(2) } : { kind: 'external' as const, id: key.slice(2), name: it.name, target: it.target!, exe: apps.find((a) => `a:${a.id}` === key)?.exe };
            void update({ dockItems: [...s.dockItems, dockItem] }); toast(`${it.name} added to the Dock`);
          } },
          { separator: true },
          { label: 'New Folder with this App', onClick: async () => { const n = await dialog.prompt({ title: 'New folder', input: it.category }); if (!n) return; const id = Math.random().toString(36).slice(2, 9); void update({ launchpadFolders: [...folders, { id, name: n, apps: [key] }], launchpadOrder: order.map((k) => (k === key ? `f:${id}` : k)) }); } },
        ])}>
        {it.icon(76)}
      </Tile>
    );
  };

  const folder = folders.find((f) => f.id === openFolder);
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col" data-hit
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 * (motionPrefs.enabled ? 1 : 0) }}
      style={{ background: 'radial-gradient(ellipse at center, rgba(20,24,40,.62), rgba(5,6,12,.78))' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (openFolder) setOpenFolder(null); else onClose(); } if (e.key === 'ArrowRight' && !q) setPage((p) => Math.min(pages - 1, p + 1)); if (e.key === 'ArrowLeft' && !q) setPage((p) => Math.max(0, p - 1)); if (e.key === 'Enter' && query && visible[0]) { const it = items.get(visible[0]); if (it) launch(it); } }}
      onWheel={(e) => { if (Date.now() - wheelLock.current < 450) return; if (Math.abs(e.deltaY) + Math.abs(e.deltaX) < 20) return; wheelLock.current = Date.now(); setPage((p) => Math.max(0, Math.min(pages - 1, p + (e.deltaY + e.deltaX > 0 ? 1 : -1)))); }}
    >
      <motion.div initial={{ scale: 1.08 }} animate={{ scale: 1 }} exit={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="flex flex-col h-full" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="flex flex-col items-center gap-3 pt-8 pb-2" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="flex items-center gap-2 w-[280px] h-[30px] px-3 rounded-lg text-white" style={{ background: 'rgba(255,255,255,.16)', border: '0.5px solid rgba(255,255,255,.25)' }}>
            <Search size={14} className="opacity-70" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent outline-none placeholder:text-white/60 text-[13px]" />
            <button title="Rescan installed apps" onClick={rescan} className="opacity-70 hover:opacity-100"><RefreshCw size={13} className={scanning ? 'animate-spin' : ''} /></button>
          </div>
          <div className="flex gap-1 flex-wrap justify-center max-w-[80%]">
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`px-3 py-[2px] rounded-full text-[12px] text-white transition ${cat === c ? 'bg-white/30' : 'bg-white/5 hover:bg-white/15'}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 relative overflow-hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div key={page + query + cat} initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -80 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className="absolute inset-0 grid content-center justify-center px-16 gap-y-6" style={{ gridTemplateColumns: `repeat(${dims.cols}, 140px)` }}
              onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
              {visible.slice(page * per, page * per + per).map((k, i) => tile(k, i))}
            </motion.div>
          </AnimatePresence>
          {visible.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-[15px]">{apps.length === 0 && scanning ? 'Finding your installed apps…' : 'No apps found'}</div>}
        </div>
        <div className="flex justify-center gap-2 pb-[110px] pt-3">
          {pages > 1 && Array.from({ length: pages }).map((_, i) => <button key={i} onClick={() => setPage(i)} className={`w-[7px] h-[7px] rounded-full ${i === page ? 'bg-white' : 'bg-white/35'}`} />)}
        </div>
      </motion.div>
      <AnimatePresence>
        {folder && (
          <motion.div className="fixed inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,.25)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenFolder(null); }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="rounded-[28px] p-6 min-w-[480px] max-w-[80vw]" style={{ background: 'rgba(255,255,255,.18)', border: '0.5px solid rgba(255,255,255,.3)', backdropFilter: 'blur(30px)' }}>
              <input defaultValue={folder.name} className="w-full text-center bg-transparent outline-none text-white text-[22px] font-medium mb-4"
                onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== folder.name) void update({ launchpadFolders: folders.map((x) => (x.id === folder.id ? { ...x, name: n } : x)) }); }} />
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(5, Math.max(3, folder.apps.length))}, 120px)` }}>
                {folder.apps.map((k) => { const it = items.get(k); if (!it) return null; return (
                  <Tile key={k} name={it.name} onClick={() => launch(it)} delay={0} onContextMenu={(e) => ctx(e, [{ label: 'Open', onClick: () => launch(it) }, { label: 'Remove from Folder', onClick: () => removeFromFolder(folder.id, k) }])}>{it.icon(70)}</Tile>
                ); })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Tile({ name, children, onClick, onContextMenu, draggable, onDragStart, onDragEnd, onDragOverItem, onDropItem, highlight, insertBefore, delay }: {
  name: string; children: React.ReactNode; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void; draggable?: boolean; delay: number;
  onDragStart?: () => void; onDragEnd?: () => void; onDragOverItem?: (mode: 'merge' | 'before') => void; onDropItem?: () => void; highlight?: boolean; insertBefore?: boolean;
}) {
  return (
    <motion.button initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: highlight ? 1.12 : 1 }} transition={{ delay: Math.min(delay, 30) * 0.008, type: 'spring', stiffness: 400, damping: 28 }}
      className="relative flex flex-col items-center gap-2 py-2 rounded-2xl group" onClick={onClick} onContextMenu={onContextMenu}
      draggable={draggable} onDragStart={(e) => { (e as unknown as React.DragEvent).dataTransfer.effectAllowed = 'move'; onDragStart?.(); }} onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const dx = Math.abs(e.clientX - (r.left + r.width / 2)); onDragOverItem?.(dx < r.width * 0.22 ? 'merge' : 'before'); }}
      onDrop={(e) => { e.preventDefault(); onDropItem?.(); }}>
      {insertBefore && <div className="absolute -left-2 top-3 h-[70px] w-[3px] rounded-full bg-white/80" />}
      <div className="transition-transform group-active:scale-90 group-active:brightness-75">{children}</div>
      <div className="text-white text-[12.5px] w-[124px] truncate text-center" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{name}</div>
    </motion.button>
  );
}
