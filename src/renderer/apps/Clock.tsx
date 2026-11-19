import { useEffect, useState } from 'react';
import { Globe, AlarmClock, Timer, Hourglass, Plus, Trash2, Play, Pause, RotateCcw, Flag, X } from 'lucide-react';
import type { Alarm, TimerState } from '@shared/types';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { useInvoke, useNow, useSettings, useLocalStorage } from '../lib/hooks';
import { Toggle, Empty, useDialog } from '../components/ui';
import { duration } from '../lib/format';

const TZS = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') || ['UTC', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

export default function Clock() {
  const [tab, setTab] = useLocalStorage<'world' | 'alarms' | 'stopwatch' | 'timers'>('clock:tab', 'world');
  const tabs = [['world', 'World Clock', <Globe key="g" size={15} />], ['alarms', 'Alarms', <AlarmClock key="a" size={15} />], ['stopwatch', 'Stopwatch', <Timer key="s" size={15} />], ['timers', 'Timers', <Hourglass key="t" size={15} />]] as const;
  return (
    <Window title="Clock" toolbar={
      <div className="flex p-[2px] rounded-lg bg-[rgb(var(--fg)/.07)]">{tabs.map(([k, l, i]) => <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1 px-3 py-[3px] rounded-md text-[12.5px] ${tab === k ? 'bg-white dark:bg-white/20 shadow-sm' : ''}`}>{i}{l}</button>)}</div>
    }>
      <div className="h-full overflow-y-auto">{tab === 'world' ? <World /> : tab === 'alarms' ? <Alarms /> : tab === 'stopwatch' ? <Stopwatch /> : <Timers />}</div>
    </Window>
  );
}

function World() {
  const [s, update] = useSettings();
  const now = useNow(1000);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clocks = [{ city: 'Local', tz: local }, ...s.worldClocks];
  const offset = (tz: string) => {
    const a = new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime(), b = new Date(now.toLocaleString('en-US', { timeZone: local })).getTime();
    const h = Math.round((a - b) / 360000) / 10;
    return h === 0 ? 'Same time' : `${h > 0 ? '+' : ''}${h} hrs`;
  };
  return (
    <div className="p-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {clocks.map((c, i) => {
          const t = new Date(now.toLocaleString('en-US', { timeZone: c.tz }));
          return (
            <div key={c.tz + i} className="tile p-4 flex items-center gap-4 group relative">
              <Analog d={t} size={78} dark={t.getHours() < 6 || t.getHours() >= 19} />
              <div className="min-w-0"><div className="font-semibold truncate">{c.city}</div><div className="text-[12px] muted">{i === 0 ? c.tz : offset(c.tz)}</div><div className="text-[20px] font-light tabular-nums">{t.toLocaleTimeString([], { hour: s.clock24h ? '2-digit' : 'numeric', minute: '2-digit', hour12: !s.clock24h })}</div></div>
              {i > 0 && <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-60" onClick={() => update({ worldClocks: s.worldClocks.filter((_, j) => j !== i - 1) })}><X size={13} /></button>}
            </div>
          );
        })}
        <button className="tile p-4 flex items-center justify-center gap-2 hoverable muted" onClick={() => setAdding(true)}><Plus size={16} /> Add City</button>
      </div>
      {adding && (
        <div className="mt-4 tile p-3">
          <input autoFocus className="field w-full" placeholder="Search time zones (e.g. Paris, Kolkata, Los_Angeles)" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[200px] overflow-y-auto mt-2">
            {TZS.filter((t) => t.toLowerCase().includes(q.toLowerCase().replace(/ /g, '_'))).slice(0, 40).map((tz) => (
              <button key={tz} className="block w-full text-left px-2 py-1 rounded hoverable" onClick={() => { void update({ worldClocks: [...s.worldClocks, { city: tz.split('/').pop()!.replace(/_/g, ' '), tz }] }); setAdding(false); setQ(''); }}>{tz.replace(/_/g, ' ')}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Analog({ d, size, dark }: { d: Date; size: number; dark: boolean }) {
  const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r="48" fill={dark ? '#1c1c1e' : '#fff'} stroke="rgba(0,0,0,.15)" />
      {Array.from({ length: 12 }).map((_, i) => <line key={i} x1="50" y1="7" x2="50" y2="13" stroke={dark ? '#fff' : '#111'} strokeWidth={i % 3 ? 1.4 : 2.6} transform={`rotate(${i * 30} 50 50)`} />)}
      <line x1="50" y1="50" x2="50" y2="27" stroke={dark ? '#fff' : '#111'} strokeWidth="4" strokeLinecap="round" transform={`rotate(${h * 30} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="14" stroke={dark ? '#fff' : '#111'} strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${m * 6} 50 50)`} />
      <line x1="50" y1="58" x2="50" y2="11" stroke="#ff9f0a" strokeWidth="1.3" transform={`rotate(${s * 6} 50 50)`} />
      <circle cx="50" cy="50" r="2.6" fill="#ff9f0a" />
    </svg>
  );
}

function Alarms() {
  const { data: alarms, setData } = useInvoke<Alarm[]>('alarms:list', [], [], 'alarms:changed');
  const [time, setTime] = useState('07:00');
  const [label, setLabel] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const save = (a: Alarm[]) => { setData(a); void api.invoke('alarms:save', a); };
  return (
    <div className="p-6 max-w-[620px] mx-auto">
      <div className="tile p-4 flex flex-wrap items-end gap-3 mb-5">
        <label className="text-[12px] muted">Time<input type="time" className="field block mt-1 text-[15px]" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label className="text-[12px] muted flex-1 min-w-[160px]">Label<input className="field block mt-1 w-full" placeholder="Alarm" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="flex gap-1">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <button key={i} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} className={`w-7 h-7 rounded-full text-[11px] ${days.includes(i) ? 'bg-[rgb(var(--accent))] text-white' : 'bg-[rgb(var(--fg)/.08)]'}`}>{d}</button>)}</div>
        <button className="btn btn-primary" onClick={() => { save([...(alarms || []), { id: crypto.randomUUID(), time, label: label || 'Alarm', days, enabled: true }]); setLabel(''); }}><Plus size={14} /> Add</button>
      </div>
      {!alarms?.length ? <Empty icon={<AlarmClock size={40} />} title="No Alarms" sub="Alarms ring as notifications while MACOS X PRO is running." /> : (
        <div className="tile divide-y divide-[rgb(var(--stroke)/var(--stroke-a))]">
          {[...alarms].sort((a, b) => a.time.localeCompare(b.time)).map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-4 py-3">
              <div className={`text-[34px] font-light tabular-nums ${a.enabled ? '' : 'opacity-40'}`}>{a.time}</div>
              <div className="flex-1 min-w-0"><div className="truncate">{a.label}</div><div className="text-[12px] muted">{a.days.length === 0 ? 'Once' : a.days.length === 7 ? 'Every day' : a.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}</div></div>
              <Toggle checked={a.enabled} onChange={(v) => save(alarms.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))} />
              <button className="icon-btn" onClick={() => save(alarms.filter((x) => x.id !== a.id))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [base, setBase] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const [, force] = useState(0);
  useEffect(() => { if (!running) return; let r = 0; const f = () => { force((x) => x + 1); r = requestAnimationFrame(f); }; r = requestAnimationFrame(f); return () => cancelAnimationFrame(r); }, [running]);
  const elapsed = base + (running ? performance.now() - startedAt : 0);
  const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
  const lapTimes = laps.map((l, i) => l - (laps[i - 1] || 0));
  const best = Math.min(...lapTimes), worst = Math.max(...lapTimes);
  return (
    <div className="h-full flex flex-col items-center p-6">
      <div className="text-[76px] font-extralight tabular-nums mt-6">{fmt(elapsed)}</div>
      <div className="flex gap-6 mt-4">
        <button className="w-[78px] h-[78px] rounded-full bg-[rgb(var(--fg)/.1)] flex items-center justify-center" onClick={() => (running ? setLaps([...laps, elapsed]) : (setBase(0), setLaps([])))} disabled={!running && elapsed === 0}>{running ? <><Flag size={16} /> Lap</> : <><RotateCcw size={16} /> Reset</>}</button>
        <button className={`w-[78px] h-[78px] rounded-full flex items-center justify-center gap-1 ${running ? 'bg-[#ff453a33] text-[#ff453a]' : 'bg-[#30d15833] text-[#30d158]'}`} onClick={() => { if (running) { setBase(elapsed); setRunning(false); } else { setStartedAt(performance.now()); setRunning(true); } }}>{running ? <><Pause size={16} /> Stop</> : <><Play size={16} /> Start</>}</button>
      </div>
      <div className="w-full max-w-[420px] mt-6 overflow-y-auto">
        {[...lapTimes].reverse().map((t, i) => { const n = lapTimes.length - i; return <div key={n} className={`flex justify-between py-2 border-b border-[rgb(var(--stroke)/var(--stroke-a))] tabular-nums ${lapTimes.length > 2 && t === best ? 'text-[#30d158]' : lapTimes.length > 2 && t === worst ? 'text-[#ff453a]' : ''}`}><span>Lap {n}</span><span>{fmt(t)}</span></div>; })}
      </div>
    </div>
  );
}

function Timers() {
  const { data: timers, setData } = useInvoke<TimerState[]>('timers:list', [], [], 'timers:changed');
  const [h, setH] = useState(0), [m, setM] = useState(5), [sec, setSec] = useState(0);
  const [label, setLabel] = useState('');
  const now = useNow(1000);
  const dialog = useDialog();
  void dialog;
  useEffect(() => { const t = setInterval(() => void api.invoke<TimerState[]>('timers:list').then(setData), 5000); return () => clearInterval(t); }, [setData]);
  const num = (v: number, set: (n: number) => void, max: number, l: string) => <label className="flex flex-col items-center text-[11px] muted">{l}<input type="number" min={0} max={max} value={v} onChange={(e) => set(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} className="field w-[74px] text-center text-[26px] font-light mt-1 !text-[rgb(var(--fg))]" /></label>;
  return (
    <div className="p-6 max-w-[640px] mx-auto">
      <div className="tile p-5 flex flex-wrap items-end justify-center gap-3 mb-5">
        {num(h, setH, 23, 'hours')}{num(m, setM, 59, 'min')}{num(sec, setSec, 59, 'sec')}
        <input className="field w-[160px]" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-primary" disabled={h + m + sec === 0} onClick={() => void api.invoke('timers:start', (h * 3600 + m * 60 + sec) * 1000, label)}><Play size={14} /> Start</button>
      </div>
      <div className="flex gap-2 justify-center mb-5">{[1, 3, 5, 10, 15, 25, 30, 60].map((x) => <button key={x} className="btn !py-1 text-[12px]" onClick={() => void api.invoke('timers:start', x * 60000, `${x} min`)}>{x}m</button>)}</div>
      {!timers?.length ? <Empty icon={<Hourglass size={40} />} title="No running timers" sub="Timers keep running even if you close this window." /> : timers.map((t) => {
        const rem = t.paused ? t.remaining : Math.max(0, t.endsAt - now.getTime());
        const pct = 100 - (rem / t.duration) * 100;
        return (
          <div key={t.id} className="tile p-4 mb-2 flex items-center gap-4">
            <div className="relative w-[64px] h-[64px]"><svg viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="16" fill="none" stroke="rgb(var(--fg)/.12)" strokeWidth="3" /><circle cx="18" cy="18" r="16" fill="none" stroke="#ff9f0a" strokeWidth="3" strokeDasharray="100.5" strokeDashoffset={100.5 * (pct / 100)} strokeLinecap="round" /></svg></div>
            <div className="flex-1"><div className="text-[30px] font-light tabular-nums">{duration(rem / 1000)}</div><div className="text-[12px] muted">{t.label}</div></div>
            <button className="icon-btn" onClick={() => void api.invoke('timers:pause', t.id, !t.paused)}>{t.paused ? <Play size={15} /> : <Pause size={15} />}</button>
            <button className="icon-btn" onClick={() => void api.invoke('timers:cancel', t.id)}><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}
