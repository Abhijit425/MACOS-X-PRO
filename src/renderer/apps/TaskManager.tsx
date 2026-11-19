import { useEffect, useMemo, useState } from 'react';
import { Search, XCircle, RefreshCw, FolderOpen, ArrowUpDown } from 'lucide-react';
import type { ProcessInfo } from '@shared/types';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { bytes } from '../lib/format';
import { useContextMenu, useDialog, useToast, Spinner } from '../components/ui';

type SortKey = 'name' | 'cpu' | 'mem' | 'pid';

export default function TaskManager() {
  const [procs, setProcs] = useState<ProcessInfo[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'cpu', dir: -1 });
  const [sel, setSel] = useState<number | null>(null);
  const [grouped, setGrouped] = useState(true);
  const dialog = useDialog();
  const toast = useToast();
  const ctx = useContextMenu();

  useEffect(() => {
    let alive = true;
    const load = () => api.invoke<ProcessInfo[]>('processes').then((p) => alive && setProcs(p)).catch((e: Error) => toast(e.message, 'error'));
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [toast]);

  const rows = useMemo(() => {
    let list = procs || [];
    if (grouped) {
      const m = new Map<string, ProcessInfo & { count: number; pids: number[] }>();
      for (const p of list) {
        const g = m.get(p.name);
        if (g) { g.cpu += p.cpu; g.mem += p.mem; g.count++; g.pids.push(p.pid); } else m.set(p.name, { ...p, count: 1, pids: [p.pid] });
      }
      list = [...m.values()];
    }
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || String(p.pid) === q);
    return [...list].sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
  }, [procs, q, sort, grouped]);

  const totals = useMemo(() => ({ cpu: (procs || []).reduce((a, p) => a + p.cpu, 0), mem: (procs || []).reduce((a, p) => a + p.mem, 0) }), [procs]);
  const endTask = async (p: ProcessInfo & { pids?: number[]; count?: number }) => {
    const pids = p.pids || [p.pid];
    const ok = await dialog.confirm({ title: `End “${p.name}”?`, message: `${pids.length > 1 ? `${pids.length} processes` : `PID ${p.pid}`} will be stopped. Any unsaved work in it will be lost.${/^(csrss|wininit|winlogon|services|lsass|smss|system|svchost|dwm|explorer)\.exe$/i.test(p.name) ? '\n\n⚠️ This is a Windows system process. Ending it may make Windows unstable.' : ''}`, confirm: 'End Task', danger: true });
    if (!ok) return;
    let failed = 0;
    for (const pid of pids) { try { await api.invoke('process:kill', pid); } catch { failed++; } }
    toast(failed ? `Couldn't end ${failed} process(es) — they may need administrator rights.` : `Ended ${p.name}`, failed ? 'error' : 'info');
  };
  const head = (k: SortKey, label: string, cls = '') => <button className={`flex items-center gap-1 ${cls}`} onClick={() => setSort((x) => ({ k, dir: x.k === k ? (x.dir === 1 ? -1 : 1) : k === 'name' ? 1 : -1 }))}>{label}{sort.k === k && <ArrowUpDown size={11} className="opacity-60" />}</button>;
  const selected = rows.find((r) => r.pid === sel);

  return (
    <Window title="Task Manager" toolbar={<>
      <div className="flex items-center gap-2 field !py-[3px] w-[220px]"><Search size={13} className="opacity-50" /><input className="bg-transparent outline-none flex-1 text-[12.5px]" placeholder="Search processes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <label className="flex items-center gap-1 text-[12px] ml-2"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group</label>
      <button className="btn btn-danger !py-1 text-[12px] ml-2" disabled={!selected} onClick={() => selected && void endTask(selected)}><XCircle size={13} /> End Task</button>
    </>}>
      <div className="h-full flex flex-col">
        <div className="grid grid-cols-[1fr_90px_110px_80px] gap-2 px-4 py-2 text-[11.5px] font-semibold muted border-b border-[rgb(var(--stroke)/var(--stroke-a))]">
          {head('name', 'Name')}{head('cpu', '% CPU', 'justify-end')}{head('mem', 'Memory', 'justify-end')}{head('pid', 'PID', 'justify-end')}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!procs ? <div className="p-8 flex justify-center"><Spinner /></div> : rows.map((p, i) => (
            <div key={`${p.name}-${p.pid}`} onClick={() => setSel(p.pid)} onDoubleClick={() => void endTask(p)}
              onContextMenu={(e) => { setSel(p.pid); ctx(e, [{ label: 'End Task', danger: true, onClick: () => void endTask(p) }, ...(p.path ? [{ label: 'Open File Location', icon: <FolderOpen size={13} />, onClick: () => void api.invoke('fs:reveal', p.path!.includes('.exe') ? p.path! : `${p.path}\\${p.name}`) }] : [])]); }}
              className={`grid grid-cols-[1fr_90px_110px_80px] gap-2 px-4 py-[5px] text-[12.5px] tabular-nums ${sel === p.pid ? 'bg-[rgb(var(--accent))] text-white' : i % 2 ? 'bg-[rgb(var(--fg)/.025)]' : ''}`}>
              <span className="truncate">{p.name}{'count' in p && (p as { count: number }).count > 1 ? <span className="opacity-60"> ({(p as { count: number }).count})</span> : null}</span>
              <span className="text-right">{p.cpu.toFixed(1)}</span><span className="text-right">{bytes(p.mem)}</span><span className="text-right opacity-70">{p.pid}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 text-[12px] border-t border-[rgb(var(--stroke)/var(--stroke-a))] muted">
          <span>{procs?.length || 0} processes</span><span>CPU {Math.min(100, totals.cpu).toFixed(0)}%</span><span>Memory {bytes(totals.mem)}</span>
          <span className="flex-1" /><RefreshCw size={12} /> updates every 3s
        </div>
      </div>
    </Window>
  );
}
