import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, Volume2, VolumeX, Volume1, Search, Moon, BatteryCharging, ToggleRight } from 'lucide-react';
import type { ControlState, Metrics, WifiState } from '@shared/types';
import { api } from '../lib/api';
import { useEvent, useNow, useSettings, useInvoke } from '../lib/hooks';
import { MENU_TITLES } from '../shell/menus';
import type { NotificationItem } from '@shared/types';

export default function MenuBar() {
  const [s] = useSettings();
  const now = useNow(s.showSeconds ? 1000 : 15000);
  const [active, setActive] = useState<string | null>(null);
  const [appName, setAppName] = useState('Finder');
  const [battery, setBattery] = useState<Metrics['battery'] | null>(null);
  const [wifi, setWifi] = useState<WifiState | null>(null);
  const [vol, setVol] = useState<ControlState['volume'] | null>(null);
  const { data: notifs } = useInvoke<NotificationItem[]>('notifications:list', [], [], 'notifications:changed');
  const unread = (notifs || []).filter((n) => !n.read).length;
  const menuOpen = active?.startsWith('menu:');
  const root = useRef<HTMLDivElement>(null);

  useEvent<string | null>('menubar:state', setActive);
  useEvent<string>('app:focused', () => undefined);

  useEffect(() => {
    let alive = true;
    const fg = () => api.invoke<{ name: string } | null>('foreground').then((f) => { if (alive && f?.name && !/^(macos x pro|electron)$/i.test(f.name)) setAppName(f.name); }).catch(() => undefined);
    const slow = () => {
      void api.invoke<Metrics['battery']>('battery').then((b) => alive && setBattery(b)).catch(() => undefined);
      void api.invoke<WifiState>('wifi:get', false).then((w) => alive && setWifi(w)).catch(() => undefined);
      void api.invoke<ControlState>('controls:state').then((c) => alive && setVol(c.volume)).catch(() => undefined);
    };
    void fg(); slow();
    const t1 = setInterval(fg, 1500);
    const t2 = setInterval(slow, 30000);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); };
  }, []);

  const send = (kind: string, e: React.MouseEvent, payload?: string, hover = false) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = kind === 'menu' ? r.left : r.left + r.width / 2;
    void api.invoke('shell:send', 'popover:open', { kind, x, payload, hover });
    if (!hover && kind === 'volume') setTimeout(() => void api.invoke<ControlState>('controls:state').then((c) => setVol(c.volume)), 4000);
  };
  const isOn = (k: string) => active === k;

  const VolIcon = !vol?.supported ? Volume2 : vol.muted || vol.level === 0 ? VolumeX : vol.level < 50 ? Volume1 : Volume2;
  const item = 'h-[24px] px-[9px] rounded-[5px] flex items-center gap-[5px] transition-colors';
  const on = 'bg-[rgb(var(--fg)/.16)]';

  return (
    <div ref={root} className="h-full w-full flex items-center px-[8px] text-[13px] menubar-glass" onContextMenu={(e) => e.preventDefault()}>
      <style>{`.menubar-glass{background:rgba(246,246,248,.62);color:#1d1d1f;box-shadow:inset 0 -0.5px 0 rgba(0,0,0,.12)} html.dark .menubar-glass{background:rgba(22,22,26,.58);color:#f5f5f7;box-shadow:inset 0 -0.5px 0 rgba(255,255,255,.08)} html.solid .menubar-glass{background:rgba(246,246,248,.97)} html.dark.solid .menubar-glass{background:rgba(26,26,30,.97)}`}</style>
      <button className={`${item} ${isOn('menu:logo') ? on : ''}`} onMouseDown={(e) => send('menu', e, 'logo')} onMouseEnter={(e) => menuOpen && send('menu', e, 'logo', true)} title="MACOS X PRO">
        <LogoGlyph />
      </button>
      <button className={`${item} font-bold ${isOn('menu:app') ? on : ''}`} onMouseDown={(e) => send('menu', e, 'app')} onMouseEnter={(e) => menuOpen && send('menu', e, 'app', true)}>
        <span className="max-w-[220px] truncate">{appName}</span>
      </button>
      {MENU_TITLES.map(([id, label]) => (
        <button key={id} className={`${item} ${isOn(`menu:${id}`) ? on : ''}`} onMouseDown={(e) => send('menu', e, id)} onMouseEnter={(e) => menuOpen && send('menu', e, id, true)}>{label}</button>
      ))}
      <div className="flex-1" />
      {s.focusMode && <div className={item} title="Focus is on"><Moon size={14} fill="currentColor" /></div>}
      {battery?.hasBattery && (
        <button className={`${item} ${isOn('battery') ? on : ''}`} onMouseDown={(e) => send('battery', e)}>
          {s.showBatteryPercent && <span className="text-[12px] tabular-nums">{Math.round(battery.percent)}%</span>}
          <BatteryGlyph pct={battery.percent} charging={battery.charging || battery.acConnected} />
        </button>
      )}
      <button className={`${item} ${isOn('control') ? on : ''}`} onMouseDown={(e) => send('control', e)} title={wifi?.ssid ? `Wi-Fi: ${wifi.ssid}` : 'Wi-Fi'}>
        {wifi && (!wifi.supported || !wifi.connected) ? <WifiOff size={15} /> : <Wifi size={15} />}
      </button>
      <button className={`${item} ${isOn('volume') ? on : ''}`} onMouseDown={(e) => send('volume', e)}><VolIcon size={15} /></button>
      <button className={`${item} ${isOn('control') ? on : ''}`} onMouseDown={(e) => send('control', e)} title="Control Centre"><ToggleRight size={16} /></button>
      <button className={`${item} ${isOn('spotlight') ? on : ''}`} onMouseDown={() => void api.invoke('shell:send', 'shell:open', 'spotlight')} title="Spotlight"><Search size={14} /></button>
      <button className={`${item} ${isOn('notifications') ? on : ''}`} onMouseDown={(e) => send('notifications', e)}>
        <span className="tabular-nums whitespace-nowrap">
          {now.toLocaleDateString([], { weekday: 'short' })} {now.toLocaleDateString([], { month: 'short', day: 'numeric' })}&nbsp;&nbsp;
          {now.toLocaleTimeString([], { hour: s.clock24h ? '2-digit' : 'numeric', minute: '2-digit', second: s.showSeconds ? '2-digit' : undefined, hour12: !s.clock24h })}
        </span>
        {unread > 0 && <span className="w-[6px] h-[6px] rounded-full bg-[rgb(var(--accent))]" />}
      </button>
    </div>
  );
}

function LogoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="2.5" y="4" width="19" height="14" rx="3.5" />
      <path d="M9 8.5 L15 13.5 M15 8.5 L9 13.5" />
      <path d="M8 21 H16" />
    </svg>
  );
}

function BatteryGlyph({ pct, charging }: { pct: number; charging: boolean }) {
  const w = Math.max(1.5, (Math.min(100, pct) / 100) * 17);
  const low = pct <= 20 && !charging;
  return (
    <span className="relative inline-flex items-center">
      <svg width="27" height="13" viewBox="0 0 27 13">
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity=".45" />
        <rect x="24.5" y="4" width="2" height="5" rx="1" fill="currentColor" fillOpacity=".45" />
        <rect x="2.5" y="2.5" width={w} height="8" rx="2" fill={low ? '#ff453a' : 'currentColor'} />
      </svg>
      {charging && <BatteryCharging size={0} />}
      {charging && <svg className="absolute left-[7px]" width="10" height="13" viewBox="0 0 10 13"><path d="M6 0 L1 7 H4.5 L3.5 13 L9 5.5 H5.5 Z" fill="#fff" stroke="#000" strokeOpacity=".5" strokeWidth=".6" /></svg>}
    </span>
  );
}
