import { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';
import { api } from './api';
import { DEFAULT_SETTINGS, Metrics, Settings } from '@shared/types';

// ---------- Settings (live, shared across all windows)
let settingsCache: Settings | null = null;
const settingsListeners = new Set<(s: Settings) => void>();
let settingsInit: Promise<Settings> | null = null;

function initSettings() {
  if (!settingsInit) {
    settingsInit = api.invoke<Settings>('settings:get').catch(() => DEFAULT_SETTINGS).then((s) => {
      settingsCache = s;
      settingsListeners.forEach((l) => l(s));
      return s;
    });
    api.on('settings:changed', (s: Settings) => { settingsCache = s; settingsListeners.forEach((l) => l(s)); });
  }
  return settingsInit;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => Promise<void>, boolean] {
  const [s, setS] = useState<Settings | null>(settingsCache);
  useEffect(() => {
    settingsListeners.add(setS);
    void initSettings();
    return () => { settingsListeners.delete(setS); };
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    if (settingsCache) { settingsCache = { ...settingsCache, ...patch }; settingsListeners.forEach((l) => l(settingsCache!)); }
    await api.invoke('settings:set', patch).catch(() => undefined);
  }, []);
  return [s || DEFAULT_SETTINGS, update, !!s];
}

// ---------- Theme: applies light/dark + accent + motion preferences to <html>
export function useThemeSync() {
  const [settings, , loaded] = useSettings();
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    void api.invoke<'light' | 'dark'>('theme:resolved').then(setResolved).catch(() => undefined);
    return api.on('theme:changed', setResolved);
  }, [settings.theme]);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', resolved === 'dark');
    el.classList.toggle('solid', settings.reduceTransparency);
    el.classList.toggle('no-anim', settings.animations === 'off');
    const hex = settings.accent.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
    el.style.setProperty('--accent', `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`);
    el.style.setProperty('--font-scale', String(settings.fontScale));
  }, [resolved, settings.accent, settings.reduceTransparency, settings.animations, settings.fontScale]);
  return { theme: resolved, loaded };
}

// ---------- Motion preferences for framer-motion
export const MotionCtx = createContext({ enabled: true, speed: 1 });
export function useMotionPrefs() { return useContext(MotionCtx); }
export function useSpring(stiffness = 420, damping = 32) {
  const m = useMotionPrefs();
  if (!m.enabled) return { duration: 0 };
  return { type: 'spring' as const, stiffness: stiffness * m.speed, damping, mass: 0.9 };
}

// ---------- Metrics subscription
let metricsCache: Metrics | null = null;
const metricsListeners = new Set<(m: Metrics) => void>();
let metricsUnsub: (() => void) | null = null;
export function useMetrics(enabled = true) {
  const [m, setM] = useState<Metrics | null>(metricsCache);
  useEffect(() => {
    if (!enabled) return;
    metricsListeners.add(setM);
    if (!metricsUnsub) {
      metricsUnsub = api.on('metrics', (x: Metrics) => { metricsCache = x; metricsListeners.forEach((l) => l(x)); });
      void api.invoke('metrics:subscribe').catch(() => undefined);
    }
    return () => {
      metricsListeners.delete(setM);
      if (metricsListeners.size === 0 && metricsUnsub) { metricsUnsub(); metricsUnsub = null; void api.invoke('metrics:unsubscribe').catch(() => undefined); }
    };
  }, [enabled]);
  return m;
}

/** Keeps a rolling history of a metric for charts. */
export function useHistory(value: number | null | undefined, length = 60) {
  const [hist, setHist] = useState<number[]>([]);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (value === null || value === undefined || value === last.current) return;
    last.current = value;
    setHist((h) => [...h.slice(-(length - 1)), value]);
  }, [value, length]);
  return hist;
}

// ---------- Generic invoke-with-state
export function useInvoke<T>(name: string, args: unknown[] = [], deps: unknown[] = [], refreshOn?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return api.invoke<T>(name, ...args).then((d) => { setData(d); setError(null); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => (refreshOn ? api.on(refreshOn, (v: T) => (v !== undefined ? setData(v) : void reload())) : undefined), [refreshOn, reload]);
  return { data, error, loading, reload, setData };
}

export function useEvent<T = unknown>(channel: string, cb: (v: T) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => api.on(channel, (v: T) => ref.current(v)), [channel]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); t = setTimeout(tick, intervalMs - (Date.now() % intervalMs)); };
    t = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    return () => clearTimeout(t);
  }, [intervalMs]);
  return now;
}

/**
 * Click-through for transparent overlay windows: the window ignores the mouse except over
 * elements marked with data-hit, or while `capture` is true.
 */
export function useClickThrough(channel: 'shell:hit' | 'win:hit', capture: boolean) {
  const last = useRef<boolean | null>(null);
  const cap = useRef(capture);
  cap.current = capture;
  useEffect(() => {
    if (capture) { last.current = true; return; }
    last.current = null;
    const onMove = (e: MouseEvent) => {
      if (cap.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const hit = !!el?.closest('[data-hit]') || (e.buttons !== 0 && last.current === true);
      if (hit !== last.current) { last.current = hit; void api.invoke(channel, hit).catch(() => undefined); }
    };
    const onLeave = () => { if (!cap.current && last.current !== false) { last.current = false; void api.invoke(channel, false).catch(() => undefined); } };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => { window.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); };
  }, [capture, channel]);
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; } });
  const set = useCallback((x: T) => { setV(x); try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* ignore */ } }, [key]);
  return [v, set];
}
