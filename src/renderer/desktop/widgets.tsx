import { useEffect, useMemo, useState, ReactNode } from 'react';
import { Cpu, MemoryStick, HardDrive, Battery, BatteryCharging, ArrowDown, ArrowUp, Gauge, Target, Plus, Check, X, Play, Square, CalendarDays, MonitorSmartphone } from 'lucide-react';
import type { CalendarEvent, Metrics, WidgetInstance, WidgetType } from '@shared/types';
import { api, openApp } from '../lib/api';
import { useHistory, useInvoke, useNow, useSettings, useEvent } from '../lib/hooks';
import { bytes, hm, rate, timeStr } from '../lib/format';
import { useWeather, wmoLabel } from '../lib/weather';
import { WeatherIcon } from '../components/WeatherIcon';

export const WIDGET_CATALOG: { type: WidgetType; name: string; w: number; h: number; metric?: boolean }[] = [
  { type: 'clock', name: 'Clock', w: 320, h: 170 },
  { type: 'calendar', name: 'Calendar', w: 320, h: 300 },
  { type: 'weather', name: 'Weather', w: 320, h: 170 },
  { type: 'performance', name: 'System Performance', w: 340, h: 250, metric: true },
  { type: 'cpu', name: 'CPU', w: 220, h: 150, metric: true },
  { type: 'gpu', name: 'GPU', w: 220, h: 150, metric: true },
  { type: 'ram', name: 'Memory', w: 220, h: 150, metric: true },
  { type: 'storage', name: 'Storage', w: 300, h: 190, metric: true },
  { type: 'battery', name: 'Battery', w: 220, h: 150, metric: true },
  { type: 'network', name: 'Network', w: 260, h: 150, metric: true },
  { type: 'productivity', name: 'Daily Productivity', w: 340, h: 260 },
];
export const isMetricWidget = (t: WidgetType) => !!WIDGET_CATALOG.find((c) => c.type === t)?.metric;

export function Card({ children, className = '', title, icon, onTitle }: { children: ReactNode; className?: string; title?: string; icon?: ReactNode; onTitle?: () => void }) {
  return (
    <div className={`h-full w-full glass rounded-[22px] p-4 flex flex-col overflow-hidden ${className}`}>
      {title && <button onClick={onTitle} className="flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-wide muted mb-2 text-left">{icon}{title}</button>}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export function Spark({ data, max = 100, color = 'rgb(var(--accent))', height = 40, fill = true }: { data: number[]; max?: number; color?: string; height?: number; fill?: boolean }) {
  const w = 200;
  if (data.length < 2) return <div style={{ height }} />;
  const m = Math.max(max, ...data, 1);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - (v / m) * (height - 2) - 1]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      {fill && <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity={0.18} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = 'rgb(var(--accent))', children }: { value: number | null; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--fg) / .12)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold tabular-nums">{children ?? (value === null ? '—' : `${Math.round(v)}%`)}</div>
    </div>
  );
}

const loadColor = (v: number) => (v > 85 ? '#ff453a' : v > 60 ? '#ff9f0a' : '#30d158');

