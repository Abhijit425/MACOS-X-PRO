import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Moon, BellOff, Bell, CalendarDays } from 'lucide-react';
import type { CalendarEvent, NotificationItem } from '@shared/types';
import { api, openApp } from '../lib/api';
import { useInvoke, useNow, useSettings } from '../lib/hooks';
import { relTime, timeStr } from '../lib/format';
import { useWeather, wmoLabel } from '../lib/weather';
import { WeatherIcon } from '../components/WeatherIcon';
import { Toggle } from '../components/ui';
import { BuiltinIcon } from '../components/AppIcon';
import { builtinById } from '@shared/apps';

const appIconId = (app: string) => ({ Calendar: 'calendar', Clock: 'clock', Screenshot: 'screenshot', Focus: 'clock', Battery: 'monitor', Notes: 'notes' } as Record<string, string>)[app] || BUILTIN_FALLBACK(app);
const BUILTIN_FALLBACK = (app: string) => (builtinById(app.toLowerCase()) ? app.toLowerCase() : 'settings');

export function NotificationCentre({ onClose }: { onClose: () => void }) {
  const [s, update] = useSettings();
  const { data: list, setData } = useInvoke<NotificationItem[]>('notifications:list', [], [], 'notifications:changed');
  const now = useNow(30000);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const { data: events } = useInvoke<CalendarEvent[]>('events:list', [start.getTime(), start.getTime() + 86400000 * 2], [start.getTime()], 'events:changed');
  const wx = useWeather();
  useEffect(() => { void api.invoke('notifications:read'); }, []);

  const grouped = useMemo(() => {
    const g = new Map<string, NotificationItem[]>();
    for (const n of list || []) g.set(n.app, [...(g.get(n.app) || []), n]);
    return [...g.entries()];
  }, [list]);

  return (
    <motion.div data-hit initial={{ x: 380, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed right-[8px] top-[6px] bottom-[8px] w-[360px] z-50 flex flex-col gap-3 overflow-y-auto pb-2 pr-[2px]" onMouseDown={(e) => e.stopPropagation()}>
      <div className="glass-strong rounded-[18px] p-4">
        <div className="flex items-start justify-between">
          <div><div className="text-[13px] muted">{now.toLocaleDateString([], { weekday: 'long' })}</div><div className="text-[26px] font-semibold leading-tight">{now.toLocaleDateString([], { month: 'long', day: 'numeric' })}</div></div>
          <div className="text-[30px] font-light tabular-nums">{timeStr(now, s.clock24h)}</div>
        </div>
      </div>
      <div className="glass-strong rounded-[18px] p-3 grid grid-cols-2 gap-2">
        <div className="tile p-2 flex items-center justify-between col-span-2"><span className="flex items-center gap-2 text-[12px] font-semibold"><Moon size={15} /> Focus</span><Toggle small checked={s.focusMode} onChange={(v) => update({ focusMode: v })} /></div>
        <div className="tile p-2 flex items-center justify-between col-span-2"><span className="flex items-center gap-2 text-[12px] font-semibold">{s.notificationsEnabled ? <Bell size={15} /> : <BellOff size={15} />} Notifications</span><Toggle small checked={s.notificationsEnabled} onChange={(v) => update({ notificationsEnabled: v })} /></div>
      </div>
      <button className="glass-strong rounded-[18px] p-4 text-left" onClick={() => { onClose(); void openApp('weather'); }}>
        {wx.city ? wx.data ? (
          <div className="flex items-center justify-between">
            <div><div className="font-semibold">{wx.city.name}</div><div className="text-[34px] font-light leading-none mt-1">{Math.round(wx.data.current.temp)}°</div><div className="text-[12px] muted mt-1">{wmoLabel(wx.data.current.code)} · H:{Math.round(wx.data.daily[0].max)}° L:{Math.round(wx.data.daily[0].min)}°</div></div>
            <WeatherIcon code={wx.data.current.code} isDay={wx.data.current.isDay} size={44} />
          </div>
        ) : <div className="muted text-[12px]">{wx.error ? `Weather unavailable: ${wx.error}` : 'Loading weather…'}</div> : <div className="muted text-[12px]">Set your city in Weather to see the forecast here.</div>}
      </button>
      <button className="glass-strong rounded-[18px] p-4 text-left" onClick={() => { onClose(); void openApp('calendar'); }}>
        <div className="flex items-center gap-2 font-semibold mb-2"><CalendarDays size={15} className="text-[#ff453a]" /> Up next</div>
        {(events || []).filter((e) => e.end >= Date.now()).slice(0, 4).map((e) => (
          <div key={e.id} className="flex gap-2 items-stretch py-1"><div className="w-[3px] rounded-full" style={{ background: e.color }} /><div className="min-w-0"><div className="text-[12.5px] truncate">{e.title}</div><div className="text-[11px] muted">{e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{new Date(e.start).getDate() !== now.getDate() ? ' · Tomorrow' : ''}</div></div></div>
        ))}
        {(!events || events.filter((e) => e.end >= Date.now()).length === 0) && <div className="text-[12px] muted">No upcoming events today or tomorrow.</div>}
      </button>
      <div className="flex items-center justify-between px-2">
        <div className="text-[13px] font-semibold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>Notifications</div>
        {!!list?.length && <button className="glass rounded-full px-3 py-[2px] text-[11px]" onClick={() => { void api.invoke('notifications:clear'); setData([]); }}>Clear All</button>}
      </div>
      <AnimatePresence initial={false}>
        {grouped.map(([app, items]) => (
          <motion.div key={app} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60 }} className="glass-strong rounded-[16px] p-3">
            <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2 text-[11px] font-semibold muted uppercase tracking-wide"><BuiltinIcon id={appIconId(app)} size={16} />{app}</div>
              <button className="icon-btn !w-5 !h-5" title="Clear" onClick={() => items.forEach((n) => void api.invoke('notifications:clear', n.id))}><X size={12} /></button></div>
            {items.slice(0, 5).map((n) => (
              <div key={n.id} className="py-1"><div className="flex justify-between gap-2"><div className="text-[13px] font-semibold truncate">{n.title}</div><div className="text-[11px] muted shrink-0">{relTime(n.ts)}</div></div>{n.body && <div className="text-[12px] opacity-80 leading-snug line-clamp-3">{n.body}</div>}</div>
            ))}
            {items.length > 5 && <div className="text-[11px] muted pt-1">+{items.length - 5} more</div>}
          </motion.div>
        ))}
      </AnimatePresence>
      {!list?.length && <div className="glass rounded-[16px] p-4 text-center text-[12px] muted">No notifications</div>}
    </motion.div>
  );
}

export function Banner({ n, onClose }: { n: NotificationItem; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <motion.div data-hit layout initial={{ x: 420, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 420, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="glass-strong rounded-[16px] p-3 w-[350px] flex gap-3 group relative cursor-pointer" onClick={onClose}>
      <BuiltinIcon id={appIconId(n.app)} size={36} />
      <div className="min-w-0 flex-1"><div className="flex justify-between"><div className="font-semibold text-[13px] truncate">{n.title}</div><div className="text-[11px] muted">now</div></div><div className="text-[12px] opacity-85 leading-snug line-clamp-2">{n.body}</div></div>
      <button className="absolute -left-2 -top-2 w-5 h-5 rounded-full glass-strong opacity-0 group-hover:opacity-100 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onClose(); }}><X size={11} /></button>
    </motion.div>
  );
}
