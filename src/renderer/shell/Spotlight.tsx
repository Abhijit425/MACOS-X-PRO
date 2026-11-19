import { useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Search, Calculator as CalcIcon, Settings2, FileText, Folder, Zap, Clock, ArrowRightLeft, Lock, Moon, Camera, Trash2, Monitor, StickyNote, Sun, Power } from 'lucide-react';
import { BUILTIN_APPS } from '@shared/apps';
import type { AppEntry, FileEntry } from '@shared/types';
import { api, openApp, thumbUrl } from '../lib/api';
import { tryConvert, tryMath } from '../lib/calc';
import { basename, dirname } from '../lib/format';
import { BuiltinIcon, ExternalIcon } from '../components/AppIcon';
import { useSettings } from '../lib/hooks';

interface Result { id: string; group: string; title: string; sub?: string; icon: ReactNode; run: () => void | Promise<unknown>; reveal?: () => void; preview?: ReactNode; score: number }

const WIN_SETTINGS: [string, string, string[]][] = [
  ['display', 'Display', ['screen', 'resolution', 'scale', 'brightness', 'monitor']], ['sound', 'Sound', ['audio', 'volume', 'speaker', 'microphone']],
  ['nightlight', 'Night light', ['blue light', 'warm']], ['bluetooth', 'Bluetooth & devices', ['pair', 'headphones']], ['wifi', 'Wi-Fi', ['wireless', 'network', 'internet']],
  ['battery', 'Battery & power', ['power', 'energy saver']], ['notifications', 'Notifications (Windows)', ['alerts', 'toasts']], ['focus', 'Focus / Do not disturb', ['quiet', 'dnd']],
  ['background', 'Windows background', ['wallpaper']], ['colors', 'Windows colors', ['dark mode', 'accent', 'theme']], ['apps', 'Installed apps', ['uninstall', 'programs']],
  ['startup', 'Startup apps', ['boot', 'login']], ['storage', 'Storage', ['disk', 'cleanup', 'space']], ['about', 'About this PC', ['specs', 'system info']],
  ['update', 'Windows Update', ['updates', 'patch']], ['privacy', 'Privacy & security', ['permissions']], ['mouse', 'Mouse & touchpad', ['trackpad', 'cursor']],
  ['keyboard', 'Typing', ['keyboard']], ['datetime', 'Date & time', ['clock', 'timezone']], ['defaultapps', 'Default apps', ['open with']], ['printers', 'Printers & scanners', ['print']],
];
const OUR_SETTINGS: [string, string, string[]][] = [
  ['appearance', 'Appearance', ['theme', 'dark', 'light', 'accent', 'transparency']], ['wallpapers', 'Wallpapers', ['background', 'desktop picture']], ['dock', 'Dock', ['magnification', 'autohide', 'icons']],
  ['desktop', 'Desktop & Menu Bar', ['overlay', 'immersive', 'menu bar']], ['widgets', 'Widgets', ['clock', 'weather widget']], ['notifications', 'Notifications', ['focus', 'banners']],
  ['shortcuts', 'Keyboard Shortcuts', ['hotkeys', 'spotlight shortcut']], ['startup', 'Startup', ['launch at login']], ['performance', 'Performance', ['animations', 'cpu', 'polling']],
  ['privacy', 'Privacy', ['clipboard', 'index']], ['about', 'About MACOS X PRO', ['version']],
];

function score(text: string, q: string, extra: string[] = []) {
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  if (extra.some((e) => e.includes(q))) return 30;
  const initials = t.split(/\s+/).map((w) => w[0]).join('');
  if (initials.startsWith(q)) return 35;
  return 0;
}

