import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX, Music2, Disc3, Mic2, ListMusic, FolderPlus, RefreshCw, Search, X } from 'lucide-react';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { useSettings, useLocalStorage } from '../lib/hooks';
import { duration } from '../lib/format';
import { Empty, Spinner, useContextMenu } from '../components/ui';

interface Track { path: string; url: string; title: string; artist: string; album: string; duration: number; cover: string | null; track: number }
type View = 'songs' | 'albums' | 'artists';

export default function Music() {
  const [s, update] = useSettings();
  const [lib, setLib] = useState<Track[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useLocalStorage<View>('music:view', 'songs');
  const [q, setQ] = useState('');
  const [album, setAlbum] = useState<string | null>(null);
  const [artist, setArtist] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [pos, setPos] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [vol, setVol] = useLocalStorage('music:vol', 0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useLocalStorage('music:shuffle', false);
  const [repeat, setRepeat] = useLocalStorage<'off' | 'all' | 'one'>('music:repeat', 'off');
  const audio = useRef<HTMLAudioElement>(null);
  const ctx = useContextMenu();

  const scan = useCallback(async (folders: string[]) => {
    setScanning(true);
    try { setLib(await api.invoke<Track[]>('music:scan', folders)); } finally { setScanning(false); }
  }, []);
  useEffect(() => {
    (async () => {
      let folders = s.musicFolders;
      if (!folders.length) { const sf = await api.invoke<{ music: string }>('fs:special'); folders = [sf.music]; }
      void scan(folders);
    })();
  }, [s.musicFolders.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = pos >= 0 ? queue[pos] : null;
  const filtered = useMemo(() => {
    let l = lib || [];
    if (q) l = l.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q.toLowerCase()));
    if (album) l = l.filter((t) => t.album === album).sort((a, b) => a.track - b.track);
    if (artist) l = l.filter((t) => t.artist === artist);
    return l;
  }, [lib, q, album, artist]);
  const albums = useMemo(() => { const m = new Map<string, Track[]>(); for (const t of lib || []) m.set(t.album, [...(m.get(t.album) || []), t]); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [lib]);
  const artists = useMemo(() => { const m = new Map<string, number>(); for (const t of lib || []) m.set(t.artist, (m.get(t.artist) || 0) + 1); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [lib]);

  const playList = (list: Track[], i: number) => {
    let qList = list;
    let p = i;
    if (shuffle) { const first = list[i]; qList = [first, ...list.filter((_, j) => j !== i).sort(() => Math.random() - 0.5)]; p = 0; }
    setQueue(qList); setPos(p); setPlaying(true);
  };
  const next = useCallback((auto = false) => {
    if (!queue.length) return;
    if (auto && repeat === 'one') { audio.current!.currentTime = 0; void audio.current!.play(); return; }
    if (pos + 1 < queue.length) setPos(pos + 1);
    else if (repeat === 'all' || !auto) setPos(0);
    else setPlaying(false);
  }, [queue.length, pos, repeat]);
  const prev = useCallback(() => { if (audio.current && audio.current.currentTime > 3) audio.current.currentTime = 0; else setPos((p) => Math.max(0, p - 1)); }, []);

  useEffect(() => { const a = audio.current; if (!a || !cur) return; a.src = cur.url; if (playing) void a.play().catch(() => setPlaying(false)); }, [cur?.path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const a = audio.current; if (!a || !cur) return; if (playing) void a.play().catch(() => setPlaying(false)); else a.pause(); }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (audio.current) { audio.current.volume = vol; audio.current.muted = muted; } }, [vol, muted]);
  useEffect(() => { void api.invoke('win:setTitle', cur ? `${cur.title} — ${cur.artist}` : 'Music').catch(() => undefined); }, [cur]);

  // Windows media integration: shows in the Windows media flyout and responds to keyboard media keys
  useEffect(() => {
    if (!('mediaSession' in navigator) || !cur) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist, album: cur.album, artwork: cur.cover ? [{ src: cur.cover, sizes: '512x512' }] : [] });
    navigator.mediaSession.setActionHandler('play', () => setPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false));
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('previoustrack', prev);
  }, [cur, next, prev]);
  useEffect(() => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; }, [playing]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === ' ') { e.preventDefault(); if (cur) setPlaying((p) => !p); } if (e.ctrlKey && e.key === 'ArrowRight') next(); if (e.ctrlKey && e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [cur, next, prev]);

  const addFolder = async () => { const d = await api.invoke<string | null>('fs:pickFolder'); if (d) { const sf = await api.invoke<{ music: string }>('fs:special'); void update({ musicFolders: [...new Set([...(s.musicFolders.length ? s.musicFolders : [sf.music]), d])] }); } };
  const songRow = (t: Track, i: number, list: Track[]) => (
    <div key={t.path} onDoubleClick={() => playList(list, i)} onContextMenu={(e) => ctx(e, [{ label: 'Play', onClick: () => playList(list, i) }, { label: 'Play Next', onClick: () => { if (pos < 0) playList([t], 0); else setQueue([...queue.slice(0, pos + 1), t, ...queue.slice(pos + 1)]); } }, { label: 'Add to Queue', onClick: () => (pos < 0 ? playList([t], 0) : setQueue([...queue, t])) }, { separator: true }, { label: 'Show in Explorer', onClick: () => void api.invoke('fs:reveal', t.path) }])}
      className={`grid grid-cols-[28px_1.5fr_1fr_1fr_60px] gap-3 items-center px-4 py-[6px] text-[12.5px] ${cur?.path === t.path ? 'text-[#ff2d55]' : ''} ${i % 2 ? 'bg-[rgb(var(--fg)/.025)]' : ''} hover:bg-[rgb(var(--fg)/.06)]`}>
      <button onClick={() => playList(list, i)} className="opacity-60">{cur?.path === t.path && playing ? <Music2 size={13} /> : <Play size={12} />}</button>
      <span className="truncate font-medium">{t.title}</span><span className="truncate muted">{t.artist}</span><span className="truncate muted">{t.album}</span><span className="text-right muted tabular-nums">{duration(t.duration)}</span>
    </div>
  );

  const side = (
    <div>
      <div className="section-label">Library</div>
      {([['songs', 'Songs', ListMusic], ['albums', 'Albums', Disc3], ['artists', 'Artists', Mic2]] as const).map(([k, l, I]) => <button key={k} onClick={() => { setView(k); setAlbum(null); setArtist(null); }} className={`sidebar-item w-full ${view === k && !album && !artist ? 'active' : ''}`}><I size={14} className="text-[#ff2d55]" />{l}</button>)}
      <div className="section-label pt-4 flex justify-between pr-2">Folders<button onClick={addFolder} title="Add folder"><FolderPlus size={13} /></button></div>
      {(s.musicFolders.length ? s.musicFolders : ['Music (default)']).map((f) => <div key={f} className="sidebar-item text-[12px] group"><span className="truncate flex-1" title={f}>{f.split(/[\\/]/).pop()}</span>{s.musicFolders.length > 0 && <button className="opacity-0 group-hover:opacity-60" onClick={() => update({ musicFolders: s.musicFolders.filter((x) => x !== f) })}><X size={11} /></button>}</div>)}
      <button className="sidebar-item w-full text-[12px] muted" onClick={async () => void scan(s.musicFolders.length ? s.musicFolders : [(await api.invoke<{ music: string }>('fs:special')).music])}><RefreshCw size={12} className={scanning ? 'animate-spin' : ''} /> Rescan</button>
    </div>
  );

  return (
    <Window sidebar={side} title={album || artist || (view === 'songs' ? 'Songs' : view === 'albums' ? 'Albums' : 'Artists')} toolbar={<div className="flex items-center gap-2 field !py-[3px] w-[200px]"><Search size={13} className="opacity-50" /><input className="bg-transparent outline-none flex-1 text-[12.5px]" placeholder="Search library" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
      <audio ref={audio} onTimeUpdate={(e) => setTime((e.target as HTMLAudioElement).currentTime)} onEnded={() => next(true)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {lib === null ? <div className="p-10 flex flex-col items-center gap-2 muted"><Spinner /> Reading your music…</div> : lib.length === 0 ? (
            <Empty icon={<Music2 size={44} />} title="No music found" sub="Add a folder with MP3, M4A, FLAC, WAV or OGG files." action={<button className="btn btn-primary" onClick={addFolder}><FolderPlus size={14} /> Add Music Folder</button>} />
          ) : view === 'albums' && !album && !q ? (
            <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
              {albums.map(([name, tracks]) => <button key={name} className="text-left group" onClick={() => setAlbum(name)}><Cover src={tracks.find((t) => t.cover)?.cover || null} className="w-full aspect-square rounded-xl shadow-md group-hover:brightness-90" /><div className="text-[12.5px] font-medium truncate mt-2">{name}</div><div className="text-[11.5px] muted truncate">{tracks[0].artist}</div></button>)}
            </div>
          ) : view === 'artists' && !artist && !q ? (
            <div className="p-2">{artists.map(([a, n]) => <button key={a} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hoverable" onClick={() => setArtist(a)}><div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#ff6a88] to-[#ff2d55] flex items-center justify-center text-white"><Mic2 size={15} /></div><span className="flex-1 text-left">{a}</span><span className="muted text-[12px]">{n} songs</span></button>)}</div>
          ) : (
            <>
              {album && <div className="flex gap-5 p-5 items-end"><Cover src={filtered.find((t) => t.cover)?.cover || null} className="w-[150px] h-[150px] rounded-xl shadow-lg" /><div><div className="text-[24px] font-bold">{album}</div><div className="text-[#ff2d55] text-[15px]">{filtered[0]?.artist}</div><button className="btn btn-primary mt-3 !bg-[#ff2d55]" onClick={() => playList(filtered, 0)}><Play size={13} /> Play</button></div></div>}
              <div className="grid grid-cols-[28px_1.5fr_1fr_1fr_60px] gap-3 px-4 py-2 text-[11px] font-semibold muted border-b border-[rgb(var(--stroke)/var(--stroke-a))]"><span /><span>Title</span><span>Artist</span><span>Album</span><span className="text-right">Time</span></div>
              {filtered.map((t, i) => songRow(t, i, filtered))}
            </>
          )}
        </div>
        <div className="h-[72px] shrink-0 border-t border-[rgb(var(--stroke)/var(--stroke-a))] flex items-center gap-4 px-4" style={{ background: 'rgb(var(--surface)/.7)' }}>
          <div className="flex items-center gap-3 w-[240px] min-w-0"><Cover src={cur?.cover || null} className="w-[46px] h-[46px] rounded-md shrink-0" /><div className="min-w-0"><div className="text-[12.5px] font-semibold truncate">{cur?.title || 'Not Playing'}</div><div className="text-[11.5px] muted truncate">{cur ? `${cur.artist} — ${cur.album}` : ''}</div></div></div>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="flex items-center gap-4">
              <button className={shuffle ? 'text-[#ff2d55]' : 'opacity-60'} onClick={() => setShuffle(!shuffle)}><Shuffle size={15} /></button>
              <button onClick={prev} disabled={!cur}><SkipBack size={18} fill="currentColor" /></button>
              <button className="w-9 h-9 rounded-full bg-[rgb(var(--fg))] text-[rgb(var(--glass))] flex items-center justify-center disabled:opacity-40" disabled={!cur && !filtered.length} onClick={() => (cur ? setPlaying(!playing) : playList(filtered, 0))}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-[2px]" />}</button>
              <button onClick={() => next()} disabled={!cur}><SkipForward size={18} fill="currentColor" /></button>
              <button className={repeat !== 'off' ? 'text-[#ff2d55]' : 'opacity-60'} onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>{repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}</button>
            </div>
            <div className="flex items-center gap-2 w-full max-w-[520px] text-[10.5px] muted tabular-nums">
              <span className="w-9 text-right">{duration(time)}</span>
              <input type="range" className="flex-1 accent-[#ff2d55] h-1" min={0} max={cur?.duration || audio.current?.duration || 0} step={0.5} value={time} onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }} />
              <span className="w-9">{duration(cur?.duration || audio.current?.duration || 0)}</span>
            </div>
          </div>
          <div className="w-[160px] flex items-center gap-2"><button onClick={() => setMuted(!muted)}>{muted || vol === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}</button><input type="range" className="flex-1 accent-[rgb(var(--fg))]" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} /></div>
        </div>
      </div>
    </Window>
  );
}

function Cover({ src, className }: { src: string | null; className: string }) {
  return src ? <img src={src} className={`${className} object-cover`} alt="" /> : <div className={`${className} bg-gradient-to-br from-[#ff6a88] to-[#bf3fa8] flex items-center justify-center text-white/90`}><Music2 size={22} /></div>;
}
