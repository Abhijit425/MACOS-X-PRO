import { useMemo, useState } from 'react';
import { Plus, Trash2, Check, Sunrise, Shuffle, Monitor } from 'lucide-react';
import type { WallpaperInfo } from '@shared/types';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { useInvoke, useSettings } from '../lib/hooks';
import { Toggle, useDialog, useToast } from '../components/ui';

const CATS = [['all', 'All'], ['landscape', 'Landscapes'], ['abstract', 'Abstract'], ['dark', 'Dark'], ['minimal', 'Minimal'], ['custom', 'My Pictures']] as const;

export default function Wallpapers() {
  const [s, update] = useSettings();
  const { data, reload } = useInvoke<WallpaperInfo[]>('wallpapers:list', [], [s.customWallpapers.length]);
  const [cat, setCat] = useState<string>('all');
  const [display, setDisplay] = useState<string>('all');
  const { data: eff } = useInvoke<Record<string, string>>('wallpapers:effective', [], [s.wallpaper, JSON.stringify(s.wallpaperPerDisplay)], 'wallpaper:changed');
  const displays = Object.keys(eff || {});
  const dialog = useDialog();
  const toast = useToast();
  const list = useMemo(() => (data || []).filter((w) => cat === 'all' || w.category === cat || (cat === 'dark' && w.tone === 'dark' && w.category !== 'custom')), [data, cat]);
  const current = display === 'all' ? s.wallpaper : s.wallpaperPerDisplay[display] || s.wallpaper;
  const pick = (w: WallpaperInfo) => {
    if (display === 'all') void update({ wallpaper: w.id, wallpaperPerDisplay: {} });
    else void update({ wallpaperPerDisplay: { ...s.wallpaperPerDisplay, [display]: w.id } });
  };
  const cur = (data || []).find((w) => w.id === current);

  const side = (
    <div>
      <div className="section-label">Collections</div>
      {CATS.map(([k, l]) => <button key={k} onClick={() => setCat(k)} className={`sidebar-item w-full ${cat === k ? 'active' : ''}`}>{l}</button>)}
      {displays.length > 1 && (<>
        <div className="section-label pt-4">Displays</div>
        <button onClick={() => setDisplay('all')} className={`sidebar-item w-full ${display === 'all' ? 'active' : ''}`}><Monitor size={14} /> All displays</button>
        {displays.map((d, i) => <button key={d} onClick={() => setDisplay(d)} className={`sidebar-item w-full ${display === d ? 'active' : ''}`}><Monitor size={14} /> Display {i + 1}</button>)}
      </>)}
    </div>
  );

  return (
    <Window title="Wallpapers" sidebar={side} toolbar={<button className="btn text-[12.5px]" onClick={async () => { const added = await api.invoke<string[]>('wallpapers:import'); if (added.length) { toast(`Imported ${added.length} picture${added.length > 1 ? 's' : ''}`); void reload(); setCat('custom'); } }}><Plus size={14} /> Add Pictures…</button>}>
      <div className="h-full flex flex-col">
        <div className="p-4 flex gap-4 items-center border-b border-[rgb(var(--stroke)/var(--stroke-a))]">
          <div className="w-[220px] aspect-video rounded-xl overflow-hidden shadow-lg shrink-0 bg-black/20">{cur && <img src={eff?.[display === 'all' ? displays[0] : display] || cur.thumb} className="w-full h-full object-cover" alt="" />}</div>
          <div className="flex-1 space-y-2 text-[12.5px]">
            <div className="text-[16px] font-semibold">{cur?.name || 'Custom'}</div>
            <label className="flex items-center gap-2"><Toggle small checked={s.wallpaperDynamic} onChange={(v) => update({ wallpaperDynamic: v })} /><Sunrise size={14} /> Dynamic — Sonoma and Ridge follow the time of day</label>
            <label className="flex items-center gap-2"><Toggle small checked={s.wallpaperRotate} onChange={(v) => update({ wallpaperRotate: v })} /><Shuffle size={14} /> Change picture every
              <select className="field !py-0" value={s.wallpaperRotateMinutes} onChange={(e) => update({ wallpaperRotateMinutes: Number(e.target.value) })}>{[5, 15, 30, 60, 180, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m === 1440 ? 'day' : `${m / 60} h`}</option>)}</select>
              from <select className="field !py-0" value={s.wallpaperRotateCategory} onChange={(e) => update({ wallpaperRotateCategory: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="flex items-center gap-2"><Toggle small checked={s.wallpaperApplyToWindows} onChange={(v) => update({ wallpaperApplyToWindows: v })} /> Also apply to the Windows desktop
              {s.originalWindowsWallpaper && <button className="text-[rgb(var(--accent))] ml-2" onClick={async () => { await update({ wallpaperApplyToWindows: false }); toast('Original Windows wallpaper restored'); }}>Restore original</button>}</label>
            {s.mode === 'overlay' && !s.wallpaperApplyToWindows && <div className="muted text-[11.5px]">You're in Overlay mode — the wallpaper shows in Immersive mode, or turn on “Also apply to the Windows desktop”.</div>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 content-start">
          {list.map((w) => (
            <div key={w.id} className="group relative">
              <button onClick={() => pick(w)} className={`w-full rounded-xl overflow-hidden border-2 transition ${current === w.id ? 'border-[rgb(var(--accent))]' : 'border-transparent hover:border-[rgb(var(--fg)/.2)]'}`}>
                <img src={w.thumb} className="w-full aspect-video object-cover" loading="lazy" alt="" />
              </button>
              <div className="text-[12px] mt-1 flex items-center gap-1">{current === w.id && <Check size={12} className="text-[rgb(var(--accent))]" />}<span className="truncate">{w.name}</span></div>
              {w.custom && <button className="absolute top-2 right-2 w-6 h-6 rounded-full glass-strong opacity-0 group-hover:opacity-100 flex items-center justify-center" onClick={async () => { if (await dialog.confirm({ title: 'Remove this wallpaper?', message: 'It will be removed from MACOS X PRO (your original file is not touched).', confirm: 'Remove', danger: true })) { await api.invoke('wallpapers:remove', w.path); void reload(); } }}><Trash2 size={12} /></button>}
            </div>
          ))}
          {list.length === 0 && <div className="muted col-span-full p-6 text-center">{cat === 'custom' ? 'Click “Add Pictures…” to import your own wallpapers.' : 'Nothing here.'}</div>}
        </div>
      </div>
    </Window>
  );
}