export function Spotlight({ apps, onClose, onLaunchpad }: { apps: AppEntry[]; onClose: () => void; onLaunchpad: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [files, setFiles] = useState<{ name: string; path: string; isDir: boolean }[]>([]);
  const [recent, setRecent] = useState<FileEntry[]>([]);
  const [s, update] = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);
  useEffect(() => { if (s.recentFilesInSpotlight) void api.invoke<FileEntry[]>('fs:recent').then((r) => setRecent(r.slice(0, 8))).catch(() => undefined); }, [s.recentFilesInSpotlight]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setFiles([]); return; }
    const t = setTimeout(() => { void api.invoke<typeof files>('fs:search', query, 30).then(setFiles).catch(() => setFiles([])); }, 140);
    return () => clearTimeout(t);
  }, [q]);

  const close = (fn?: () => unknown) => () => { onClose(); void fn?.(); };

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Result[] = [];
    if (!query) {
      for (const f of recent) out.push({ id: `r-${f.path}`, group: 'Recent Documents', title: f.name, sub: dirname(f.path), icon: <img src={thumbUrl(f.path, 64)} className="w-6 h-6 object-contain" alt="" />, run: close(() => api.invoke('fs:open', f.path)), reveal: close(() => api.invoke('fs:reveal', f.path)), score: 1, preview: <FilePreview path={f.path} isDir={f.isDir} /> });
      return out;
    }
    const math = tryMath(q);
    if (math !== null) out.push({ id: 'calc', group: 'Calculator', title: `= ${math}`, sub: `${q.trim()} · press Enter to copy`, icon: <CalcIcon size={20} />, run: close(() => api.invoke('clipboard:writeText', math.replace(/,/g, ''))), score: 1000 });
    const conv = tryConvert(q);
    if (conv) out.push({ id: 'conv', group: 'Conversion', title: conv.result, sub: `${conv.detail} · press Enter to copy`, icon: <ArrowRightLeft size={20} />, run: close(() => api.invoke('clipboard:writeText', conv.result)), score: 1000 });

    for (const a of BUILTIN_APPS) {
      const sc = score(a.name, query, a.keywords || []);
      if (sc) out.push({ id: `b-${a.id}`, group: 'Applications', title: a.name, sub: 'MACOS X PRO', icon: <BuiltinIcon id={a.id} size={26} />, run: close(() => openApp(a.id)), score: sc + 5, preview: <AppPreview icon={<BuiltinIcon id={a.id} size={96} />} name={a.name} sub={a.category} /> });
    }
    if (score('launchpad', query)) out.push({ id: 'lp', group: 'Applications', title: 'Launchpad', icon: <BuiltinIcon id="launchpad" size={26} />, run: () => { onClose(); onLaunchpad(); }, score: score('launchpad', query) });
    for (const a of apps) {
      const sc = score(a.name, query);
      if (sc) out.push({ id: `a-${a.id}`, group: 'Applications', title: a.name, sub: a.category, icon: <ExternalIcon icon={a.icon} name={a.name} size={26} />, run: close(() => api.invoke('apps:launch', a.target)), reveal: a.kind === 'lnk' ? close(() => api.invoke('fs:reveal', a.target)) : undefined, score: sc, preview: <AppPreview icon={<ExternalIcon icon={a.icon} name={a.name} size={96} />} name={a.name} sub={a.category} /> });
    }
    const actions: [string, string[], ReactNode, () => unknown][] = [
      ['Lock Screen', ['lock'], <Lock size={18} />, () => api.invoke('power', 'lock')],
      ['Take Screenshot', ['screenshot', 'capture', 'print screen'], <Camera size={18} />, () => setTimeout(() => api.invoke('shot:full'), 350)],
      ['Capture Selected Area', ['screenshot region', 'snip'], <Camera size={18} />, () => setTimeout(() => api.invoke('shot:region'), 350)],
      [`Turn ${s.theme === 'dark' ? 'Light' : 'Dark'} Mode On`, ['dark mode', 'light mode', 'theme'], s.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />, () => update({ theme: s.theme === 'dark' ? 'light' : 'dark' })],
      [`Turn Focus ${s.focusMode ? 'Off' : 'On'}`, ['focus', 'do not disturb', 'dnd'], <Moon size={18} />, () => update({ focusMode: !s.focusMode })],
      ['Show Desktop', ['desktop', 'minimize all'], <Monitor size={18} />, () => api.invoke('keys:showDesktop')],
      ['New Note', ['note', 'write'], <StickyNote size={18} />, () => openApp('notes', { new: '1' })],
      ['Empty Recycle Bin', ['trash', 'recycle'], <Trash2 size={18} />, () => openApp('finder', { place: 'trash-confirm' })],
      ['Sleep', ['suspend'], <Power size={18} />, () => api.invoke('power', 'sleep')],
    ];
    for (const [title, kw, icon, fn] of actions) {
      const sc = score(title, query, kw);
      if (sc) out.push({ id: `q-${title}`, group: 'Quick Actions', title, icon: <span className="text-[rgb(var(--accent))]">{icon}</span>, run: close(fn), score: sc - 5 });
    }
    for (const [id, name, kw] of OUR_SETTINGS) {
      const sc = score(name, query, kw);
      if (sc) out.push({ id: `os-${id}`, group: 'System Settings', title: name, sub: 'MACOS X PRO Settings', icon: <Settings2 size={18} />, run: close(() => openApp('settings', { section: id })), score: sc - 10 });
    }
    for (const [id, name, kw] of WIN_SETTINGS) {
      const sc = score(name, query, kw);
      if (sc) out.push({ id: `ws-${id}`, group: 'System Settings', title: name, sub: 'Windows Settings', icon: <Settings2 size={18} />, run: close(() => api.invoke('winsettings:open', id)), score: sc - 12 });
    }
    for (const f of files) {
      out.push({ id: `f-${f.path}`, group: f.isDir ? 'Folders' : 'Documents', title: f.name, sub: dirname(f.path), icon: f.isDir ? <Folder size={20} className="text-[#3aa0ff]" fill="#3aa0ff55" /> : <img src={thumbUrl(f.path, 64)} className="w-6 h-6 object-contain" alt="" />,
        run: close(() => (f.isDir ? openApp('finder', { path: f.path }) : api.invoke('fs:open', f.path))), reveal: close(() => api.invoke('fs:reveal', f.path)), score: score(f.name, query) - 20, preview: <FilePreview path={f.path} isDir={f.isDir} /> });
    }
    out.sort((a, b) => b.score - a.score);
    // Top hit first, then grouped
    if (!out.length) return out;
    const top = { ...out[0], group: 'Top Hit' };
    const groups = ['Calculator', 'Conversion', 'Applications', 'Quick Actions', 'System Settings', 'Documents', 'Folders'];
    const rest = groups.flatMap((g) => out.slice(1).filter((r) => r.group === g).slice(0, g === 'Documents' ? 8 : 6));
    return [top, ...rest];
  }, [q, apps, files, recent, s.theme, s.focusMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(results.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[sel]; if (!r) return; if (e.ctrlKey && r.reveal) r.reveal(); else void r.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); if (q) setQ(''); else onClose(); }
  };

  const current = results[sel];
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50" data-hit onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -6 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        className="absolute left-1/2 top-[16%] -translate-x-1/2 w-[720px] max-w-[92vw] glass-strong rounded-[18px] overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-[56px]">
          <Search size={22} className="opacity-50" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Spotlight Search"
            className="flex-1 bg-transparent outline-none text-[22px] font-light placeholder:opacity-40" spellCheck={false} />
          {q && <span className="kbd">↵ open · Ctrl+↵ reveal</span>}
        </div>
        {results.length > 0 && (
          <div className="flex border-t border-[rgb(var(--stroke)/var(--stroke-a))]" style={{ height: 380 }}>
            <div ref={listRef} className="w-[52%] overflow-y-auto py-1">
              {results.map((r, i) => {
                const header = r.group !== lastGroup ? (lastGroup = r.group) : null;
                return (
                  <div key={r.id + i}>
                    {header && <div className="px-4 pt-2 pb-1 text-[11px] font-semibold muted">{header}</div>}
                    <button data-idx={i} onMouseMove={() => setSel(i)} onClick={() => void r.run()}
                      className={`w-[calc(100%-12px)] mx-[6px] flex items-center gap-3 px-3 py-[5px] rounded-lg text-left ${i === sel ? 'bg-[rgb(var(--accent))] text-white' : ''}`}>
                      <span className="w-7 h-7 flex items-center justify-center shrink-0">{r.icon}</span>
                      <span className="min-w-0 flex-1"><div className="truncate">{r.title}</div>{r.sub && <div className={`truncate text-[11px] ${i === sel ? 'text-white/75' : 'muted'}`}>{r.sub}</div>}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 border-l border-[rgb(var(--stroke)/var(--stroke-a))] p-5 flex flex-col items-center justify-center text-center overflow-hidden">
              {current?.preview || <div className="flex flex-col items-center gap-3"><div className="scale-[2.2] my-6 opacity-90">{current?.icon}</div><div className="text-[17px] font-semibold">{current?.title}</div><div className="muted text-[12px]">{current?.sub}</div></div>}
            </div>
          </div>
        )}
        {q.trim() && results.length === 0 && <div className="px-5 py-6 muted border-t border-[rgb(var(--stroke)/var(--stroke-a))]">No results for “{q}”</div>}
        {!q && results.length === 0 && (
          <div className="px-5 py-3 muted text-[12px] border-t border-[rgb(var(--stroke)/var(--stroke-a))] flex gap-4"><span><Zap size={12} className="inline" /> Try “12*7”, “10 km to mi”, “dark mode”, an app or a file name</span><span className="ml-auto"><Clock size={12} className="inline" /> Recent files appear here</span></div>
        )}
      </motion.div>
    </div>
  );
}

function AppPreview({ icon, name, sub }: { icon: ReactNode; name: string; sub?: string }) {
  return <div className="flex flex-col items-center gap-3">{icon}<div className="text-[17px] font-semibold">{name}</div>{sub && <div className="muted text-[12px]">{sub}</div>}<div className="muted text-[11px]">Press Enter to open</div></div>;
}

function FilePreview({ path, isDir }: { path: string; isDir: boolean }) {
  const [info, setInfo] = useState<FileEntry | null>(null);
  useEffect(() => { void api.invoke<FileEntry>('fs:stat', path).then(setInfo).catch(() => setInfo(null)); }, [path]);
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {isDir ? <Folder size={96} className="text-[#3aa0ff]" fill="#3aa0ff44" strokeWidth={1} /> : <img src={thumbUrl(path, 256)} className="max-w-[220px] max-h-[170px] object-contain rounded-md shadow" alt="" />}
      <div className="text-[15px] font-semibold break-all line-clamp-2">{basename(path)}</div>
      {info && <div className="muted text-[11px] leading-relaxed">{!isDir && <>{(info.size / 1024 / 1024).toFixed(2)} MB · </>}Modified {new Date(info.mtime).toLocaleString()}<br /><span className="break-all">{dirname(path)}</span></div>}
      {!isDir && <div className="muted text-[11px] flex items-center gap-1"><FileText size={11} /> Enter to open · Ctrl+Enter to reveal</div>}
    </div>
  );
}
