import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon, FolderPlus, Search, Clock, Monitor, FileText, Download, Image as ImageIcon, Music, Video, Home, HardDrive,
  Trash2, Folder, Plus, X, PanelRight, ArrowUpDown, Eye, Usb,
} from 'lucide-react';
import type { DriveInfo, FileEntry, Settings } from '@shared/types';
import { Window } from '../components/Window';
import { api, fileUrl, thumbUrl } from '../lib/api';
import { useEvent, useSettings } from '../lib/hooks';
import { basename, bytes, dateShort, dirname, isAudio, isImage, isText, isVideo, joinPath, kindOf } from '../lib/format';
import { Empty, Spinner, useContextMenu, useDialog, useToast, MenuItem } from '../components/ui';

type Special = { home: string; desktop: string; documents: string; downloads: string; pictures: string; videos: string; music: string };
type Loc = { kind: 'dir'; path: string } | { kind: 'recents' } | { kind: 'computer' } | { kind: 'search'; root: string; q: string };
interface Tab { id: string; history: Loc[]; idx: number }
type SortKey = 'name' | 'mtime' | 'size' | 'kind';
const newId = () => Math.random().toString(36).slice(2, 9);
const locTitle = (l: Loc) => (l.kind === 'dir' ? basename(l.path) || l.path : l.kind === 'recents' ? 'Recents' : l.kind === 'computer' ? 'This PC' : `Searching “${l.q}”`);
const KIND_FILTERS: [string, string, (e: FileEntry) => boolean][] = [['all', 'All', () => true], ['folders', 'Folders', (e) => e.isDir], ['images', 'Images', (e) => isImage(e.ext)], ['docs', 'Documents', (e) => /^(pdf|docx?|xlsx?|pptx?|txt|md|rtf|odt|csv)$/.test(e.ext)], ['audio', 'Audio', (e) => isAudio(e.ext)], ['video', 'Video', (e) => isVideo(e.ext)]];

function readClip(): { op: 'copy' | 'cut'; paths: string[] } | null { try { return JSON.parse(localStorage.getItem('finder:clip') || 'null'); } catch { return null; } }
function writeClip(c: { op: 'copy' | 'cut'; paths: string[] } | null) { localStorage.setItem('finder:clip', JSON.stringify(c)); }

