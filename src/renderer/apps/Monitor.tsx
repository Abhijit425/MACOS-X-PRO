import { useEffect, useMemo, useState } from 'react';
import { Cpu, MonitorSmartphone, MemoryStick, HardDrive, Network, Battery, Thermometer, List } from 'lucide-react';
import type { Metrics, ProcessInfo, SysInfo } from '@shared/types';
import { Window } from '../components/Window';
import { api, openApp } from '../lib/api';
import { useHistory, useMetrics, useInvoke } from '../lib/hooks';
import { bytes, rate } from '../lib/format';
import { Spark, Ring } from '../desktop/widgets';

const TABS = [['cpu', 'CPU', Cpu], ['gpu', 'GPU', MonitorSmartphone], ['memory', 'Memory', MemoryStick], ['disk', 'Disk', HardDrive], ['network', 'Network', Network], ['battery', 'Energy', Battery], ['processes', 'Processes', List]] as const;
type Tab = (typeof TABS)[number][0];

export default function Monitor() {
  const m = useMetrics();
  const [tab, setTab] = useState<Tab>('cpu');
  const info = useInvoke<SysInfo>('sys:info');
  const cpuH = useHistory(m?.cpu.load, 90);
  const g = m?.gpu.find((x) => x.load !== null) || m?.gpu[0];
  const gpuH = useHistory(g?.load ?? undefined, 90);
  const memH = useHistory(m ? (m.mem.used / m.mem.total) * 100 : undefined, 90);
  const rxH = useHistory(m?.net.rx, 90), txH = useHistory(m?.net.tx, 90);

  const side = (
    <div className="space-y-[2px] pt-1">
      {TABS.map(([k, label, Icon]) => {
        const val = k === 'cpu' ? m && `${Math.round(m.cpu.load)}%` : k === 'gpu' ? g?.load !== null && g?.load !== undefined ? `${Math.round(g.load)}%` : '' : k === 'memory' ? m && `${Math.round((m.mem.used / m.mem.total) * 100)}%` : k === 'network' ? m && rate(m.net.rx) : k === 'battery' ? m?.battery.hasBattery ? `${Math.round(m.battery.percent)}%` : '' : '';
        return <button key={k} onClick={() => setTab(k)} className={`sidebar-item w-full ${tab === k ? 'active' : ''}`}><Icon size={15} className="opacity-70" /><span className="flex-1 text-left">{label}</span><span className="text-[11px] muted tabular-nums">{val || ''}</span></button>;
      })}
      <div className="section-label pt-4">This PC</div>
      <div className="px-3 text-[11px] muted leading-relaxed">{info.data ? <>{info.data.cpu}<br />{info.data.gpus.join(' · ')}<br />{bytes(info.data.memTotal, 0)} RAM<br />{info.data.os} {info.data.release}</> : '…'}</div>
    </div>
  );

  return (
    <Window title="Activity Monitor" sidebar={side} sidebarWidth={230}>
      <div className="h-full overflow-y-auto p-5">
        {!m && tab !== 'processes' && <div className="muted">Collecting live system data…</div>}
        {m && tab === 'cpu' && (
          <Panel title="CPU" value={`${m.cpu.load.toFixed(1)}%`} sub={`${m.cpu.model} · ${m.cpu.cores.length} logical processors · ${(m.cpu.speed / 1000).toFixed(2)} GHz`}>
            <Chart data={cpuH} color="#30d158" />
            <div className="grid gap-2 mt-4" style={{ gridTemplateColumns: `repeat(${Math.min(8, m.cpu.cores.length)}, minmax(0,1fr))` }}>
              {m.cpu.cores.map((c, i) => <div key={i} className="tile p-2"><div className="text-[10.5px] muted">Core {i}</div><div className="h-[38px] flex items-end mt-1"><div className="w-full rounded-sm bg-[#30d158]" style={{ height: `${Math.max(2, c)}%`, opacity: 0.85 }} /></div><div className="text-[11px] tabular-nums mt-1">{Math.round(c)}%</div></div>)}
            </div>
            <Stat icon={<Thermometer size={14} />} label="CPU temperature" value={m.cpu.temp ? `${Math.round(m.cpu.temp)}°C` : 'Not exposed by this laptop’s firmware to Windows (requires vendor tools)'} />
          </Panel>
        )}
        {m && tab === 'gpu' && (
          <div className="space-y-5">
            {m.gpu.length === 0 && <div className="muted">GPU metrics are turned off in Settings › Performance, or no GPU was detected.</div>}
            {m.gpu.map((x, i) => (
              <Panel key={i} title={x.model} value={x.load !== null ? `${Math.round(x.load)}%` : '—'} sub={x.load === null ? 'Windows does not expose live utilisation for this adapter without vendor tools. NVIDIA GPUs report through nvidia-smi.' : 'Live data from the NVIDIA driver (nvidia-smi)'}>
                {x.load !== null && i === m.gpu.findIndex((y) => y.load !== null) && <Chart data={gpuH} color="#bf5af2" />}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <Stat label="Dedicated memory" value={x.memUsed !== null && x.memTotal ? `${bytes(x.memUsed)} / ${bytes(x.memTotal)}` : '—'} />
                  <Stat label="Temperature" value={x.temp !== null ? `${x.temp}°C` : '—'} />
                  <Stat label="Utilisation" value={x.load !== null ? `${x.load}%` : '—'} />
                </div>
              </Panel>
            ))}
          </div>
        )}
        {m && tab === 'memory' && (
          <Panel title="Memory" value={`${bytes(m.mem.used)} of ${bytes(m.mem.total, 0)}`} sub={`${((m.mem.used / m.mem.total) * 100).toFixed(1)}% in use`}>
            <Chart data={memH} color="#0a84ff" />
            <div className="grid grid-cols-3 gap-3 mt-3"><Stat label="In use" value={bytes(m.mem.used)} /><Stat label="Available" value={bytes(m.mem.total - m.mem.used)} /><Stat label="Page file used" value={m.mem.swapTotal ? `${bytes(m.mem.swapUsed)} / ${bytes(m.mem.swapTotal)}` : '—'} /></div>
          </Panel>
        )}
        {m && tab === 'disk' && (
          <Panel title="Storage" value={`${m.disks.length} volume${m.disks.length === 1 ? '' : 's'}`}>
            <div className="space-y-3">
              {m.disks.map((d) => { const p = (d.used / d.size) * 100; return (
                <div key={d.mount} className="tile p-4 flex items-center gap-4"><Ring value={p} size={60} color={p > 90 ? '#ff453a' : '#5e5ce6'} /><div className="flex-1"><div className="font-semibold">{d.mount} <span className="muted font-normal text-[12px]">{d.fs}</span></div><div className="text-[12px] muted">{bytes(d.used)} used · {bytes(d.size - d.used)} free · {bytes(d.size, 0)} total</div></div><button className="btn text-[12px]" onClick={() => void openApp('finder', { path: d.mount })}>Open</button></div>
              ); })}
            </div>
          </Panel>
        )}
        {m && tab === 'network' && (
          <Panel title="Network" value={`↓ ${rate(m.net.rx)}  ↑ ${rate(m.net.tx)}`} sub={m.net.iface ? `Interface: ${m.net.iface}` : undefined}>
            <div className="relative"><Chart data={rxH} color="#0a84ff" max={Math.max(1024, ...rxH, ...txH)} /><div className="absolute inset-0"><Chart data={txH} color="#ff9f0a" max={Math.max(1024, ...rxH, ...txH)} fill={false} /></div></div>
            <div className="flex gap-4 text-[12px] mt-2"><span className="text-[#0a84ff]">● Received</span><span className="text-[#ff9f0a]">● Sent</span></div>
          </Panel>
        )}
        {m && tab === 'battery' && (
          <Panel title="Energy" value={m.battery.hasBattery ? `${Math.round(m.battery.percent)}%` : 'No battery'}>
            {m.battery.hasBattery ? (
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Status" value={m.battery.charging ? 'Charging' : m.battery.acConnected ? 'Plugged in' : 'On battery'} />
                <Stat label="Time remaining" value={m.battery.timeRemaining ? `${Math.floor(m.battery.timeRemaining / 60)}h ${m.battery.timeRemaining % 60}m` : '—'} />
                <Stat label="Health" value={m.battery.health !== null ? `${m.battery.health}%` : 'Not reported'} />
                <Stat label="Full charge capacity" value={m.battery.maxCapacity ? `${m.battery.maxCapacity} mWh` : '—'} />
                <Stat label="Design capacity" value={m.battery.designedCapacity ? `${m.battery.designedCapacity} mWh` : '—'} />
                <Stat label="Cycle count" value={m.battery.cycleCount ? String(m.battery.cycleCount) : 'Not reported'} />
              </div>
            ) : <div className="muted">This PC is running on mains power.</div>}
          </Panel>
        )}
        {tab === 'processes' && <Processes />}
      </div>
    </Window>
  );
}

