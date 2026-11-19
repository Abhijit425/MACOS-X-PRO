import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionValue, useMotionValue, useSpring as useFmSpring, useTransform, useAnimationControls } from 'framer-motion';
import { Download, Trash2, FolderOpen } from 'lucide-react';
import { BUILTIN_APPS, builtinById } from '@shared/apps';
import type { AppEntry, DockItem, FileEntry } from '@shared/types';
import { api, openApp, thumbUrl } from '../lib/api';
import { useSettings, useMotionPrefs, useInvoke } from '../lib/hooks';
import { BuiltinIcon, ExternalIcon } from '../components/AppIcon';
import { useContextMenu, useDialog, useToast, MenuItem } from '../components/ui';

interface Props {
  apps: AppEntry[];
  onLaunchpad: () => void;
  hidden: boolean;
  setHovering: (v: boolean) => void;
}

type Slot = { key: string; item: DockItem | { kind: 'downloads' } | { kind: 'trash' } | { kind: 'sep' }; pinned: boolean };

export function Dock({ apps, onLaunchpad, hidden, setHovering }: Props) {
  const [s, update] = useSettings();
  const motionPrefs = useMotionPrefs();
  const mouseX = useMotionValue(Infinity);
  const [running, setRunning] = useState<{ exes: string[]; builtins: string[] }>({ exes: [], builtins: [] });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [stack, setStack] = useState(false);
  const ctx = useContextMenu();
  const dialog = useDialog();
  const toast = useToast();
  const appsById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);

  useEffect(() => {
    let alive = true;
    const poll = () => api.invoke<{ exes: string[]; builtins: string[] }>('running').then((r) => alive && setRunning(r)).catch(() => undefined);
    void poll();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 3000);
    const off = api.on('apps:running', (b: string[]) => setRunning((r) => ({ ...r, builtins: b })));
    return () => { alive = false; clearInterval(t); off(); };
  }, []);

  const pinned = s.dockItems;
  const slots: Slot[] = useMemo(() => {
    const out: Slot[] = pinned.map((it, i) => ({ key: `p-${it.kind}-${it.id}-${i}`, item: it, pinned: true }));
    if (s.dockShowRecents) {
      const extra = running.builtins.filter((id) => !pinned.some((p) => p.kind === 'builtin' && p.id === id));
      if (extra.length) {
        out.push({ key: 'sep-r', item: { kind: 'sep' }, pinned: false });
        for (const id of extra) out.push({ key: `r-${id}`, item: { kind: 'builtin', id }, pinned: false });
      }
    }
    out.push({ key: 'sep', item: { kind: 'sep' }, pinned: false });
    out.push({ key: 'downloads', item: { kind: 'downloads' }, pinned: false });
    out.push({ key: 'trash', item: { kind: 'trash' }, pinned: false });
    return out;
  }, [pinned, running.builtins, s.dockShowRecents]);

  const isRunning = (it: DockItem) => it.kind === 'builtin' ? running.builtins.includes(it.id) : !!it.exe && running.exes.includes(it.exe);

  const launch = async (it: DockItem) => {
    if (it.kind === 'builtin') {
      if (it.id === 'launchpad') return onLaunchpad();
      await openApp(it.id);
    } else {
      const r = await api.invoke<{ ok: boolean; error?: string }>('apps:launch', it.target);
      if (!r.ok) toast(`Couldn't open ${it.name}: ${r.error}`, 'error');
    }
  };

  const removeAt = (i: number) => update({ dockItems: pinned.filter((_, j) => j !== i) });

  const menuFor = (slot: Slot, idx: number): MenuItem[] => {
    const it = slot.item;
    if (it.kind === 'trash') return [
      { label: 'Open', onClick: () => void api.invoke('apps:launch', 'shell:RecycleBinFolder') },
      { label: 'Empty Recycle Bin…', danger: true, onClick: async () => { if (await dialog.confirm({ title: 'Empty the Recycle Bin?', message: 'Items in the Recycle Bin will be permanently deleted. This cannot be undone.', confirm: 'Empty', danger: true })) { await api.invoke('recyclebin:empty').catch((e: Error) => toast(e.message, 'error')); toast('Recycle Bin emptied'); } } },
    ];
    if (it.kind === 'downloads') return [{ label: 'Open Downloads', onClick: () => void openApp('finder', { place: 'downloads' }) }];
    if (it.kind === 'sep') return [];
    const items: MenuItem[] = [];
    if (it.kind === 'builtin') {
      const def = builtinById(it.id);
      if (def?.multiWindow) items.push({ label: 'New Window', onClick: () => void openApp(it.id, { newWindow: '1' }) });
      items.push({ label: 'Open', onClick: () => void launch(it) });
    } else {
      items.push({ label: 'Open', onClick: () => void launch(it) });
      items.push({ label: 'Show in Finder', onClick: () => void api.invoke('fs:reveal', it.target) });
    }
    items.push({ separator: true });
    if (slot.pinned) items.push({ label: 'Remove from Dock', onClick: () => removeAt(pinned.indexOf(it as DockItem)) });
    else if (it.kind === 'builtin') items.push({ label: 'Keep in Dock', onClick: () => update({ dockItems: [...pinned, it] }) });
    if (it.kind === 'builtin' && running.builtins.includes(it.id)) items.push({ separator: true }, { label: 'Quit', onClick: () => void api.invoke('app:closeAll', it.id) });
    void idx;
    return items;
  };

  const onDropFiles = async (e: React.DragEvent) => {
    const files = [...e.dataTransfer.files];
    if (!files.length) return false;
    const added: DockItem[] = [];
    for (const f of files) {
      const p = api.pathForFile(f);
      if (!p || !/\.(exe|lnk|url)$/i.test(p)) continue;
      added.push(await api.invoke<DockItem>('dock:resolve', p));
    }
    if (added.length) { void update({ dockItems: [...pinned, ...added] }); toast(`Added ${added.map((a) => (a.kind === 'external' ? a.name : a.id)).join(', ')} to the Dock`); }
    else toast('Drop an application (.exe) or shortcut (.lnk) to add it to the Dock');
    return true;
  };

  const size = s.dockSize;
  const mag = s.dockMagnification && motionPrefs.enabled ? s.dockMagnifyScale : 1;

  return (
    <div className="fixed left-0 right-0 bottom-0 flex justify-center pointer-events-none z-40">
      <motion.div
        data-hit
        className="pointer-events-auto relative mb-[6px]"
        animate={{ y: hidden ? size + 40 : 0, opacity: hidden ? 0.001 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { mouseX.set(Infinity); setHovering(false); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = dragIdx !== null ? 'move' : 'copy'; }}
        onDrop={async (e) => {
          e.preventDefault();
          if (dragIdx === null) { await onDropFiles(e); return; }
          if (overIdx !== null && overIdx !== dragIdx) {
            const next = [...pinned];
            const [m] = next.splice(dragIdx, 1);
            next.splice(Math.min(overIdx, next.length), 0, m);
            void update({ dockItems: next });
          }
          setDragIdx(null); setOverIdx(null);
        }}
      >
        <div className="glass rounded-[22px] flex items-end gap-[6px] px-[7px]" style={{ height: size + 16, paddingBottom: 8, borderRadius: Math.max(16, size * 0.42) }}>
          {slots.map((slot, i) => {
            const it = slot.item;
            if (it.kind === 'sep') return <div key={slot.key} className="self-center w-px mx-[3px]" style={{ height: size * 0.75, background: 'rgb(var(--fg) / .22)' }} />;
            const pinnedIdx = slot.pinned ? i : null;
            let label = '', icon: React.ReactNode = null, runningNow = false;
            if (it.kind === 'downloads') { label = 'Downloads'; icon = <StackIcon />; }
            else if (it.kind === 'trash') { label = 'Recycle Bin'; icon = <TrashIcon />; }
            else if (it.kind === 'builtin') { label = builtinById(it.id)?.name || it.id; icon = <BuiltinIcon id={it.id} size={Math.round(size * mag)} />; runningNow = isRunning(it); }
            else { const a = appsById.get(it.id); label = it.name; icon = <ExternalIcon icon={a?.icon} name={it.name} size={Math.round(size * mag)} />; runningNow = isRunning(it); }
            return (
              <DockIcon key={slot.key} mouseX={mouseX} size={size} mag={mag} label={label} running={runningNow}
                dragging={dragIdx === pinnedIdx && pinnedIdx !== null} dropBefore={overIdx === pinnedIdx && dragIdx !== null && dragIdx !== pinnedIdx}
                draggable={slot.pinned}
                onDragStart={() => pinnedIdx !== null && setDragIdx(pinnedIdx)}
                onDragEnter={() => { if (dragIdx !== null) setOverIdx(pinnedIdx ?? pinned.length); }}
                onDragEnd={(e) => {
                  // Dragged well above the Dock and released → remove (like macOS)
                  if (dragIdx !== null && e.clientY < window.innerHeight - size - 90 && slot.pinned) removeAt(dragIdx);
                  setDragIdx(null); setOverIdx(null);
                }}
                onClick={() => {
                  if (it.kind === 'downloads') return setStack((v) => !v);
                  if (it.kind === 'trash') return void api.invoke('apps:launch', 'shell:RecycleBinFolder');
                  return launch(it as DockItem);
                }}
                onContextMenu={(e) => ctx(e, menuFor(slot, i))}
              >{icon}</DockIcon>
            );
          })}
        </div>
        <AnimatePresence>{stack && <DownloadsStack onClose={() => setStack(false)} />}</AnimatePresence>
      </motion.div>
    </div>
  );
}

