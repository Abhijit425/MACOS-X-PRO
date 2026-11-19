import { useMemo, useState } from 'react';
import { Pin, PinOff, Trash2, Copy, ClipboardList, Search, Image as ImageIcon, Type } from 'lucide-react';
import type { ClipItem } from '@shared/types';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { useInvoke, useSettings } from '../lib/hooks';
import { relTime } from '../lib/format';
import { Empty, Toggle, useDialog, useToast } from '../components/ui';

export default function Clipboard() {
  const { data, setData } = useInvoke<ClipItem[]>('clips:list', [], [], 'clipboard:changed');
  const [s, update] = useSettings();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'text' | 'image' | 'pinned'>('all');
  const toast = useToast();
  const dialog = useDialog();
  const items = useMemo(() => (data || []).filter((c) => (filter === 'all' || (filter === 'pinned' ? c.pinned : c.kind === filter)) && (!q || c.text.toLowerCase().includes(q.toLowerCase()))), [data, q, filter]);
  const copy = async (c: ClipItem) => { await api.invoke('clips:copy', c.id); toast('Copied to clipboard'); };
  return (
    <Window title="Clipboard" toolbar={<>
      <span className="text-[12px] muted mr-1">History</span><Toggle small checked={s.clipboardHistory} onChange={(v) => update({ clipboardHistory: v })} />
      <button className="icon-btn ml-1" title="Clear unpinned" onClick={async () => { if (await dialog.confirm({ title: 'Clear clipboard history?', message: 'Pinned items are kept.', confirm: 'Clear', danger: true })) { await api.invoke('clips:clear'); setData((data || []).filter((c) => c.pinned)); } }}><Trash2 size={15} /></button>
    </>}>
      <div className="h-full flex flex-col">
        <div className="p-3 flex gap-2 items-center border-b border-[rgb(var(--stroke)/var(--stroke-a))]">
          <div className="flex items-center gap-2 field flex-1 !py-[4px]"><Search size={14} className="opacity-50" /><input autoFocus className="bg-transparent outline-none flex-1" placeholder="Search clipboard" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {(['all', 'text', 'image', 'pinned'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-2 py-[3px] rounded-md text-[12px] capitalize ${filter === f ? 'bg-[rgb(var(--accent))] text-white' : 'bg-[rgb(var(--fg)/.06)]'}`}>{f}</button>)}
        </div>
        {!s.clipboardHistory && <div className="m-3 tile p-3 text-[12px] muted">Clipboard history is off. Nothing new is being recorded.</div>}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? <Empty icon={<ClipboardList size={40} />} title="Nothing here yet" sub="Text and images you copy anywhere in Windows appear here. Click an item to copy it again." /> : items.map((c) => (
            <div key={c.id} className="tile p-3 group cursor-pointer hoverable flex gap-3" onClick={() => void copy(c)}>
              <div className="w-6 pt-[2px] muted">{c.kind === 'image' ? <ImageIcon size={15} /> : <Type size={15} />}</div>
              <div className="flex-1 min-w-0">
                {c.kind === 'image' && c.image ? <img src={c.image} className="max-h-[120px] rounded-md" alt="" /> : <div className="text-[12.5px] whitespace-pre-wrap break-words line-clamp-4 font-mono">{c.text}</div>}
                <div className="text-[11px] muted mt-1">{relTime(c.ts)}{c.kind === 'text' ? ` · ${c.text.length} chars` : ` · ${c.text}`}</div>
              </div>
              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" title="Copy" onClick={() => void copy(c)}><Copy size={13} /></button>
                <button className="icon-btn" title={c.pinned ? 'Unpin' : 'Pin'} onClick={() => void api.invoke('clips:pin', c.id, !c.pinned)}>{c.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
                <button className="icon-btn" title="Delete" onClick={() => void api.invoke('clips:delete', c.id)}><Trash2 size={13} /></button>
              </div>
              {c.pinned && <Pin size={12} className="text-[rgb(var(--accent))] shrink-0 group-hover:hidden" />}
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}
