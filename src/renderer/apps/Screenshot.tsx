import { useEffect, useState } from 'react';
import { Monitor, Crop, AppWindow, FolderOpen, Timer } from 'lucide-react';
import { Window } from '../components/Window';
import { api, thumbUrl } from '../lib/api';
import { useSettings } from '../lib/hooks';
import { Segmented, useToast } from '../components/ui';
import { basename } from '../lib/format';

export default function Screenshot() {
  const [s] = useSettings();
  const [delay, setDelay] = useState<'0' | '3' | '5' | '10'>('0');
  const [wins, setWins] = useState<{ id: string; name: string; thumb: string }[] | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const toast = useToast();
  const loadRecent = () => void api.invoke<string[]>('shot:recent').then(setRecent).catch(() => undefined);
  useEffect(loadRecent, []);
  const run = async (fn: () => Promise<unknown>) => {
    await api.invoke('win:minimize');
    await new Promise((r) => setTimeout(r, 450));
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); }
    setTimeout(loadRecent, 1200 + Number(delay) * 1000);
  };
  return (
    <Window title="Screenshot">
      <div className="h-full overflow-y-auto p-5">
        <div className="grid grid-cols-3 gap-3">
          <button className="tile p-4 flex flex-col items-center gap-2 hoverable" onClick={() => run(() => api.invoke('shot:full', { delay: Number(delay) }))}><Monitor size={26} /><span className="text-[12.5px]">Entire Screen</span><span className="kbd">{s.shortcuts.screenshotFull}</span></button>
          <button className="tile p-4 flex flex-col items-center gap-2 hoverable" onClick={() => run(() => api.invoke('shot:region', { delay: Number(delay) }))}><Crop size={26} /><span className="text-[12.5px]">Selected Area</span><span className="kbd">{s.shortcuts.screenshotRegion}</span></button>
          <button className="tile p-4 flex flex-col items-center gap-2 hoverable" onClick={() => void api.invoke<typeof wins>('shot:windows').then(setWins)}><AppWindow size={26} /><span className="text-[12.5px]">A Window</span><span className="text-[11px] muted">choose below</span></button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2 text-[12.5px]"><Timer size={14} /> Delay <Segmented size="sm" value={delay} onChange={setDelay} options={[{ value: '0', label: 'None' }, { value: '3', label: '3s' }, { value: '5', label: '5s' }, { value: '10', label: '10s' }]} /></div>
          <button className="btn text-[12px]" onClick={() => void api.invoke('shot:folder')}><FolderOpen size={13} /> Pictures › Screenshots</button>
        </div>
        {wins && (
          <div className="mt-4">
            <div className="text-[12px] font-semibold mb-2">Pick a window</div>
            <div className="grid grid-cols-3 gap-2">
              {wins.map((w) => <button key={w.id} className="tile p-2 hoverable text-left" onClick={() => { setWins(null); void run(() => api.invoke('shot:window', w.id)); }}><img src={w.thumb} className="w-full aspect-video object-contain rounded" alt="" /><div className="text-[11.5px] truncate mt-1">{w.name}</div></button>)}
            </div>
          </div>
        )}
        <div className="mt-5 text-[12px] font-semibold mb-2">Recent screenshots</div>
        <div className="grid grid-cols-4 gap-2">
          {recent.map((p) => <button key={p} className="tile p-1 hoverable" title={basename(p)} onClick={() => void api.invoke('app:open', 'photos', { path: p })}><img src={thumbUrl(p, 240)} className="w-full aspect-video object-cover rounded" alt="" /></button>)}
          {!recent.length && <div className="col-span-4 muted text-[12px]">Screenshots are saved to Pictures\Screenshots and copied to the clipboard.</div>}
        </div>
      </div>
    </Window>
  );
}