export default function Finder() {
  const [s, update] = useSettings();
  const [special, setSpecial] = useState<Special | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState('');
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'name', dir: 1 });
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState(false);
  const [quick, setQuick] = useState<FileEntry | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ctx = useContextMenu();
  const dialog = useDialog();
  const toast = useToast();

  const tab = tabs.find((t) => t.id === active);
  const loc = tab ? tab.history[tab.idx] : null;
  const curDir = loc?.kind === 'dir' ? loc.path : loc?.kind === 'search' ? loc.root : null;

  const go = useCallback((l: Loc, newTab = false) => {
    if (newTab || !tabs.length) { const t = { id: newId(), history: [l], idx: 0 }; setTabs((x) => [...x, t]); setActive(t.id); return; }
    setTabs((x) => x.map((t) => (t.id === active ? { ...t, history: [...t.history.slice(0, t.idx + 1), l], idx: t.idx + 1 } : t)));
  }, [tabs.length, active]);

  const placeLoc = useCallback((place: string, sp: Special): Loc => {
    if (place === 'recents') return { kind: 'recents' };
    if (place === 'computer') return { kind: 'computer' };
    return { kind: 'dir', path: (sp as Record<string, string>)[place] || sp.home };
  }, []);

  const handleArgs = useCallback(async (a: Record<string, string>, sp: Special, fresh: boolean) => {
    if (a['trash-confirm']) {
      if (await dialog.confirm({ title: 'Empty the Recycle Bin?', message: 'All items in the Recycle Bin will be permanently deleted.', confirm: 'Empty Recycle Bin', danger: true })) { await api.invoke('recyclebin:empty'); toast('Recycle Bin emptied'); }
    }
    if (a.goto) {
      const p = await dialog.prompt({ title: 'Go to Folder', input: sp.home });
      if (p) go({ kind: 'dir', path: p }, fresh);
      return;
    }
    const l: Loc = a.path ? { kind: 'dir', path: a.path } : placeLoc(a.place || 'home', sp);
    go(l, fresh);
    if (a.select) setTimeout(() => setSel([a.select]), 300);
  }, [dialog, go, placeLoc, toast]);

  useEffect(() => {
    void (async () => {
      const sp = await api.invoke<Special>('fs:special');
      setSpecial(sp);
      void api.invoke<DriveInfo[]>('fs:drives').then(setDrives);
      const a = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
      const l: Loc = a.path ? { kind: 'dir', path: a.path } : placeLoc(a.place || 'home', sp);
      const t = { id: newId(), history: [l], idx: 0 };
      setTabs([t]); setActive(t.id);
      if (a.select) setTimeout(() => setSel([a.select]), 400);
      if (a.goto || a['trash-confirm']) void handleArgs({ goto: a.goto, 'trash-confirm': a['trash-confirm'] } as Record<string, string>, sp, false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEvent<Record<string, string>>('app:args', (a) => { if (special) void handleArgs(a, special, true); });

  const load = useCallback(async () => {
    if (!loc) return;
    setError(null);
    try {
      if (loc.kind === 'dir') setEntries(await api.invoke<FileEntry[]>('fs:list', loc.path));
      else if (loc.kind === 'recents') setEntries(await api.invoke<FileEntry[]>('fs:recent'));
      else if (loc.kind === 'computer') { setDrives(await api.invoke<DriveInfo[]>('fs:drives')); setEntries([]); }
      else {
        setEntries(null);
        const hits = await api.invoke<{ path: string }[]>('fs:search', loc.q, 300, loc.root);
        const stats = await Promise.all(hits.map((h) => api.invoke<FileEntry>('fs:stat', h.path).catch(() => null)));
        setEntries(stats.filter(Boolean) as FileEntry[]);
      }
    } catch (e) { setEntries([]); setError((e as Error).message); }
  }, [loc]);
  useEffect(() => { setEntries(null); setSel([]); void load(); }, [load]);
  useEffect(() => { if (loc?.kind !== 'dir') return; void api.invoke('fs:watch', loc.path); const p = loc.path; return () => { void api.invoke('fs:unwatch', p); }; }, [loc]);
  useEvent<string>('fs:changed', (d) => { if (loc?.kind === 'dir' && d === loc.path) void load(); });
  useEffect(() => { const f = () => void load(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f); }, [load]);
  useEffect(() => { void api.invoke('win:setTitle', loc ? locTitle(loc) : 'Finder').catch(() => undefined); }, [loc]);

  const sorted = useMemo(() => {
    const f = KIND_FILTERS.find((k) => k[0] === filter)![2];
    const list = (entries || []).filter(f);
    if (loc?.kind === 'recents') return list;
    return [...list].sort((a, b) => {
      if (a.isDir !== b.isDir && sort.k !== 'mtime') return a.isDir ? -1 : 1;
      const r = sort.k === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : sort.k === 'mtime' ? a.mtime - b.mtime : sort.k === 'size' ? a.size - b.size : kindOf(a.ext, a.isDir).localeCompare(kindOf(b.ext, b.isDir));
      return r * sort.dir;
    });
  }, [entries, sort, filter, loc]);
  const selEntries = sorted.filter((e) => sel.includes(e.path));

  // ---------- Actions
  const openEntry = (e: FileEntry, newTab = false) => {
    if (e.isDir) go({ kind: 'dir', path: e.path }, newTab);
    else if (isImage(e.ext)) void api.invoke('app:open', 'photos', { path: e.path });
    else void api.invoke('fs:open', e.path).catch((er: Error) => toast(er.message, 'error'));
  };
  const trash = async (paths = sel) => {
    if (!paths.length) return;
    const ok = await dialog.confirm({ title: paths.length === 1 ? `Move “${basename(paths[0])}” to the Recycle Bin?` : `Move ${paths.length} items to the Recycle Bin?`, message: 'You can restore them from the Recycle Bin later.', confirm: 'Move to Recycle Bin', danger: true });
    if (!ok) return;
    try { await api.invoke('fs:trash', paths); setSel([]); void load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const deleteForever = async (paths = sel) => {
    if (!paths.length) return;
    const ok = await dialog.confirm({ title: `Permanently delete ${paths.length === 1 ? `“${basename(paths[0])}”` : `${paths.length} items`}?`, message: 'This cannot be undone. The items will NOT go to the Recycle Bin.', confirm: 'Delete Permanently', danger: true });
    if (!ok) return;
    try { await api.invoke('fs:delete', paths); setSel([]); void load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const paste = async (dest = curDir) => {
    const c = readClip();
    if (!c || !dest) return;
    try {
      const done = await api.invoke<string[]>(c.op === 'copy' ? 'fs:copy' : 'fs:move', c.paths, dest);
      if (c.op === 'cut') writeClip(null);
      toast(`${c.op === 'copy' ? 'Copied' : 'Moved'} ${done.length} item${done.length === 1 ? '' : 's'}`);
      void load(); setSel(done);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const newFolder = async () => { if (!curDir) return; try { const p = await api.invoke<string>('fs:mkdir', curDir); await load(); setSel([p]); setRenaming(p); } catch (e) { toast((e as Error).message, 'error'); } };
  const newFile = async () => { if (!curDir) return; try { const p = await api.invoke<string>('fs:mkfile', curDir); await load(); setSel([p]); setRenaming(p); } catch (e) { toast((e as Error).message, 'error'); } };
  const doRename = async (p: string, name: string) => {
    setRenaming(null);
    if (!name || name === basename(p)) return;
    try { const np = await api.invoke<string>('fs:rename', p, name); await load(); setSel([np]); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const getInfo = (e: FileEntry) => void dialog.alert(e.name, `${kindOf(e.ext, e.isDir)}${e.isDir ? '' : ` · ${bytes(e.size)} (${e.size.toLocaleString()} bytes)`}\nModified: ${new Date(e.mtime).toLocaleString()}\nWhere: ${dirname(e.path)}`);

  const itemMenu = (e: FileEntry): MenuItem[] => {
    const paths = sel.includes(e.path) ? sel : [e.path];
    return [
      { label: 'Open', onClick: () => openEntry(e) },
      ...(e.isDir ? [{ label: 'Open in New Tab', onClick: () => openEntry(e, true) }] : [{ label: 'Quick Look', shortcut: 'Space', onClick: () => setQuick(e) }]),
      { label: 'Show in File Explorer', onClick: () => void api.invoke('fs:reveal', e.path) },
      { separator: true },
      { label: 'Move to Recycle Bin', shortcut: 'Del', danger: true, onClick: () => void trash(paths) },
      { label: 'Delete Permanently…', shortcut: 'Shift+Del', danger: true, onClick: () => void deleteForever(paths) },
      { separator: true },
      { label: 'Get Info', onClick: () => getInfo(e) },
      { label: 'Rename', shortcut: 'F2', onClick: () => setRenaming(e.path) },
      { label: 'Duplicate', onClick: async () => { try { const d = await api.invoke<string[]>('fs:copy', paths, dirname(e.path)); void load(); setSel(d); } catch (er) { toast((er as Error).message, 'error'); } } },
      { separator: true },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => { writeClip({ op: 'copy', paths }); toast(`Copied ${paths.length} item(s)`); } },
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => { writeClip({ op: 'cut', paths }); toast(`Cut ${paths.length} item(s)`); } },
      { label: 'Copy as Path', onClick: () => void api.invoke('clipboard:writeText', paths.join('\r\n')) },
      ...(e.isDir ? [{ label: 'Paste into Folder', disabled: !readClip(), onClick: () => void paste(e.path) }] : []),
      ...(isImage(e.ext) ? [{ separator: true }, { label: 'Set as Wallpaper', onClick: () => void update({ customWallpapers: [...new Set([...s.customWallpapers, e.path])], wallpaper: e.path }) } as MenuItem] : []),
    ];
  };
  const bgMenu = (): MenuItem[] => [
    { label: 'New Folder', shortcut: 'Ctrl+Shift+N', disabled: !curDir, onClick: () => void newFolder() },
    { label: 'New Text Document', disabled: !curDir, onClick: () => void newFile() },
    { separator: true },
    { label: 'Paste', shortcut: 'Ctrl+V', disabled: !readClip() || !curDir, onClick: () => void paste() },
    { separator: true },
    { label: 'View as Icons', checked: s.finderView === 'grid', onClick: () => update({ finderView: 'grid' }) },
    { label: 'View as List', checked: s.finderView === 'list', onClick: () => update({ finderView: 'list' }) },
    { label: 'Sort By', submenu: (['name', 'mtime', 'size', 'kind'] as SortKey[]).map((k) => ({ label: { name: 'Name', mtime: 'Date Modified', size: 'Size', kind: 'Kind' }[k], checked: sort.k === k, onClick: () => setSort({ k, dir: k === 'name' || k === 'kind' ? 1 : -1 }) })) },
    { label: 'Show Hidden Files', checked: s.finderShowHidden, onClick: () => { void update({ finderShowHidden: !s.finderShowHidden }).then(load); } },
    { separator: true },
    ...(curDir ? [{ label: 'Open in File Explorer', onClick: () => void api.invoke('fs:open', curDir) }, { label: 'Open Terminal Here', onClick: () => void api.invoke('apps:launch', 'shell:AppsFolder\\Microsoft.WindowsTerminal_8wekyb3d8bbwe!App') }] : []),
  ];

  // ---------- Selection & keyboard
  const clickItem = (e: React.MouseEvent, f: FileEntry) => {
    if (e.ctrlKey) setSel((x) => (x.includes(f.path) ? x.filter((p) => p !== f.path) : [...x, f.path]));
    else if (e.shiftKey && anchor) { const a = sorted.findIndex((x) => x.path === anchor), b = sorted.findIndex((x) => x.path === f.path); setSel(sorted.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.path)); }
    else setSel([f.path]);
    if (!e.shiftKey) setAnchor(f.path);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const ctrl = e.ctrlKey;
      if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(sorted.map((x) => x.path)); }
      else if (ctrl && e.key.toLowerCase() === 'c' && sel.length) { writeClip({ op: 'copy', paths: sel }); toast(`Copied ${sel.length} item(s)`); }
      else if (ctrl && e.key.toLowerCase() === 'x' && sel.length) { writeClip({ op: 'cut', paths: sel }); toast(`Cut ${sel.length} item(s)`); }
      else if (ctrl && e.key.toLowerCase() === 'v') void paste();
      else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); void newFolder(); }
      else if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); if (loc) go(loc, true); }
      else if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'Delete') { e.preventDefault(); if (e.shiftKey) void deleteForever(); else void trash(); }
      else if (e.key === 'F2' && sel.length === 1) setRenaming(sel[0]);
      else if (e.key === 'F5') void load();
      else if (e.key === 'Enter' && selEntries.length === 1) openEntry(selEntries[0]);
      else if (e.key === ' ' && selEntries.length === 1) { e.preventDefault(); setQuick(quick ? null : selEntries[0]); }
      else if (e.key === 'Escape') { setQuick(null); setSel([]); }
      else if ((e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) && curDir) { const up = dirname(curDir); if (up && up !== curDir) go({ kind: 'dir', path: up }); }
      else if (e.altKey && e.key === 'ArrowLeft') back(); else if (e.altKey && e.key === 'ArrowRight') fwd();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && s.finderView === 'grid')) {
        e.preventDefault();
        const i = sorted.findIndex((x) => x.path === sel[sel.length - 1]);
        const cols = s.finderView === 'grid' ? Math.max(1, Math.floor(((document.getElementById('finder-grid')?.clientWidth || 600) - 16) / 112)) : 1;
        const step = e.key === 'ArrowDown' ? cols : e.key === 'ArrowUp' ? -cols : e.key === 'ArrowRight' ? 1 : -1;
        const n = sorted[Math.max(0, Math.min(sorted.length - 1, i < 0 ? 0 : i + step))];
        if (n) { setSel([n.path]); setAnchor(n.path); document.querySelector(`[data-path="${CSS.escape(n.path)}"]`)?.scrollIntoView({ block: 'nearest' }); if (quick) setQuick(n); }
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const back = () => setTabs((x) => x.map((t) => (t.id === active && t.idx > 0 ? { ...t, idx: t.idx - 1 } : t)));
  const fwd = () => setTabs((x) => x.map((t) => (t.id === active && t.idx < t.history.length - 1 ? { ...t, idx: t.idx + 1 } : t)));
  const closeTab = (id: string) => { const rest = tabs.filter((t) => t.id !== id); if (!rest.length) { void api.invoke('win:close'); return; } setTabs(rest); if (active === id) setActive(rest[rest.length - 1].id); };

  // Drag & drop: move between folders (Ctrl = copy); drop from Explorer = copy; drag out to Explorer
  const onDropTo = async (e: React.DragEvent, dest: string | null) => {
    e.preventDefault(); setDropTarget(null);
    if (!dest) return;
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (!paths.length || paths.some((p) => p.toLowerCase() === dest.toLowerCase())) return;
    // Same rules as File Explorer: same drive → move (Ctrl forces copy), other drive → copy (Shift forces move)
    const sameDrive = paths.every((p) => p.slice(0, 2).toLowerCase() === dest.slice(0, 2).toLowerCase());
    const move = e.shiftKey || (sameDrive && !e.ctrlKey);
    if (move && paths.every((p) => dirname(p).toLowerCase() === dest.toLowerCase())) return;
    try { const d = await api.invoke<string[]>(move ? 'fs:move' : 'fs:copy', paths, dest); toast(`${move ? 'Moved' : 'Copied'} ${d.length} item(s) to ${basename(dest) || dest}`); void load(); } catch (er) { toast((er as Error).message, 'error'); }
  };
  const dragStart = (e: React.DragEvent, f: FileEntry) => {
    // Native OS drag: works inside Finder and out to File Explorer, the desktop, or other apps
    e.preventDefault();
    const paths = sel.includes(f.path) ? sel : [f.path];
    if (!sel.includes(f.path)) setSel([f.path]);
    void api.invoke('fs:startDrag', paths).catch(() => undefined);
  };

  const sideLink = (label: string, icon: React.ReactNode, l: Loc, key: string) => {
    const isActive = loc && JSON.stringify(loc) === JSON.stringify(l);
    const dest = l.kind === 'dir' ? l.path : null;
    return (
      <button key={key} onClick={() => go(l)} onDragOver={(e) => { if (dest) { e.preventDefault(); setDropTarget(key); } }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => void onDropTo(e, dest)}
        className={`sidebar-item w-full ${isActive ? 'active' : ''} ${dropTarget === key ? 'ring-2 ring-[rgb(var(--accent))]' : ''}`}>
        <span className="text-[rgb(var(--accent))]">{icon}</span><span className="truncate">{label}</span>
      </button>
    );
  };

  const side = special && (
    <div>
      <div className="section-label">Favourites</div>
      {sideLink('Recents', <Clock size={15} />, { kind: 'recents' }, 'rec')}
      {sideLink('Desktop', <Monitor size={15} />, { kind: 'dir', path: special.desktop }, 'desk')}
      {sideLink('Documents', <FileText size={15} />, { kind: 'dir', path: special.documents }, 'docs')}
      {sideLink('Downloads', <Download size={15} />, { kind: 'dir', path: special.downloads }, 'dl')}
      {sideLink('Pictures', <ImageIcon size={15} />, { kind: 'dir', path: special.pictures }, 'pics')}
      {sideLink('Music', <Music size={15} />, { kind: 'dir', path: special.music }, 'music')}
      {sideLink('Videos', <Video size={15} />, { kind: 'dir', path: special.videos }, 'vid')}
      {sideLink(basename(special.home), <Home size={15} />, { kind: 'dir', path: special.home }, 'home')}
      <div className="section-label pt-3">Locations</div>
      {sideLink('This PC', <Monitor size={15} />, { kind: 'computer' }, 'pc')}
      {drives.map((d) => sideLink(`${d.label} (${d.mount.replace('\\', '')})`, d.type === 'Removable' ? <Usb size={15} /> : <HardDrive size={15} />, { kind: 'dir', path: d.mount }, d.mount))}
      <button className="sidebar-item w-full" onClick={() => void api.invoke('apps:launch', 'shell:RecycleBinFolder')}><Trash2 size={15} className="text-[rgb(var(--accent))]" /> Recycle Bin</button>
    </div>
  );

  const crumbs = curDir ? curDir.split(/[\\/]/).filter(Boolean).reduce<{ name: string; path: string }[]>((acc, part, i) => [...acc, { name: part, path: i === 0 ? `${part}\\` : joinPath(acc[i - 1].path, part) }], []) : [];
  const freeOnDrive = curDir ? drives.find((d) => curDir.toLowerCase().startsWith(d.mount.toLowerCase())) : null;

  return (
    <Window sidebar={side} title={loc ? locTitle(loc) : 'Finder'} toolbar={<>
      <button className="icon-btn" disabled={!tab || tab.idx === 0} onClick={back} title="Back (Alt+←)"><ChevronLeft size={17} /></button>
      <button className="icon-btn" disabled={!tab || tab.idx >= tab.history.length - 1} onClick={fwd} title="Forward (Alt+→)"><ChevronRight size={17} /></button>
      <div className="w-2" />
      <div className="flex p-[2px] rounded-md bg-[rgb(var(--fg)/.07)]">
        <button className={`px-2 py-[2px] rounded ${s.finderView === 'grid' ? 'bg-white dark:bg-white/20 shadow-sm' : ''}`} onClick={() => update({ finderView: 'grid' })}><LayoutGrid size={14} /></button>
        <button className={`px-2 py-[2px] rounded ${s.finderView === 'list' ? 'bg-white dark:bg-white/20 shadow-sm' : ''}`} onClick={() => update({ finderView: 'list' })}><ListIcon size={14} /></button>
      </div>
      <button className="icon-btn" title="Sort" onClick={(e) => ctx(e, bgMenu().filter((m) => m.label === 'Sort By')[0].submenu!.concat([{ separator: true }, { label: sort.dir === 1 ? 'Ascending ✓' : 'Ascending', onClick: () => setSort({ ...sort, dir: 1 }) }, { label: sort.dir === -1 ? 'Descending ✓' : 'Descending', onClick: () => setSort({ ...sort, dir: -1 }) }]))}><ArrowUpDown size={15} /></button>
      <button className="icon-btn" title="New Folder (Ctrl+Shift+N)" disabled={!curDir} onClick={() => void newFolder()}><FolderPlus size={15} /></button>
      <button className={`icon-btn ${preview ? 'active' : ''}`} title="Preview pane" onClick={() => setPreview(!preview)}><PanelRight size={15} /></button>
      <form className="flex items-center gap-2 field !py-[3px] w-[190px] ml-1" onSubmit={(e) => { e.preventDefault(); const q = searchText.trim(); if (!q) return; go({ kind: 'search', root: curDir || special?.home || 'C:\\', q }); }}>
        <Search size={13} className="opacity-50" /><input ref={searchRef} className="bg-transparent outline-none flex-1 text-[12.5px] min-w-0" placeholder={curDir ? `Search ${basename(curDir)}` : 'Search'} value={searchText} onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setSearchText('')} />
      </form>
    </>}>
      <div className="h-full flex flex-col" onDragOver={(e) => { if (curDir) e.preventDefault(); }} onDrop={(e) => void onDropTo(e, curDir)}>
        {tabs.length > 1 && (
          <div className="flex border-b border-[rgb(var(--stroke)/var(--stroke-a))] bg-[rgb(var(--fg)/.03)]">
            {tabs.map((t) => <div key={t.id} onClick={() => setActive(t.id)} className={`group flex-1 min-w-0 flex items-center gap-1 px-3 py-[5px] text-[12px] border-r border-[rgb(var(--stroke)/var(--stroke-a))] cursor-default ${t.id === active ? 'bg-[rgb(var(--surface)/.9)] font-medium' : 'muted hover:bg-[rgb(var(--fg)/.04)]'}`}><button className="opacity-0 group-hover:opacity-60" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}><X size={11} /></button><span className="truncate flex-1 text-center">{locTitle(t.history[t.idx])}</span></div>)}
            <button className="px-3 muted" onClick={() => loc && go(loc, true)} title="New tab (Ctrl+T)"><Plus size={13} /></button>
          </div>
        )}
        <div className="flex items-center gap-1 px-3 py-[5px] text-[11.5px] border-b border-[rgb(var(--stroke)/var(--stroke-a))]">
          {KIND_FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`px-2 py-[1px] rounded-full ${filter === k ? 'bg-[rgb(var(--accent))] text-white' : 'hover:bg-[rgb(var(--fg)/.06)]'}`}>{l}</button>)}
          {loc?.kind === 'search' && <span className="ml-auto muted">Searching in {basename(loc.root) || loc.root} · <button className="text-[rgb(var(--accent))]" onClick={back}>Done</button></span>}
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-auto" id="finder-grid" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel([]); }} onContextMenu={(e) => { if (!(e.target as HTMLElement).closest('[data-path]')) ctx(e, bgMenu()); }}>
            {loc?.kind === 'computer' ? <Computer drives={drives} open={(p) => go({ kind: 'dir', path: p })} />
              : entries === null ? <div className="p-10 flex justify-center"><Spinner /></div>
              : error ? <Empty icon={<Folder size={40} />} title="Can't open this folder" sub={error} />
              : sorted.length === 0 ? <Empty icon={<Folder size={40} />} title={loc?.kind === 'search' ? 'No results' : 'This folder is empty'} />
              : s.finderView === 'grid' ? (
                <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1 content-start" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
                  {sorted.map((f) => (
                    <div key={f.path} data-path={f.path} draggable onDragStart={(e) => dragStart(e, f)}
                      onDragOver={(e) => { if (f.isDir) { e.preventDefault(); e.stopPropagation(); setDropTarget(f.path); } }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => { e.stopPropagation(); void onDropTo(e, f.isDir ? f.path : curDir); }}
                      onMouseDown={(e) => clickItem(e, f)} onDoubleClick={() => openEntry(f)} onContextMenu={(e) => { if (!sel.includes(f.path)) setSel([f.path]); ctx(e, itemMenu(f)); }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg ${dropTarget === f.path ? 'ring-2 ring-[rgb(var(--accent))]' : ''}`}>
                      <div className={`w-[72px] h-[64px] flex items-center justify-center rounded-md ${sel.includes(f.path) ? 'bg-[rgb(var(--fg)/.1)]' : ''}`}><FileIcon f={f} size={60} /></div>
                      {renaming === f.path ? <RenameInput name={f.name} onDone={(n) => void doRename(f.path, n)} /> : (
                        <div className={`text-[12px] text-center leading-tight line-clamp-2 break-all px-1 rounded ${sel.includes(f.path) ? 'bg-[rgb(var(--accent))] text-white' : ''} ${f.hidden ? 'opacity-50' : ''}`}>{f.name}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="min-w-[560px]">
                  <div className="grid grid-cols-[minmax(200px,1fr)_170px_90px_140px] gap-2 px-4 py-[5px] text-[11.5px] font-semibold muted border-b border-[rgb(var(--stroke)/var(--stroke-a))] sticky top-0 bg-[rgb(var(--surface)/.95)] z-[1]">
                    {(['name', 'mtime', 'size', 'kind'] as SortKey[]).map((k) => <button key={k} className={`text-left ${k === 'size' ? 'text-right' : ''}`} onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 })}>{{ name: 'Name', mtime: 'Date Modified', size: 'Size', kind: 'Kind' }[k]}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>)}
                  </div>
                  {sorted.map((f, i) => (
                    <div key={f.path} data-path={f.path} draggable onDragStart={(e) => dragStart(e, f)}
                      onDragOver={(e) => { if (f.isDir) { e.preventDefault(); e.stopPropagation(); setDropTarget(f.path); } }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => { e.stopPropagation(); void onDropTo(e, f.isDir ? f.path : curDir); }}
                      onMouseDown={(e) => clickItem(e, f)} onDoubleClick={() => openEntry(f)} onContextMenu={(e) => { if (!sel.includes(f.path)) setSel([f.path]); ctx(e, itemMenu(f)); }}
                      className={`grid grid-cols-[minmax(200px,1fr)_170px_90px_140px] gap-2 px-4 py-[3px] text-[12.5px] items-center ${sel.includes(f.path) ? 'bg-[rgb(var(--accent))] text-white' : i % 2 ? 'bg-[rgb(var(--fg)/.025)]' : ''} ${dropTarget === f.path ? 'ring-2 ring-inset ring-[rgb(var(--accent))]' : ''} ${f.hidden ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0"><FileIcon f={f} size={18} />{renaming === f.path ? <RenameInput name={f.name} onDone={(n) => void doRename(f.path, n)} /> : <span className="truncate">{f.name}</span>}</div>
                      <span className={`truncate ${sel.includes(f.path) ? '' : 'muted'}`}>{dateShort(f.mtime)}</span>
                      <span className={`text-right tabular-nums ${sel.includes(f.path) ? '' : 'muted'}`}>{f.isDir ? '--' : bytes(f.size)}</span>
                      <span className={`truncate ${sel.includes(f.path) ? '' : 'muted'}`}>{kindOf(f.ext, f.isDir)}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
          {preview && <PreviewPane f={selEntries.length === 1 ? selEntries[0] : null} count={selEntries.length} />}
        </div>
        <div className="h-[26px] shrink-0 flex items-center gap-1 px-3 text-[11.5px] muted border-t border-[rgb(var(--stroke)/var(--stroke-a))] overflow-hidden">
          {crumbs.map((c, i) => <span key={c.path} className="flex items-center gap-1 shrink-0">{i > 0 && <ChevronRight size={11} />}<button className="hover:text-[rgb(var(--fg))] flex items-center gap-1" onClick={() => go({ kind: 'dir', path: c.path })} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); void onDropTo(e, c.path); }}>{i === 0 ? <HardDrive size={11} /> : <Folder size={11} />}{c.name}</button></span>)}
          <span className="flex-1" />
          <span className="shrink-0">{sel.length ? `${sel.length} of ${sorted.length} selected` : `${sorted.length} items`}{freeOnDrive ? `, ${bytes(freeOnDrive.size - freeOnDrive.used)} available` : ''}</span>
        </div>
      </div>
      {quick && <QuickLook f={quick} onClose={() => setQuick(null)} />}
    </Window>
  );
}

function FileIcon({ f, size }: { f: FileEntry; size: number }) {
  if (f.isDir) return <Folder size={size} strokeWidth={size > 30 ? 1.1 : 1.8} className="text-[#3ea6ff] shrink-0" fill="#3ea6ff55" />;
  const s = size > 30 ? 256 : 32;
  return <img src={thumbUrl(f.path, s)} loading="lazy" draggable={false} style={{ width: size, height: size }} className={`object-contain shrink-0 ${size > 30 && isImage(f.ext) ? 'rounded shadow-sm' : ''}`} alt="" />;
}

function RenameInput({ name, onDone }: { name: string; onDone: (n: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.focus(); const dot = name.lastIndexOf('.'); el.setSelectionRange(0, dot > 0 ? dot : name.length); }, [name]);
  return <input ref={ref} defaultValue={name} className="field !py-0 !px-1 text-[12px] w-full text-center" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onDone((e.target as HTMLInputElement).value); if (e.key === 'Escape') onDone(name); }} onBlur={(e) => onDone(e.target.value)} />;
}

function Computer({ drives, open }: { drives: DriveInfo[]; open: (p: string) => void }) {
  return (
    <div className="p-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {drives.map((d) => { const p = (d.used / d.size) * 100; return (
        <button key={d.mount} onDoubleClick={() => open(d.mount)} onClick={() => open(d.mount)} className="tile p-4 flex items-center gap-3 hoverable text-left">
          {d.type === 'Removable' ? <Usb size={36} className="text-[rgb(var(--accent))]" /> : <HardDrive size={36} className="text-[rgb(var(--accent))]" />}
          <div className="flex-1 min-w-0"><div className="font-semibold truncate">{d.label} ({d.mount.replace('\\', '')})</div>
            <div className="h-[6px] rounded-full mt-2 bg-[rgb(var(--fg)/.12)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: p > 90 ? '#ff453a' : 'rgb(var(--accent))' }} /></div>
            <div className="text-[11.5px] muted mt-1">{bytes(d.size - d.used)} free of {bytes(d.size, 0)}</div></div>
        </button>
      ); })}
    </div>
  );
}