function DockIcon({ mouseX, size, mag, label, running, children, onClick, onContextMenu, draggable, onDragStart, onDragEnter, onDragEnd, dragging, dropBefore }: {
  mouseX: MotionValue<number>; size: number; mag: number; label: string; running: boolean; children: React.ReactNode;
  onClick: () => void | Promise<void>; onContextMenu: (e: React.MouseEvent) => void; draggable: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: (e: React.DragEvent) => void; dragging: boolean; dropBefore: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const bounce = useAnimationControls();
  const dist = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const range = size * 2.6;
  const target = useTransform(dist, (d) => {
    if (!Number.isFinite(d)) return size;
    const t = Math.max(0, 1 - Math.abs(d) / range);
    return size + size * (mag - 1) * (Math.cos((1 - t) * Math.PI) * 0.5 + 0.5) * (t > 0 ? 1 : 0);
  });
  const w = useFmSpring(target, { stiffness: 520, damping: 36, mass: 0.35 });
  const maxS = Math.round(size * mag);
  const scale = useTransform(w, (v) => v / maxS);
  return (
    <motion.div ref={ref} style={{ width: w, height: w, opacity: dragging ? 0.35 : 1 }}
      className="relative flex flex-col items-center justify-end shrink-0"
      draggable={draggable}
      onDragStart={(e) => { (e as unknown as React.DragEvent).dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnter={onDragEnter}
      onDragEnd={(e) => onDragEnd(e as unknown as React.DragEvent)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onContextMenu={onContextMenu}
    >
      {dropBefore && <div className="absolute -left-[5px] top-1 bottom-1 w-[3px] rounded-full bg-[rgb(var(--accent))]" />}
      <AnimatePresence>
        {hover && !dragging && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="absolute -top-[38px] glass-strong px-[10px] py-[3px] rounded-md text-[13px] whitespace-nowrap pointer-events-none">{label}</motion.div>
        )}
      </AnimatePresence>
      <motion.button animate={bounce} className="absolute inset-0 active:brightness-75 transition-[filter]"
        onClick={async () => { void bounce.start({ y: [0, -size * 0.45, 0, -size * 0.22, 0], transition: { duration: 0.9, ease: 'easeOut' } }); await onClick(); }}>
        <motion.div className="absolute bottom-0 left-1/2" style={{ width: maxS, height: maxS, x: '-50%', scale, transformOrigin: '50% 100%' }}>{children}</motion.div>
      </motion.button>
      <div className="absolute -bottom-[6px] w-[4px] h-[4px] rounded-full transition-opacity" style={{ background: 'rgb(var(--fg) / .85)', opacity: running ? 1 : 0 }} />
    </motion.div>
  );
}

function StackIcon() {
  return (
    <div className="w-full h-full rounded-[23.5%] flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#7cc4ff,#2f7cf6)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 2px 6px rgba(0,0,0,.25)' }}>
      <Download className="w-1/2 h-1/2 text-white" strokeWidth={2.2} />
    </div>
  );
}
function TrashIcon() {
  return (
    <div className="w-full h-full rounded-[23.5%] flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#e6e8ec,#a9afb8)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.6), 0 2px 6px rgba(0,0,0,.25)' }}>
      <Trash2 className="w-1/2 h-1/2 text-[#3d4350]" strokeWidth={1.9} />
    </div>
  );
}

function DownloadsStack({ onClose }: { onClose: () => void }) {
  const special = useInvoke<{ downloads: string }>('fs:special');
  const [files, setFiles] = useState<FileEntry[]>([]);
  useEffect(() => {
    if (!special.data?.downloads) return;
    void api.invoke<FileEntry[]>('fs:list', special.data.downloads).then((l) => setFiles(l.sort((a, b) => b.mtime - a.mtime).slice(0, 12))).catch(() => undefined);
  }, [special.data]);
  useEffect(() => { const t = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-stack]')) onClose(); }; window.addEventListener('mousedown', t); return () => window.removeEventListener('mousedown', t); }, [onClose]);
  return (
    <motion.div data-stack data-hit initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }}
      className="absolute bottom-[calc(100%+12px)] right-0 glass-strong rounded-2xl p-3 w-[380px]">
      <div className="flex items-center justify-between px-1 pb-2"><div className="font-semibold">Downloads</div>
        <button className="btn text-[12px] py-[2px]" onClick={() => { onClose(); void openApp('finder', { place: 'downloads' }); }}><FolderOpen size={13} /> Open in Finder</button></div>
      {files.length === 0 ? <div className="muted p-4 text-center">No recent downloads</div> : (
        <div className="grid grid-cols-4 gap-2">
          {files.map((f) => (
            <button key={f.path} className="flex flex-col items-center gap-1 p-2 rounded-xl hoverable" onClick={() => { onClose(); void api.invoke('fs:open', f.path); }} title={f.name}>
              <img src={thumbUrl(f.path, 96)} className="w-12 h-12 object-contain" alt="" />
              <div className="text-[11px] truncate w-full text-center">{f.name}</div>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export const allLaunchable = BUILTIN_APPS;
