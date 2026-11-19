// Background clock: alarms, timers, calendar reminders, focus sessions and screen-time tracking.
// One cheap 1-second tick; no heavy work happens here.
import { powerMonitor } from 'electron';
import crypto from 'node:crypto';
import { all, run, get, kvGet, kvSet } from './db';
import { notify } from './notify';
import { broadcast, getSettings } from './settings';
import type { Alarm, TimerState } from '@shared/types';

let timers: TimerState[] = [];
let tick = 0;
let lastAlarmMinute = '';
let focusSession: { endsAt: number; duration: number; label: string } | null = null;

const today = () => new Date().toISOString().slice(0, 10);

export function getAlarms(): Alarm[] { return kvGet<Alarm[]>('alarms', []); }
export function saveAlarms(a: Alarm[]) { kvSet('alarms', a); broadcast('alarms:changed', a); return a; }

export function getTimers() {
  const now = Date.now();
  return timers.map((t) => ({ ...t, remaining: t.paused ? t.remaining : Math.max(0, t.endsAt - now) }));
}
export function startTimer(durationMs: number, label: string) {
  timers.push({ id: crypto.randomUUID(), label: label || 'Timer', endsAt: Date.now() + durationMs, duration: durationMs, paused: false, remaining: durationMs });
  broadcast('timers:changed', getTimers());
}
export function pauseTimer(id: string, paused: boolean) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  if (paused && !t.paused) { t.remaining = Math.max(0, t.endsAt - Date.now()); t.paused = true; }
  else if (!paused && t.paused) { t.endsAt = Date.now() + t.remaining; t.paused = false; }
  broadcast('timers:changed', getTimers());
}
export function cancelTimer(id: string) { timers = timers.filter((t) => t.id !== id); broadcast('timers:changed', getTimers()); }

export function startFocus(minutes: number, label = 'Focus') {
  focusSession = { endsAt: Date.now() + minutes * 60000, duration: minutes * 60000, label };
  broadcast('focus:changed', focusState());
}
export function stopFocus() {
  if (focusSession) addFocusSeconds(Math.round((focusSession.duration - Math.max(0, focusSession.endsAt - Date.now())) / 1000));
  focusSession = null;
  broadcast('focus:changed', focusState());
}
export function focusState() { return focusSession ? { ...focusSession, remaining: Math.max(0, focusSession.endsAt - Date.now()) } : null; }

function addFocusSeconds(sec: number) {
  run('INSERT INTO activity(day,activeSeconds,focusSeconds) VALUES(?,0,?) ON CONFLICT(day) DO UPDATE SET focusSeconds=focusSeconds+excluded.focusSeconds', [today(), sec]);
}

export function activity(days = 7) {
  return all<{ day: string; activeSeconds: number; focusSeconds: number }>('SELECT * FROM activity ORDER BY day DESC LIMIT ?', [days]);
}

function checkCalendar() {
  const now = Date.now();
  const due = all<{ id: string; title: string; start: number; remindMinutes: number }>(
    'SELECT id,title,start,remindMinutes FROM events WHERE remindMinutes IS NOT NULL AND reminded=0 AND start - remindMinutes*60000 <= ? AND start > ? - 3600000', [now, now]);
  for (const e of due) {
    run('UPDATE events SET reminded=1 WHERE id=?', [e.id]);
    const mins = Math.round((e.start - now) / 60000);
    notify('Calendar', e.title, mins > 0 ? `Starts in ${mins} minute${mins === 1 ? '' : 's'} · ${new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Starting now', { urgent: true });
  }
}

function checkAlarms() {
  const d = new Date();
  const key = `${d.getHours()}:${d.getMinutes()}`;
  if (key === lastAlarmMinute) return;
  lastAlarmMinute = key;
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  for (const a of getAlarms()) {
    if (!a.enabled || a.time !== hhmm) continue;
    if (a.days.length && !a.days.includes(d.getDay())) continue;
    notify('Clock', a.label || 'Alarm', `It's ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, { urgent: true });
    broadcast('alarm:ring', a);
    if (!a.days.length) saveAlarms(getAlarms().map((x) => (x.id === a.id ? { ...x, enabled: false } : x)));
  }
}

export function startScheduler() {
  setInterval(() => {
    tick++;
    const now = Date.now();
    const fired = timers.filter((t) => !t.paused && t.endsAt <= now);
    if (fired.length) {
      timers = timers.filter((t) => !fired.includes(t));
      for (const t of fired) { notify('Clock', `${t.label} finished`, 'Your timer is done.', { urgent: true }); broadcast('alarm:ring', { label: t.label }); }
      broadcast('timers:changed', getTimers());
    }
    if (focusSession && focusSession.endsAt <= now) {
      addFocusSeconds(Math.round(focusSession.duration / 1000));
      notify('Focus', 'Focus session complete', `${Math.round(focusSession.duration / 60000)} minutes of deep work. Take a break!`, { urgent: true });
      focusSession = null;
      broadcast('focus:changed', null);
    }
    if (tick % 15 === 0) { checkCalendar(); checkAlarms(); }
    if (tick % 30 === 0) {
      // Screen time: count time the user was active (not idle > 2 min, not locked)
      try {
        const state = powerMonitor.getSystemIdleState(120);
        if (state === 'active') run('INSERT INTO activity(day,activeSeconds,focusSeconds) VALUES(?,30,0) ON CONFLICT(day) DO UPDATE SET activeSeconds=activeSeconds+30', [today()]);
      } catch { /* ignore */ }
    }
    if (tick % 300 === 0 && getSettings().notificationsEnabled) batteryWatch();
  }, 1000);
}

let batteryWarned = false;
async function batteryWatch() {
  const { batteryNow } = await import('./system');
  const b = await batteryNow();
  if (!b || !b.hasBattery) return;
  if (b.percent <= 15 && !b.charging && !batteryWarned) { batteryWarned = true; notify('Battery', 'Low battery', `${b.percent}% remaining. Plug in your charger.`, { urgent: true }); }
  if (b.charging || b.percent > 20) batteryWarned = false;
}

// ---------- Productivity tasks (daily checklist)
export function listTasks() { return all('SELECT * FROM tasks WHERE day=? OR done=0 ORDER BY done, ts', [today()]).map((t) => ({ ...t, done: !!t.done })); }
export function addTask(text: string) { run('INSERT INTO tasks(id,text,done,day,ts) VALUES(?,?,0,?,?)', [crypto.randomUUID(), text, today(), Date.now()]); return listTasks(); }
export function toggleTask(id: string) { const t = get<{ done: number }>('SELECT done FROM tasks WHERE id=?', [id]); run('UPDATE tasks SET done=?, day=? WHERE id=?', [t?.done ? 0 : 1, today(), id]); return listTasks(); }
export function deleteTask(id: string) { run('DELETE FROM tasks WHERE id=?', [id]); return listTasks(); }