function PreviewPane({ f, count }: { f: FileEntry | null; count: number }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { setText(null); if (f && !f.isDir && isText(f.ext) && f.size < 2_000_000) void api.invoke<{ binary: boolean; text: string }>('fs:readText', f.path).then((r) => setText(r.binary ? null : r.text.slice(0, 6000))).catch(() => undefined); }, [f]);
  return (
    <div className="w-[260px] shrink-0 border-l border-[rgb(var(--stroke)/var(--stroke-a))] p-4 overflow-y-auto flex flex-col items-center text-center gap-3">
      {!f ? <div className="muted text-[12px] mt-10">{count > 1 ? `${count} items selected` : 'Select a file to preview'}</div> : (<>
        {isImage(f.ext) ? <img src={fileUrl(f.path)} className="max-w-full max-h-[220px] rounded shadow" alt="" />
          : isAudio(f.ext) ? <><FileIcon f={f} size={96} /><audio controls src={fileUrl(f.path)} className="w-full" /></>
          : isVideo(f.ext) ? <video controls src={fileUrl(f.path)} className="w-full rounded" />
          : text !== null ? <pre className="text-left text-[10.5px] font-mono w-full max-h-[260px] overflow-auto tile p-2 whitespace-pre-wrap">{text}</pre>
          : <FileIcon f={f} size={96} />}
        <div className="font-semibold text-[13px] break-all">{f.name}</div>
        <div className="text-[11.5px] muted leading-relaxed">{kindOf(f.ext, f.isDir)}{!f.isDir && ` · ${bytes(f.size)}`}<br />Modified {new Date(f.mtime).toLocaleString()}</div>
        <button className="btn text-[12px]" onClick={() => void api.invoke('fs:open', f.path)}><Eye size={13} /> Open</button>
      </>)}
    </div>
  );
}

