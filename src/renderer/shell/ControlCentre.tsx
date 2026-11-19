import { useEffect, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Bluetooth, Moon, SunMoon, Sun, Volume2, VolumeX, Monitor, Battery, BatteryCharging, Camera, ChevronRight, Lock, Settings2, Eye, Loader2, AppWindow } from 'lucide-react';
import type { ControlState, WifiState } from '@shared/types';
import { api, openApp } from '../lib/api';
import { useMetrics, useSettings } from '../lib/hooks';
import { Slider, useToast } from '../components/ui';

export function ControlCentre({ x, onClose }: { x: number; onClose: () => void }) {
  const [s, update] = useSettings();
  const [state, setState] = useState<ControlState | null>(null);
  const [wifi, setWifi] = useState<WifiState | null>(null);
  const [bt, setBt] = useState<ControlState['bluetooth'] | null>(null);
  const [vol, setVol] = useState<number | null>(null);
  const [bri, setBri] = useState<number | null>(null);
  const [panel, setPanel] = useState<'wifi' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const m = useMetrics();
  const toast = useToast();

  useEffect(() => {
    void api.invoke<ControlState>('controls:state').then((c) => { setState(c); setVol(c.volume.level); setBri(c.brightness.level); }).catch(() => undefined);
    void api.invoke<WifiState>('wifi:get', false).then(setWifi).catch(() => undefined);
    void api.invoke<ControlState['bluetooth']>('bluetooth:get').then(setBt).catch(() => setBt({ supported: false, on: null }));
  }, []);

  const scan = async () => { setPanel('wifi'); setBusy('scan'); try { setWifi(await api.invoke<WifiState>('wifi:get', true)); } finally { setBusy(null); } };
  const winSettings = (p: string) => { onClose(); void api.invoke('winsettings:open', p); };
  const toggleBt = async () => {
    if (!bt?.supported) return winSettings('bluetooth');
    setBusy('bt');
    try { setBt(await api.invoke('bluetooth:set', !bt.on)); } catch (e) { toast(`Bluetooth: ${(e as Error).message}. Opening Windows settings.`, 'error'); winSettings('bluetooth'); } finally { setBusy(null); }
  };
  const dark = s.theme === 'dark' || (s.theme === 'auto' && document.documentElement.classList.contains('dark'));

  return (
    <motion.div data-hit initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      className="fixed top-[6px] w-[340px] glass-strong rounded-[20px] p-3 z-50" style={{ left: Math.min(window.innerWidth - 350, Math.max(10, x - 300)) }}>
      <AnimatePresence mode="wait" initial={false}>
        {panel === 'wifi' ? (
          <motion.div key="wifi" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="min-h-[300px]">
            <div className="flex items-center justify-between px-1 mb-2">
              <button className="text-[12px] text-[rgb(var(--accent))]" onClick={() => setPanel(null)}>‹ Back</button>
              <div className="font-semibold">Wi-Fi</div>
              <button className="text-[12px] muted" onClick={scan}>{busy === 'scan' ? <Loader2 size={13} className="animate-spin" /> : 'Rescan'}</button>
            </div>
            {wifi?.error && <div className="text-[12px] muted px-2 pb-2 leading-snug">{wifi.error}</div>}
            <div className="max-h-[300px] overflow-y-auto">
              {wifi?.networks.map((n) => (
                <button key={n.ssid} className="w-full flex items-center gap-3 px-2 py-[6px] rounded-lg hoverable text-left"
                  onClick={async () => {
                    if (wifi.ssid === n.ssid) return;
                    if (!n.known) { toast(`“${n.ssid}” needs a password — finish joining in Windows Wi-Fi settings.`); return winSettings('wifi'); }
                    setBusy(n.ssid);
                    const r = await api.invoke<{ ok: boolean; message: string }>('wifi:connect', n.ssid).catch((e: Error) => ({ ok: false, message: e.message }));
                    setBusy(null);
                    toast(r.ok ? `Connecting to ${n.ssid}…` : r.message, r.ok ? 'info' : 'error');
                    setTimeout(() => void api.invoke<WifiState>('wifi:get', true).then(setWifi), 3500);
                  }}>
                  <SignalIcon level={n.signal} />
                  <span className="flex-1 truncate">{n.ssid}</span>
                  {busy === n.ssid && <Loader2 size={13} className="animate-spin" />}
                  {wifi.ssid === n.ssid ? <span className="text-[11px] text-[rgb(var(--accent))]">Connected</span> : <span className="text-[11px] muted">{n.known ? 'Saved' : n.auth.replace('-Personal', '')}</span>}
                </button>
              ))}
              {wifi && wifi.networks.length === 0 && !busy && <div className="muted text-[12px] p-3 text-center">No networks listed.</div>}
            </div>
            <div className="h-px my-2 bg-[rgb(var(--fg)/.1)]" />
            {wifi?.connected && <button className="w-full text-left px-2 py-[6px] rounded-lg hoverable" onClick={async () => { await api.invoke('wifi:disconnect'); setWifi(await api.invoke('wifi:get', true)); }}>Disconnect from {wifi.ssid}</button>}
            <button className="w-full text-left px-2 py-[6px] rounded-lg hoverable" onClick={() => winSettings('wifi')}>Wi-Fi Settings…</button>
          </motion.div>
        ) : (
          <motion.div key="main" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid grid-cols-4 gap-[10px]">
            <div className="col-span-2 row-span-2 tile p-2 flex flex-col gap-1">
              <BigToggle on={!!wifi?.connected} icon={wifi?.supported === false ? <WifiOff size={16} /> : <Wifi size={16} />} label="Wi-Fi" sub={wifi ? (wifi.supported ? (wifi.connected ? wifi.ssid || 'Connected' : 'Not connected') : 'No adapter') : '…'} onClick={scan} chevron />
              <BigToggle on={!!bt?.on} icon={busy === 'bt' ? <Loader2 size={16} className="animate-spin" /> : <Bluetooth size={16} />} label="Bluetooth" sub={bt ? (bt.supported ? (bt.on ? 'On' : 'Off') : 'Open settings') : '…'} onClick={toggleBt} />
              <BigToggle on={s.focusMode} icon={<Moon size={16} />} label="Focus" sub={s.focusMode ? 'On — banners silenced' : 'Off'} onClick={() => update({ focusMode: !s.focusMode })} />
            </div>
            <div className="col-span-2 tile p-2 flex items-center gap-2 cursor-pointer hoverable" onClick={() => update({ theme: dark ? 'light' : 'dark' })}>
              <Round on={dark}>{dark ? <Moon size={15} /> : <Sun size={15} />}</Round>
              <div className="leading-tight"><div className="text-[12px] font-semibold">{dark ? 'Dark Mode' : 'Light Mode'}</div><div className="text-[11px] muted">{s.theme === 'auto' ? 'Following Windows' : 'MACOS X PRO'}</div></div>
            </div>
            <button className="tile p-2 flex flex-col items-center justify-center gap-1 hoverable" onClick={() => winSettings('nightlight')} title="Opens Windows Night light settings">
              <SunMoon size={18} /><span className="text-[10.5px] leading-tight text-center">Night Light</span>
            </button>
            <button className="tile p-2 flex flex-col items-center justify-center gap-1 hoverable" onClick={() => { onClose(); setTimeout(() => void api.invoke('shot:region'), 300); }}>
              <Camera size={18} /><span className="text-[10.5px] leading-tight text-center">Screenshot</span>
            </button>
            <div className="col-span-4 tile p-3">
              <div className="flex items-center justify-between mb-2"><span className="text-[12px] font-semibold">Display</span><button className="text-[11px] muted hover:underline" onClick={() => winSettings('display')}>Display Settings…</button></div>
              {state?.brightness.supported ? (
                <Slider value={bri ?? 0} onChange={setBri} onCommit={(v) => void api.invoke<ControlState['brightness']>('brightness:set', v).then((b) => setBri(b.level)).catch((e: Error) => toast(e.message, 'error'))} icon={<Sun size={13} />} />
              ) : <div className="text-[11.5px] muted leading-snug">{state ? 'This display does not expose brightness control to Windows (common for external monitors). Use the monitor’s own buttons.' : 'Checking…'}</div>}
            </div>
            <div className="col-span-4 tile p-3">
              <div className="flex items-center justify-between mb-2"><span className="text-[12px] font-semibold">Sound</span><button className="text-[11px] muted hover:underline" onClick={() => winSettings('sound')}>Sound Settings…</button></div>
              {state?.volume.supported ? (
                <div className="flex items-center gap-2">
                  <button className="icon-btn" onClick={() => void api.invoke<ControlState['volume']>('mute:set', !state.volume.muted).then((v) => setState({ ...state, volume: v }))}>{state.volume.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
                  <Slider className="flex-1" value={vol ?? 0} onChange={(v) => { setVol(v); void api.invoke('volume:set', v); }} onCommit={(v) => void api.invoke<ControlState['volume']>('volume:set', v).then((x) => setState({ ...state, volume: x }))} />
                  <span className="text-[11px] w-8 text-right tabular-nums">{vol}%</span>
                </div>
              ) : <div className="text-[11.5px] muted">{state ? 'No default audio output device found.' : 'Checking…'}</div>}
            </div>
            <div className="col-span-2 tile p-2 flex items-center gap-2">
              <Round on={!!m?.battery.charging}>{m?.battery.charging ? <BatteryCharging size={15} /> : <Battery size={15} />}</Round>
              <div className="leading-tight text-[12px]">{m?.battery.hasBattery ? <><b>{Math.round(m.battery.percent)}%</b><div className="text-[11px] muted">{m.battery.charging ? 'Charging' : m.battery.acConnected ? 'Plugged in' : m.battery.timeRemaining ? `${Math.floor(m.battery.timeRemaining / 60)}h ${m.battery.timeRemaining % 60}m left` : 'On battery'}</div></> : <span className="muted">No battery</span>}</div>
            </div>
            <button className="tile p-2 flex flex-col items-center justify-center gap-1 hoverable" onClick={() => { onClose(); void api.invoke('keys:showDesktop'); }}><Monitor size={18} /><span className="text-[10.5px]">Desktop</span></button>
            <button className="tile p-2 flex flex-col items-center justify-center gap-1 hoverable" onClick={() => { onClose(); void api.invoke('power', 'lock'); }}><Lock size={18} /><span className="text-[10.5px]">Lock</span></button>
            <button className="col-span-2 tile px-3 py-2 flex items-center gap-2 hoverable text-[12px]" onClick={() => { onClose(); void openApp('settings'); }}><Settings2 size={15} /> System Settings</button>
            <button className="col-span-2 tile px-3 py-2 flex items-center gap-2 hoverable text-[12px]" onClick={() => winSettings('focus')}><Eye size={15} /> Windows Focus…</button>
            <button className="col-span-4 tile px-3 py-2 flex items-center gap-2 hoverable text-[12px]" onClick={() => { onClose(); void api.invoke('keys:taskView'); }}><AppWindow size={15} /> Task View</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Round({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 transition-colors" style={{ background: on ? 'rgb(var(--accent))' : 'rgb(var(--fg) / .12)', color: on ? 'white' : undefined }}>{children}</span>;
}
function BigToggle({ on, icon, label, sub, onClick, chevron }: { on: boolean; icon: ReactNode; label: string; sub: string; onClick: () => void; chevron?: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 p-1 rounded-xl hoverable text-left">
      <Round on={on}>{icon}</Round>
      <span className="leading-tight min-w-0 flex-1"><div className="text-[12px] font-semibold">{label}</div><div className="text-[11px] muted truncate">{sub}</div></span>
      {chevron && <ChevronRight size={13} className="opacity-50" />}
    </button>
  );
}
export function SignalIcon({ level }: { level: number }) {
  const bars = level > 75 ? 3 : level > 45 ? 2 : 1;
  return <span className="relative inline-flex"><Wifi size={15} style={{ opacity: 0.25 }} /><span className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${(3 - bars) * 30}% 0 0 0)` }}><Wifi size={15} /></span></span>;
}