function ClockW({ w }: { w: WidgetInstance }) {
  const [s] = useSettings();
  const now = useNow(1000);
  if (w.options.style === 'analog') {
    const sec = now.getSeconds(), min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
    return (
      <Card className="items-center justify-center">
        <div className="h-full flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="h-full max-h-[130px]">
            <circle cx="50" cy="50" r="47" fill="rgb(var(--surface) / .8)" stroke="rgb(var(--fg) / .15)" />
            {Array.from({ length: 12 }).map((_, i) => <line key={i} x1="50" y1="8" x2="50" y2={i % 3 ? 12 : 15} stroke="currentColor" strokeWidth={i % 3 ? 1.2 : 2.4} transform={`rotate(${i * 30} 50 50)`} opacity=".8" />)}
            <line x1="50" y1="50" x2="50" y2="27" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" transform={`rotate(${hr * 30} 50 50)`} />
            <line x1="50" y1="50" x2="50" y2="15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${min * 6} 50 50)`} />
            <line x1="50" y1="58" x2="50" y2="12" stroke="#ff9f0a" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${sec * 6} 50 50)`} />
            <circle cx="50" cy="50" r="2.4" fill="#ff9f0a" />
          </svg>
          <div><div className="text-[13px] muted">{now.toLocaleDateString([], { weekday: 'long' })}</div><div className="text-[20px] font-semibold">{now.toLocaleDateString([], { month: 'long', day: 'numeric' })}</div></div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="justify-center">
      <div className="flex flex-col justify-center h-full">
        <div className="font-display font-extralight tabular-nums leading-none tracking-tight" style={{ fontSize: Math.min(72, w.w / 4.4) }}>{timeStr(now, s.clock24h, !!w.options.seconds)}</div>
        <div className="mt-2 text-[15px] muted">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </Card>
  );
}

function CalendarW() {
  const now = useNow(60000);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const { data: events } = useInvoke<CalendarEvent[]>('events:list', [dayStart.getTime(), dayStart.getTime() + 86400000 * 7], [dayStart.getTime()], 'events:changed');
  return (
    <Card>
      <button className="flex items-baseline justify-between w-full mb-2" onClick={() => void openApp('calendar')}>
        <span className="text-[#ff453a] font-semibold text-[13px] uppercase">{now.toLocaleDateString([], { month: 'long' })}</span><span className="muted text-[12px]">{now.getFullYear()}</span>
      </button>
      <div className="grid grid-cols-7 text-center text-[11px] gap-y-[3px]">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="muted font-semibold">{d}</div>)}
        {Array.from({ length: 42 }).map((_, i) => {
          const d = new Date(start); d.setDate(start.getDate() + i);
          const isToday = d.toDateString() === now.toDateString();
          const inMonth = d.getMonth() === now.getMonth();
          if (i >= 35 && d.getMonth() !== now.getMonth()) return null;
          return <div key={i} className={`mx-auto w-[22px] h-[22px] flex items-center justify-center rounded-full tabular-nums ${isToday ? 'bg-[#ff453a] text-white font-semibold' : inMonth ? '' : 'opacity-30'}`}>{d.getDate()}</div>;
        })}
      </div>
      <div className="mt-2 space-y-1">
        {(events || []).filter((e) => e.end > Date.now()).slice(0, 2).map((e) => (
          <div key={e.id} className="flex gap-2 text-[11.5px]"><span className="w-[3px] rounded-full" style={{ background: e.color }} /><span className="truncate flex-1">{e.title}</span><span className="muted">{new Date(e.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>
        ))}
      </div>
    </Card>
  );
}

function WeatherW() {
  const wx = useWeather();
  if (!wx.city) return <Card title="Weather"><button className="text-[12px] muted text-left" onClick={() => void openApp('weather')}>Choose your city in the Weather app to show the forecast.</button></Card>;
  if (!wx.data) return <Card title={wx.city.name}><div className="muted text-[12px]">{wx.error ? `Unavailable: ${wx.error}` : 'Loading…'}</div></Card>;
  const d = wx.data;
  return (
    <button className="h-full w-full text-left" onClick={() => void openApp('weather')}>
      <div className="h-full w-full rounded-[22px] p-4 text-white flex flex-col overflow-hidden shadow-xl" style={{ background: d.current.isDay ? 'linear-gradient(160deg,#4a9cf0,#2a63c4)' : 'linear-gradient(160deg,#1b2650,#0b1028)' }}>
        <div className="flex justify-between"><div><div className="font-semibold text-[14px]">{wx.city.name}</div><div className="text-[44px] font-light leading-none mt-1">{Math.round(d.current.temp)}°</div></div><WeatherIcon code={d.current.code} isDay={d.current.isDay} size={36} /></div>
        <div className="text-[12px] mt-auto opacity-90">{wmoLabel(d.current.code)}<br />H:{Math.round(d.daily[0].max)}° L:{Math.round(d.daily[0].min)}°</div>
      </div>
    </button>
  );
}

function PerformanceW({ m }: { m: Metrics | null }) {
  const cpuHist = useHistory(m?.cpu.load, 40);
  const g = m?.gpu.find((x) => x.load !== null) || m?.gpu[0];
  const ramPct = m ? (m.mem.used / m.mem.total) * 100 : null;
  return (
    <Card title="System Performance" icon={<Gauge size={12} />} onTitle={() => void openApp('monitor')}>
      <div className="flex justify-around">
        <div className="flex flex-col items-center gap-1"><Ring value={m?.cpu.load ?? null} color={loadColor(m?.cpu.load || 0)} /><span className="text-[11px] muted">CPU</span></div>
        <div className="flex flex-col items-center gap-1"><Ring value={g?.load ?? null} color="#bf5af2" /><span className="text-[11px] muted">GPU</span></div>
        <div className="flex flex-col items-center gap-1"><Ring value={ramPct} color="#0a84ff" /><span className="text-[11px] muted">RAM</span></div>
      </div>
      <div className="mt-2"><Spark data={cpuHist} color={loadColor(m?.cpu.load || 0)} height={34} /></div>
      <div className="flex justify-between text-[11px] muted mt-1 tabular-nums"><span><ArrowDown size={10} className="inline" /> {m ? rate(m.net.rx) : '—'}</span><span><ArrowUp size={10} className="inline" /> {m ? rate(m.net.tx) : '—'}</span><span>{m?.cpu.temp ? `${Math.round(m.cpu.temp)}°C` : g?.temp ? `GPU ${g.temp}°C` : ''}</span></div>
    </Card>
  );
}

function MetricW({ m, kind }: { m: Metrics | null; kind: 'cpu' | 'gpu' | 'ram' }) {
  const g = m?.gpu.find((x) => x.load !== null) || m?.gpu[0];
  const value = kind === 'cpu' ? m?.cpu.load : kind === 'gpu' ? g?.load ?? null : m ? (m.mem.used / m.mem.total) * 100 : null;
  const hist = useHistory(value ?? undefined, 40);
  const title = kind === 'cpu' ? 'CPU' : kind === 'gpu' ? 'GPU' : 'Memory';
  const sub = kind === 'cpu' ? m?.cpu.model : kind === 'gpu' ? (g ? `${g.model}${g.temp ? ` · ${g.temp}°C` : ''}` : 'No GPU data') : m ? `${bytes(m.mem.used)} of ${bytes(m.mem.total)}` : '';
  const color = kind === 'gpu' ? '#bf5af2' : kind === 'ram' ? '#0a84ff' : loadColor(value || 0);
  return (
    <Card title={title} icon={kind === 'ram' ? <MemoryStick size={12} /> : kind === 'gpu' ? <MonitorSmartphone size={12} /> : <Cpu size={12} />} onTitle={() => void openApp('monitor')}>
      <div className="text-[30px] font-light tabular-nums leading-none">{value === null || value === undefined ? '—' : `${Math.round(value)}%`}</div>
      <div className="text-[11px] muted truncate mt-1">{value === null && kind === 'gpu' ? 'Utilisation not exposed for this GPU' : sub}</div>
      <div className="mt-2"><Spark data={hist} color={color} height={30} /></div>
    </Card>
  );
}

function StorageW({ m }: { m: Metrics | null }) {
  return (
    <Card title="Storage" icon={<HardDrive size={12} />} onTitle={() => void openApp('finder', { place: 'computer' })}>
      <div className="space-y-3 overflow-y-auto h-full pr-1">
        {(m?.disks || []).map((d) => {
          const p = (d.used / d.size) * 100;
          return (
            <div key={d.mount}>
              <div className="flex justify-between text-[12px]"><span className="font-semibold">{d.mount}</span><span className="muted tabular-nums">{bytes(d.size - d.used)} free of {bytes(d.size, 0)}</span></div>
              <div className="h-[7px] rounded-full mt-1 overflow-hidden" style={{ background: 'rgb(var(--fg) / .12)' }}><div className="h-full rounded-full" style={{ width: `${p}%`, background: p > 90 ? '#ff453a' : 'linear-gradient(90deg,#0a84ff,#5e5ce6)' }} /></div>
            </div>
          );
        })}
        {!m?.disks.length && <div className="muted text-[12px]">Reading drives…</div>}
      </div>
    </Card>
  );
}

function BatteryW({ m }: { m: Metrics | null }) {
  const b = m?.battery;
  return (
    <Card title="Battery" icon={b?.charging ? <BatteryCharging size={12} /> : <Battery size={12} />}>
      {b?.hasBattery ? (
        <div className="flex items-center gap-4 h-full">
          <Ring value={b.percent} size={74} color={b.percent <= 20 && !b.charging ? '#ff453a' : '#30d158'} />
          <div className="text-[12px] leading-relaxed"><div className="font-semibold">{b.charging ? 'Charging' : b.acConnected ? 'Plugged in' : 'On battery'}</div>
            {b.timeRemaining && !b.acConnected ? <div className="muted">{Math.floor(b.timeRemaining / 60)}h {b.timeRemaining % 60}m left</div> : null}
            {b.health !== null && <div className="muted">Health {b.health}%</div>}</div>
        </div>
      ) : <div className="muted text-[12px]">{m ? 'No battery detected' : 'Reading…'}</div>}
    </Card>
  );
}

function NetworkW({ m }: { m: Metrics | null }) {
  const rx = useHistory(m?.net.rx, 40), tx = useHistory(m?.net.tx, 40);
  const max = Math.max(1024, ...rx, ...tx);
  return (
    <Card title="Network" icon={<ArrowDown size={12} />}>
      <div className="flex justify-between text-[13px] tabular-nums"><span className="text-[#0a84ff]"><ArrowDown size={12} className="inline" /> {m ? rate(m.net.rx) : '—'}</span><span className="text-[#ff9f0a]"><ArrowUp size={12} className="inline" /> {m ? rate(m.net.tx) : '—'}</span></div>
      <div className="relative mt-2"><Spark data={rx} max={max} color="#0a84ff" height={46} /><div className="absolute inset-0"><Spark data={tx} max={max} color="#ff9f0a" height={46} fill={false} /></div></div>
    </Card>
  );
}

function ProductivityW() {
  const { data: act, reload } = useInvoke<{ day: string; activeSeconds: number; focusSeconds: number }[]>('activity', [7]);
  const { data: tasks, setData: setTasks } = useInvoke<{ id: string; text: string; done: boolean }[]>('tasks:list');
  const { data: focus, setData: setFocus } = useInvoke<{ remaining: number; duration: number } | null>('focus:state', [], [], 'focus:changed');
  const [text, setText] = useState('');
  const now = useNow(1000);
  useEffect(() => { const t = setInterval(() => void reload(), 60000); return () => clearInterval(t); }, [reload]);
  useEvent('focus:changed', () => void reload());
  const today = act?.find((a) => a.day === new Date().toISOString().slice(0, 10));
  const endsAt = useMemo(() => (focus ? Date.now() + focus.remaining : 0), [focus]);
  const rem = focus ? Math.max(0, endsAt - now.getTime()) : 0;
  const done = (tasks || []).filter((t) => t.done).length;
  return (
    <Card title="Today" icon={<Target size={12} />}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="tile py-2"><div className="text-[17px] font-semibold tabular-nums">{hm(today?.activeSeconds || 0)}</div><div className="text-[10.5px] muted">Screen time</div></div>
        <div className="tile py-2"><div className="text-[17px] font-semibold tabular-nums">{hm(today?.focusSeconds || 0)}</div><div className="text-[10.5px] muted">Focused</div></div>
        <div className="tile py-2"><div className="text-[17px] font-semibold tabular-nums">{done}/{tasks?.length || 0}</div><div className="text-[10.5px] muted">Tasks</div></div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {focus ? (
          <button className="btn flex-1 !py-1 text-[12px]" onClick={() => void api.invoke('focus:stop').then(() => setFocus(null))}><Square size={11} /> {Math.floor(rem / 60000)}:{String(Math.floor((rem % 60000) / 1000)).padStart(2, '0')} — Stop focus</button>
        ) : (<>
          <button className="btn flex-1 !py-1 text-[12px]" onClick={() => void api.invoke('focus:start', 25).then(() => api.invoke('focus:state').then((f) => setFocus(f as never)))}><Play size={11} /> Focus 25m</button>
          <button className="btn !py-1 text-[12px]" onClick={() => void api.invoke('focus:start', 50).then(() => api.invoke('focus:state').then((f) => setFocus(f as never)))}>50m</button>
        </>)}
      </div>
      <form className="flex gap-1 mt-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void api.invoke<typeof tasks>('tasks:add', text.trim()).then((t) => setTasks(t)); setText(''); }}>
        <input className="field flex-1 !py-[3px] text-[12px]" placeholder="Add a task…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn" type="submit"><Plus size={14} /></button>
      </form>
      <div className="mt-1 overflow-y-auto" style={{ maxHeight: 'calc(100% - 150px)' }}>
        {(tasks || []).map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-[2px] group text-[12.5px]">
            <button onClick={() => void api.invoke<typeof tasks>('tasks:toggle', t.id).then(setTasks)} className="w-[15px] h-[15px] rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: 'rgb(var(--fg)/.35)', background: t.done ? 'rgb(var(--accent))' : 'transparent' }}>{t.done && <Check size={10} color="white" />}</button>
            <span className={`flex-1 truncate ${t.done ? 'line-through muted' : ''}`}>{t.text}</span>
            <button className="opacity-0 group-hover:opacity-60" onClick={() => void api.invoke<typeof tasks>('tasks:delete', t.id).then(setTasks)}><X size={12} /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function WidgetBody({ w, metrics }: { w: WidgetInstance; metrics: Metrics | null }) {
  switch (w.type) {
    case 'clock': return <ClockW w={w} />;
    case 'calendar': return <CalendarW />;
    case 'weather': return <WeatherW />;
    case 'performance': return <PerformanceW m={metrics} />;
    case 'cpu': return <MetricW m={metrics} kind="cpu" />;
    case 'gpu': return <MetricW m={metrics} kind="gpu" />;
    case 'ram': return <MetricW m={metrics} kind="ram" />;
    case 'storage': return <StorageW m={metrics} />;
    case 'battery': return <BatteryW m={metrics} />;
    case 'network': return <NetworkW m={metrics} />;
    case 'productivity': return <ProductivityW />;
  }
  return null;
}
export const useWidgetNames = () => useMemo(() => new Map(WIDGET_CATALOG.map((c) => [c.type, c.name])), []);
export { CalendarDays };