function QuickLook({ f, onClose }: { f: FileEntry; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { setText(null); if (!f.isDir && isText(f.ext)) void api.invoke<{ binary: boolean; text: string }>('fs:readText', f.path).then((r) => setText(r.binary ? null : r.text)).catch(() => undefined); }, [f]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong rounded-2xl w-[78%] h-[80%] flex flex-col overflow-hidden">
        <div className="h-[38px] flex items-center px-3 gap-2 border-b border-[rgb(var(--stroke)/var(--stroke-a))]"><button className="icon-btn" onClick={onClose}><X size={14} /></button><div className="flex-1 text-center text-[13px] font-semibold truncate">{f.name}</div><button className="btn !py-[2px] text-[12px]" onClick={() => void api.invoke('fs:open', f.path)}>Open with Default App</button></div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-black/10">
          {isImage(f.ext) ? <img src={fileUrl(f.path)} className="max-w-full max-h-full object-contain" alt="" />
            : isVideo(f.ext) ? <video autoPlay controls src={fileUrl(f.path)} className="max-w-full max-h-full" />
            : isAudio(f.ext) ? <div className="flex flex-col items-center gap-4"><FileIcon f={f} size={140} /><audio autoPlay controls src={fileUrl(f.path)} /></div>
            : f.ext === 'pdf' ? <iframe src={fileUrl(f.path)} className="w-full h-full rounded bg-white" title="pdf" />
            : text !== null ? <pre className="w-full h-full overflow-auto text-[12px] font-mono whitespace-pre-wrap p-3 tile">{text}</pre>
            : <div className="flex flex-col items-center gap-3"><FileIcon f={f} size={140} /><div className="muted text-[12px]">{kindOf(f.ext, f.isDir)} · {bytes(f.size)}</div></div>}
        </div>
      </div>
    </div>
  );
}
export type { Settings };
