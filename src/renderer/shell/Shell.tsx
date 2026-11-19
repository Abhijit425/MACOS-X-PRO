import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Power, RotateCcw, Moon, LogOut, Lock, Volume2, VolumeX, Battery } from 'lucide-react';
import type { AppEntry, ControlState, FileEntry, NotificationItem } from '@shared/types';
import { builtinById } from '@shared/apps';
import { api } from '../lib/api';
import { useClickThrough, useEvent, useMetrics, useSettings } from '../lib/hooks';
import { MenuList, Slider } from '../components/ui';
import { Dock } from './Dock';
import { Spotlight } from './Spotlight';
import { Launchpad } from './Launchpad';
import { ControlCentre } from './ControlCentre';
import { NotificationCentre, Banner } from './NotificationCentre';
import { buildMenu } from './menus';

type Open = { kind: string; x: number; payload?: string } | null;
const FOCUS_KINDS = new Set(['spotlight', 'launchpad']);

export default function Shell() {
  const [s, update] = useSettings();
  const [open, setOpen] = useState<Open>(null);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [banners, setBanners] = useState<NotificationItem[]>([]);
  const [recent, setRecent] = useState<FileEntry[]>([]);
  const [appWindows, setAppWindows] = useState<{ app: string; windows: { id: number; title: string }[] }[]>([]);
  const [dockHover, setDockHover] = useState(false);
  const [dockRevealed, setDockRevealed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useClickThrough('shell:hit', open !== null);

  useEffect(() => {
    void api.invoke<AppEntry[]>('apps:list').then((a) => { setApps(a); if (!a.length) { setScanning(true); void api.invoke<AppEntry[]>('apps:scan').then(setApps).finally(() => setScanning(false)); } }).catch(() => undefined);
    return api.on('apps:changed', (a: AppEntry[]) => setApps(a));
  }, []);

  // Tell main to capture the mouse (and keyboard for typing surfaces) while something is open
  useEffect(() => {
    void api.invoke('shell:capture', open !== null, open ? FOCUS_KINDS.has(open.kind) : false).catch(() => undefined);
    void api.invoke('menubar:send', 'menubar:state', open ? (open.kind === 'menu' ? `menu:${open.payload}` : open.kind) : null).catch(() => undefined);
  }, [open?.kind, open?.payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((kind: string, x = window.innerWidth - 20, payload?: string) => {
    setOpen((cur) => (cur && cur.kind === kind && cur.payload === payload ? null : { kind, x, payload }));
  }, []);
  const close = useCallback(() => setOpen(null), []);

  useEvent<string>('shell:open', (kind) => toggle(kind));
  useEvent<{ kind: string; x: number; payload?: string; hover?: boolean }>('popover:open', (p) => {
    if (p.hover) { setOpen((cur) => (cur && cur.kind === 'menu' ? { kind: p.kind, x: p.x, payload: p.payload } : cur)); return; }
    if (p.kind === 'menu') {
      void api.invoke<FileEntry[]>('fs:recent').then((r) => setRecent(r)).catch(() => undefined);
      void Promise.all(['finder', 'notes', 'calendar', 'weather', 'clock', 'music', 'photos', 'screenshot', 'clipboard', 'monitor', 'taskmanager', 'wallpapers', 'settings', 'calculator'].map(async (id) => ({ app: builtinById(id)?.name || id, windows: await api.invoke<{ id: number; title: string }[]>('app:windows', id).catch(() => []) }))).then((l) => setAppWindows(l.filter((x) => x.windows.length)));
    }
    toggle(p.kind, p.x, p.payload);
  });
  useEvent<NotificationItem>('notification:banner', (n) => setBanners((b) => [n, ...b].slice(0, 4)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Dock auto-hide: reveal when the pointer touches the bottom edge
  useEffect(() => {
    if (!s.dockAutoHide) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY >= window.innerHeight - 4) { clearTimeout(hideTimer.current); setDockRevealed(true); }
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [s.dockAutoHide]);
  useEffect(() => {
    if (!s.dockAutoHide || dockHover) { clearTimeout(hideTimer.current); return; }
    hideTimer.current = setTimeout(() => setDockRevealed(false), 700);
    return () => clearTimeout(hideTimer.current);
  }, [dockHover, s.dockAutoHide, dockRevealed]);

  const power = (action: 'sleep' | 'restart' | 'shutdown' | 'logout' | 'lock') => {
    if (action === 'lock' || action === 'sleep') { close(); void api.invoke('power', action); return; }
    setOpen({ kind: 'power', x: 0, payload: action });
  };

  const rescan = () => { setScanning(true); void api.invoke<AppEntry[]>('apps:scan').then(setApps).finally(() => setScanning(false)); };
  const dockHidden = s.dockAutoHide && !dockRevealed && !dockHover && open?.kind !== 'launchpad';

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Backdrop that closes menus/popovers when clicking elsewhere */}
      {open && !['spotlight', 'launchpad'].includes(open.kind) && <div className="fixed inset-0 z-40" data-hit onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />}

      <AnimatePresence>
        {open?.kind === 'launchpad' && <Launchpad key="lp" apps={apps} onClose={close} scanning={scanning} rescan={rescan} />}
      </AnimatePresence>

      <Dock apps={apps} hidden={dockHidden} setHovering={setDockHover} onLaunchpad={() => toggle('launchpad')} />

      <AnimatePresence>
        {open?.kind === 'spotlight' && <Spotlight key="sp" apps={apps} onClose={close} onLaunchpad={() => setOpen({ kind: 'launchpad', x: 0 })} />}
        {open?.kind === 'control' && <ControlCentre key="cc" x={open.x} onClose={close} />}
        {open?.kind === 'notifications' && <NotificationCentre key="nc" onClose={close} />}
        {open?.kind === 'volume' && <VolumePopover key="vol" x={open.x} />}
        {open?.kind === 'battery' && <BatteryPopover key="bat" x={open.x} onClose={close} />}
        {open?.kind === 'menu' && open.payload && (
          <motion.div key={`m-${open.payload}`} data-hit className="fixed top-[2px] z-50" style={{ left: Math.min(open.x, window.innerWidth - 260) }}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
            <MenuList items={buildMenu(open.payload, { settings: s, update: (p) => void update(p), recent, openPanel: (k) => setOpen({ kind: k, x: 0 }), power, appWindows })} onClose={close} />
          </motion.div>
        )}
        {open?.kind === 'power' && <PowerConfirm key="pw" action={open.payload as 'restart' | 'shutdown' | 'logout'} onClose={close} />}
      </AnimatePresence>

      <div className="fixed top-[8px] right-[10px] z-50 flex flex-col gap-2">
        <AnimatePresence>{banners.map((n) => <Banner key={n.id} n={n} onClose={() => setBanners((b) => b.filter((x) => x.id !== n.id))} />)}</AnimatePresence>
      </div>
    </div>
  );
}

function VolumePopover({ x }: { x: number }) {
  const [v, setV] = useState<ControlState['volume'] | null>(null);
  const [level, setLevel] = useState(0);
  useEffect(() => { void api.invoke<ControlState>('controls:state').then((c) => { setV(c.volume); setLevel(c.volume.level); }); }, []);
  return (
    <motion.div data-hit initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed top-[6px] z-50 glass-strong rounded-2xl p-3 w-[280px]" style={{ left: Math.min(window.innerWidth - 290, x - 140) }}>
      <div className="text-[12px] font-semibold mb-2">Sound</div>
      {v?.supported ? (
        <div className="flex items-center gap-2">
          <button className="icon-btn" onClick={() => void api.invoke<ControlState['volume']>('mute:set', !v.muted).then(setV)}>{v.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
          <Slider className="flex-1" value={level} onChange={(n) => { setLevel(n); void api.invoke('volume:set', n); }} onCommit={(n) => void api.invoke<ControlState['volume']>('volume:set', n).then(setV)} />
        </div>
      ) : <div className="muted text-[12px]">{v ? 'No audio output device' : 'Loading…'}</div>}
      <div className="h-px my-2 bg-[rgb(var(--fg)/.1)]" />
      <button className="w-full text-left text-[12.5px] px-1 py-1 rounded hoverable" onClick={() => void api.invoke('winsettings:open', 'sound')}>Sound Settings…</button>
    </motion.div>
  );
}

function BatteryPopover({ x, onClose }: { x: number; onClose: () => void }) {
  const m = useMetrics();
  const b = m?.battery;
  return (
    <motion.div data-hit initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed top-[6px] z-50 glass-strong rounded-2xl p-3 w-[280px]" style={{ left: Math.min(window.innerWidth - 290, x - 140) }}>
      <div className="flex items-center justify-between mb-1"><span className="text-[13px] font-semibold">Battery</span><span className="tabular-nums">{b?.hasBattery ? `${Math.round(b.percent)}%` : '—'}</span></div>
      <div className="text-[12px] muted leading-relaxed">
        {b?.hasBattery ? (<>
          <div>Power source: {b.acConnected ? 'Power adapter' : 'Battery'}{b.charging ? ' (charging)' : ''}</div>
          {b.timeRemaining && !b.acConnected && <div>Time remaining: {Math.floor(b.timeRemaining / 60)}h {b.timeRemaining % 60}m</div>}
          {b.health !== null && <div>Battery health: {b.health}% of design capacity</div>}
          {b.cycleCount ? <div>Cycle count: {b.cycleCount}</div> : null}
        </>) : 'This PC has no battery.'}
      </div>
      <div className="h-px my-2 bg-[rgb(var(--fg)/.1)]" />
      <button className="w-full text-left text-[12.5px] px-1 py-1 rounded hoverable flex items-center gap-2" onClick={() => { onClose(); void api.invoke('winsettings:open', 'battery'); }}><Battery size={13} /> Battery Settings…</button>
    </motion.div>
  );
}

function PowerConfirm({ action, onClose }: { action: 'restart' | 'shutdown' | 'logout'; onClose: () => void }) {
  const meta = { restart: ['Restart your computer now?', 'Restart', <RotateCcw key="r" size={30} />], shutdown: ['Shut down your computer now?', 'Shut Down', <Power key="p" size={30} />], logout: ['Sign out of Windows now?', 'Log Out', <LogOut key="l" size={30} />] }[action];
  const go = () => { onClose(); void api.invoke('power', action); };
  return (
    <motion.div data-hit className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="glass-strong rounded-2xl p-6 w-[330px] text-center">
        <div className="flex justify-center mb-3 opacity-80">{meta[2]}</div>
        <div className="font-semibold">{meta[0] as string}</div>
        <div className="text-[12px] muted mt-1">Save your work first — unsaved changes in open apps may be lost.</div>
        <div className="flex gap-2 mt-4"><button className="btn flex-1" onClick={onClose}>Cancel</button><button className="btn btn-danger flex-1" onClick={go}>{meta[1] as string}</button></div>
      </motion.div>
    </motion.div>
  );
}
export { Moon, Lock };
