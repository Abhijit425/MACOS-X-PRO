import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CalendarEvent } from '@shared/types';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { useInvoke, useEvent, useLocalStorage, useNow } from '../lib/hooks';
import { Segmented, Toggle, useDialog } from '../components/ui';

const COLORS = ['#0a84ff', '#ff453a', '#30d158', '#ff9f0a', '#bf5af2', '#ffd60a', '#64d2ff', '#8e8e93'];
const DAY = 86400000;
const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const toLocalInput = (ts: number) => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function Calendar() {
  const [view, setView] = useLocalStorage<'month' | 'week' | 'day'>('cal:view', 'month');
  const [cursor, setCursor] = useState(() => sod(new Date()));
  const [editing, setEditing] = useState<Partial<CalendarEvent> | null>(null);
  const now = useNow(60000);
  const range = useMemo(() => {
    if (view === 'month') { const f = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const s = new Date(f); s.setDate(1 - f.getDay()); return [s.getTime(), s.getTime() + 42 * DAY]; }
    if (view === 'week') { const s = sod(cursor); s.setDate(s.getDate() - s.getDay()); return [s.getTime(), s.getTime() + 7 * DAY]; }
    return [sod(cursor).getTime(), sod(cursor).getTime() + DAY];
  }, [view, cursor]);
  const { data: events, reload } = useInvoke<CalendarEvent[]>('events:list', range, [range[0], range[1]]);
  useEvent('events:changed', () => void reload());
  useEffect(() => { if (new URLSearchParams(location.hash.split('?')[1]).get('new') === '1') newAt(Date.now()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEvent<Record<string, string>>('app:args', (a) => { if (a.new === '1') newAt(Date.now()); });

  const move = (dir: number) => { const d = new Date(cursor); if (view === 'month') d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + dir * (view === 'week' ? 7 : 1)); setCursor(d); };
  function newAt(ts: number, allDay = false) { const s = new Date(ts); if (!allDay) { s.setMinutes(0, 0, 0); if (s.getTime() < Date.now() && sod(s).getTime() === sod(new Date()).getTime()) s.setHours(new Date().getHours() + 1); } setEditing({ title: '', start: s.getTime(), end: s.getTime() + 3600000, allDay, color: COLORS[0], remindMinutes: 10, notes: '' }); }
  const evsOn = (d: Date) => (events || []).filter((e) => e.start < d.getTime() + DAY && e.end > d.getTime());
  const title = view === 'month' ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' }) : view === 'week' ? `Week of ${new Date(range[0]).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Window title={title} toolbar={<>
      <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      <div className="w-2" />
      <button className="icon-btn" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
      <button className="btn !py-[2px] text-[12px]" onClick={() => setCursor(sod(new Date()))}>Today</button>
      <button className="icon-btn" onClick={() => move(1)}><ChevronRight size={16} /></button>
      <button className="icon-btn ml-1" title="New event" onClick={() => newAt(view === 'month' ? Math.max(Date.now(), cursor.getTime()) : cursor.getTime() + 9 * 3600000)}><Plus size={16} /></button>
    </>}>
      <div className="h-full relative">
        {view === 'month' ? (
          <div className="h-full flex flex-col">
            <div className="grid grid-cols-7 text-[11px] font-semibold muted px-2 pt-2">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="text-right pr-2">{d}</div>)}</div>
            <div className="flex-1 grid grid-cols-7 grid-rows-6">
              {Array.from({ length: 42 }).map((_, i) => {
                const d = new Date(range[0] + i * DAY + 3600000 * 2); const day = sod(d);
                const isToday = day.getTime() === sod(now).getTime(); const inMonth = day.getMonth() === cursor.getMonth();
                return (
                  <div key={i} onDoubleClick={() => newAt(day.getTime() + 9 * 3600000)} className={`border-t border-l border-[rgb(var(--stroke)/var(--stroke-a))] p-1 overflow-hidden ${inMonth ? '' : 'bg-[rgb(var(--fg)/.025)]'}`}>
                    <div className="flex justify-end"><span className={`text-[12px] w-[22px] h-[22px] flex items-center justify-center rounded-full ${isToday ? 'bg-[#ff453a] text-white font-semibold' : inMonth ? '' : 'muted'}`}>{day.getDate()}</span></div>
                    {evsOn(day).slice(0, 3).map((e) => <button key={e.id} onClick={() => setEditing(e)} className="w-full text-left text-[11px] truncate rounded px-1 mt-[2px]" style={{ background: `${e.color}30`, color: 'rgb(var(--fg))', borderLeft: `3px solid ${e.color}` }}>{!e.allDay && <span className="opacity-60 mr-1">{new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}{e.title}</button>)}
                    {evsOn(day).length > 3 && <div className="text-[10px] muted px-1">+{evsOn(day).length - 3} more</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : <TimeGrid days={view === 'week' ? 7 : 1} start={range[0]} events={events || []} now={now} onNew={newAt} onOpen={setEditing} />}
        <AnimatePresence>{editing && <Editor ev={editing} onClose={() => setEditing(null)} />}</AnimatePresence>
      </div>
    </Window>
  );
}

function TimeGrid({ days, start, events, now, onNew, onOpen }: { days: number; start: number; events: CalendarEvent[]; now: Date; onNew: (ts: number, allDay?: boolean) => void; onOpen: (e: CalendarEvent) => void }) {
  const H = 48;
  useEffect(() => { document.getElementById('tg')?.scrollTo({ top: H * 7.5 }); }, []);
  return (
    <div className="h-full flex flex-col">
      <div className="flex pl-[52px] border-b border-[rgb(var(--stroke)/var(--stroke-a))]">
        {Array.from({ length: days }).map((_, i) => { const d = new Date(start + i * DAY + 7200000); const today = sod(d).getTime() === sod(now).getTime(); return (
          <div key={i} className="flex-1 py-2 text-center text-[12px]"><span className="muted">{d.toLocaleDateString([], { weekday: 'short' })}</span> <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full ${today ? 'bg-[#ff453a] text-white' : ''}`}>{d.getDate()}</span>
            <div className="space-y-[2px] mt-1 px-1">{events.filter((e) => e.allDay && e.start < sod(d).getTime() + DAY && e.end > sod(d).getTime()).map((e) => <button key={e.id} onClick={() => onOpen(e)} className="block w-full truncate text-[11px] rounded px-1 text-left" style={{ background: `${e.color}40` }}>{e.title}</button>)}</div>
          </div>
        ); })}
      </div>
      <div id="tg" className="flex-1 overflow-y-auto relative">
        <div className="flex" style={{ height: H * 24 }}>
          <div className="w-[52px] shrink-0 relative">{Array.from({ length: 24 }).map((_, h) => <div key={h} className="absolute right-2 text-[10px] muted -translate-y-1/2" style={{ top: h * H }}>{h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}</div>)}</div>
          {Array.from({ length: days }).map((_, i) => {
            const dayStart = sod(new Date(start + i * DAY + 7200000)).getTime();
            const evs = events.filter((e) => !e.allDay && e.start < dayStart + DAY && e.end > dayStart);
            return (
              <div key={i} className="flex-1 relative border-l border-[rgb(var(--stroke)/var(--stroke-a))]" onDoubleClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onNew(dayStart + Math.floor(((e.clientY - r.top) / H) * 2) * 1800000); }}>
                {Array.from({ length: 24 }).map((_, h) => <div key={h} className="absolute left-0 right-0 border-t border-[rgb(var(--stroke)/var(--stroke-a))]" style={{ top: h * H }} />)}
                {evs.map((e) => { const s = Math.max(e.start, dayStart), en = Math.min(e.end, dayStart + DAY); return (
                  <button key={e.id} onClick={() => onOpen(e)} className="absolute left-1 right-1 rounded-md px-2 py-1 text-left text-[11.5px] overflow-hidden" style={{ top: ((s - dayStart) / 3600000) * H, height: Math.max(20, ((en - s) / 3600000) * H - 2), background: `${e.color}38`, borderLeft: `3px solid ${e.color}` }}>
                    <div className="font-semibold truncate">{e.title}</div><div className="opacity-70">{new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                  </button>
                ); })}
                {sod(now).getTime() === dayStart && <div className="absolute left-0 right-0 h-[2px] bg-[#ff453a] z-10" style={{ top: ((now.getTime() - dayStart) / 3600000) * H }}><div className="w-2 h-2 rounded-full bg-[#ff453a] -mt-[3px] -ml-1" /></div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Editor({ ev, onClose }: { ev: Partial<CalendarEvent>; onClose: () => void }) {
  const [e, setE] = useState(ev);
  const dialog = useDialog();
  const save = async () => { await api.invoke('events:save', { ...e, title: e.title?.trim() || 'New Event' }); onClose(); };
  return (
    <motion.div className="absolute inset-0 z-20 bg-black/20 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(x) => { if (x.target === x.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} className="glass-strong rounded-2xl p-5 w-[400px] space-y-3" onKeyDown={(k) => { if (k.key === 'Enter' && k.ctrlKey) void save(); if (k.key === 'Escape') onClose(); }}>
        <div className="flex items-center gap-2"><input autoFocus className="flex-1 bg-transparent outline-none text-[18px] font-semibold" placeholder="New Event" value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /><button className="icon-btn" onClick={onClose}><X size={15} /></button></div>
        <label className="flex items-center justify-between text-[13px]">All-day <Toggle small checked={!!e.allDay} onChange={(v) => setE({ ...e, allDay: v, ...(v ? { start: sod(new Date(e.start!)).getTime(), end: sod(new Date(e.start!)).getTime() + DAY } : {}) })} /></label>
        <div className="grid grid-cols-[60px_1fr] gap-2 items-center text-[13px]">
          <span className="muted">Starts</span><input type={e.allDay ? 'date' : 'datetime-local'} className="field" value={e.allDay ? toLocalInput(e.start!).slice(0, 10) : toLocalInput(e.start!)} onChange={(x) => { const v = new Date(x.target.value).getTime(); if (!Number.isFinite(v)) return; setE({ ...e, start: v, end: Math.max(e.end || v, v + (e.allDay ? DAY : 1800000)) }); }} />
          <span className="muted">Ends</span><input type={e.allDay ? 'date' : 'datetime-local'} className="field" value={e.allDay ? toLocalInput(e.end! - 1).slice(0, 10) : toLocalInput(e.end!)} onChange={(x) => { const v = new Date(x.target.value).getTime(); if (Number.isFinite(v)) setE({ ...e, end: e.allDay ? v + DAY : v }); }} />
          <span className="muted"><Bell size={13} /></span>
          <select className="field" value={e.remindMinutes ?? -1} onChange={(x) => setE({ ...e, remindMinutes: Number(x.target.value) < 0 ? null : Number(x.target.value) })}>
            <option value={-1}>No alert</option>{[0, 5, 10, 15, 30, 60, 120, 1440].map((m) => <option key={m} value={m}>{m === 0 ? 'At time of event' : m < 60 ? `${m} minutes before` : m === 1440 ? '1 day before' : `${m / 60} hour${m > 60 ? 's' : ''} before`}</option>)}
          </select>
        </div>
        <div className="flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => setE({ ...e, color: c })} className="w-5 h-5 rounded-full" style={{ background: c, boxShadow: e.color === c ? `0 0 0 2px rgb(var(--glass)), 0 0 0 4px ${c}` : undefined }} />)}</div>
        <textarea className="field w-full h-[70px] resize-none text-[13px]" placeholder="Notes" value={e.notes} onChange={(x) => setE({ ...e, notes: x.target.value })} />
        <div className="flex gap-2">
          {e.id && <button className="btn text-[#ff453a]" onClick={async () => { if (await dialog.confirm({ title: 'Delete this event?', confirm: 'Delete', danger: true })) { await api.invoke('events:delete', e.id); onClose(); } }}><Trash2 size={14} /></button>}
          <div className="flex-1" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => void save()}>{e.id ? 'Save' : 'Add Event'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