function Panel({ title, value, sub, children }: { title: string; value: string; sub?: string; children: React.ReactNode }) {
  return <div><div className="flex items-baseline justify-between"><div className="text-[20px] font-semibold">{title}</div><div className="text-[20px] font-light tabular-nums">{value}</div></div>{sub && <div className="text-[12px] muted mb-3">{sub}</div>}<div className="mt-2">{children}</div></div>;
}
function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="tile p-3 mt-3"><div className="text-[11px] muted flex items-center gap-1">{icon}{label}</div><div className="text-[13.5px] mt-1">{value}</div></div>;
}
function Chart({ data, color, max = 100, fill = true }: { data: number[]; color: string; max?: number; fill?: boolean }) {
  return <div className="tile p-2" style={fill ? undefined : { background: 'transparent', border: 'none' }}><Spark data={data.length < 2 ? [0, 0] : data} color={color} height={140} max={max} fill={fill} /></div>;
}

function Processes() {
  const [p, setP] = useState<ProcessInfo[] | null>(null);
  useEffect(() => { let alive = true; const l = () => api.invoke<ProcessInfo[]>('processes').then((x) => alive && setP(x)).catch(() => undefined); void l(); const t = setInterval(l, 3000); return () => { alive = false; clearInterval(t); }; }, []);
  const top = useMemo(() => (p || []).slice(0, 40), [p]);
  return (
    <div>
      <div className="flex justify-between items-center mb-3"><div className="text-[20px] font-semibold">Top processes</div><button className="btn text-[12px]" onClick={() => void openApp('taskmanager')}>Open Task Manager</button></div>
      <div className="tile overflow-hidden">
        {top.map((x, i) => <div key={x.pid} className={`grid grid-cols-[1fr_80px_100px_70px] px-3 py-[5px] text-[12.5px] tabular-nums ${i % 2 ? 'bg-[rgb(var(--fg)/.03)]' : ''}`}><span className="truncate">{x.name}</span><span className="text-right">{x.cpu.toFixed(1)}%</span><span className="text-right">{bytes(x.mem)}</span><span className="text-right muted">{x.pid}</span></div>)}
        {!p && <div className="p-4 muted">Loading…</div>}
      </div>
    </div>
  );
}
export type { Metrics };
