import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon, SunMoon, Layers, MonitorSmartphone, Check, Search, MapPin, Keyboard, ChevronLeft } from 'lucide-react';
import type { Settings, WallpaperInfo } from '@shared/types';
import { api } from '../lib/api';
import { useSettings } from '../lib/hooks';
import { geocode } from '../lib/weather';
import { TrafficLights, hasMaterial } from '../components/Window';
import { Toggle } from '../components/ui';

const STEPS = ['welcome', 'look', 'mode', 'wallpaper', 'weather', 'done'] as const;
const ACCENTS = ['#0a84ff', '#bf5af2', '#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#8e8e93'];

export default function Setup() {
  const [s, update] = useSettings();
  const [step, setStep] = useState(0);
  const [patch, setPatch] = useState<Partial<Settings>>({});
  const [walls, setWalls] = useState<WallpaperInfo[]>([]);
  const [q, setQ] = useState('');
  const [cities, setCities] = useState<{ name: string; lat: number; lon: number; country?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const v = { ...s, ...patch };
  const set = (p: Partial<Settings>) => { setPatch((x) => ({ ...x, ...p })); if ('theme' in p || 'accent' in p) void update(p); };
  useEffect(() => { void api.invoke<WallpaperInfo[]>('wallpapers:list').then(setWalls).catch(() => undefined); }, []);
  const material = hasMaterial();
  const id = STEPS[step];
  const next = () => setStep((x) => Math.min(STEPS.length - 1, x + 1));
  const finish = () => void api.invoke('setup:complete', patch);

  return (
    <div className={`h-full w-full flex flex-col ${material ? '' : 'bg-gradient-to-br from-[#1b1b22] to-[#101014]'} text-white`} style={{ background: material ? 'rgba(18,18,24,.55)' : undefined }}>
      <div className="h-[44px] drag flex items-center px-4 shrink-0"><TrafficLights /></div>
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="absolute inset-0 px-14 pb-4 flex flex-col">
            {id === 'welcome' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
                <motion.img src="./icon.png" className="w-[120px] h-[120px]" initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }} />
                <div className="text-[36px] font-semibold font-display tracking-tight">Welcome to MACOS X PRO</div>
                <div className="text-white/70 max-w-[520px] leading-relaxed">A premium, macOS-inspired desktop for your Windows PC — menu bar, Dock, Spotlight, Launchpad, widgets and a suite of apps, all working with your real files and hardware.<br /><span className="text-white/50 text-[12px]">Windows itself is never modified. You can hide or quit MACOS X PRO any time from the tray icon.</span></div>
              </div>
            )}
            {id === 'look' && (
              <Section title="Choose your look" sub="You can change this any time in System Settings › Appearance.">
                <div className="flex gap-4 justify-center">
                  {([['light', 'Light', <Sun key="s" />], ['dark', 'Dark', <Moon key="m" />], ['auto', 'Auto', <SunMoon key="a" />]] as const).map(([k, label, icon]) => (
                    <button key={k} onClick={() => set({ theme: k })} className={`w-[150px] rounded-2xl p-3 border-2 transition ${v.theme === k ? 'border-[rgb(var(--accent))] bg-white/10' : 'border-transparent bg-white/5 hover:bg-white/10'}`}>
                      <div className={`h-[86px] rounded-xl mb-2 flex items-center justify-center ${k === 'light' ? 'bg-gradient-to-br from-white to-[#dfe6f2] text-[#333]' : k === 'dark' ? 'bg-gradient-to-br from-[#2d2f38] to-[#111216]' : 'bg-gradient-to-r from-[#e9eef6] via-[#7a7f8f] to-[#16171c]'}`}>{icon}</div>
                      <div className="text-[13px]">{label}</div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 justify-center mt-6">{ACCENTS.map((c) => <button key={c} onClick={() => set({ accent: c })} className="w-[26px] h-[26px] rounded-full flex items-center justify-center ring-offset-2 ring-offset-[#18181d]" style={{ background: c, boxShadow: v.accent === c ? `0 0 0 2px #18181d, 0 0 0 4px ${c}` : undefined }}>{v.accent === c && <Check size={13} />}</button>)}</div>
                <div className="text-center text-white/50 text-[12px] mt-2">Accent colour</div>
              </Section>
            )}
            {id === 'mode' && (
              <Section title="How should it run?" sub="Both modes keep your Windows desktop fully recoverable — use the tray icon or Alt+Shift+M to hide everything instantly.">
                <div className="flex gap-4 justify-center">
                  {([['overlay', 'Overlay', <Layers key="o" size={22} />, 'Menu bar, Dock and widgets float over your normal Windows desktop and taskbar.'], ['immersive', 'Immersive Desktop', <MonitorSmartphone key="i" size={22} />, 'A full macOS-style desktop with wallpaper, desktop icons and widgets behind your apps.']] as const).map(([k, label, icon, desc]) => (
                    <button key={k} onClick={() => set({ mode: k })} className={`w-[260px] text-left rounded-2xl p-4 border-2 transition ${v.mode === k ? 'border-[rgb(var(--accent))] bg-white/10' : 'border-transparent bg-white/5 hover:bg-white/10'}`}>
                      <div className="mb-2 text-[rgb(var(--accent))]">{icon}</div><div className="font-semibold">{label}</div><div className="text-[12px] text-white/60 mt-1 leading-snug">{desc}</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3 mt-6 text-[13px]"><Toggle checked={v.reserveMenuBarSpace} onChange={(x) => set({ reserveMenuBarSpace: x })} /> Reserve space for the menu bar so maximised windows sit below it</div>
                <div className="flex items-center justify-center gap-3 mt-3 text-[13px]"><Toggle checked={v.launchAtLogin} onChange={(x) => set({ launchAtLogin: x })} /> Start MACOS X PRO when I sign in to Windows</div>
              </Section>
            )}
            {id === 'wallpaper' && (
              <Section title="Pick a wallpaper" sub="Dynamic wallpapers (Sonoma, Ridge) change with the time of day.">
                <div className="grid grid-cols-4 gap-3 overflow-y-auto pr-1" style={{ maxHeight: 330 }}>
                  {walls.filter((w) => !w.custom).map((w) => (
                    <button key={w.id} onClick={() => set({ wallpaper: w.id })} className={`rounded-xl overflow-hidden border-2 ${v.wallpaper === w.id ? 'border-[rgb(var(--accent))]' : 'border-transparent'}`}>
                      <img src={w.thumb} className="w-full aspect-video object-cover" alt="" /><div className="text-[11.5px] py-1 bg-white/5">{w.name}</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3 mt-3 text-[12.5px]"><Toggle small checked={v.wallpaperApplyToWindows} onChange={(x) => set({ wallpaperApplyToWindows: x })} /> Also set it as my Windows wallpaper (your current one is remembered and can be restored)</div>
              </Section>
            )}
            {id === 'weather' && (
              <Section title="Where are you?" sub="Used only for the Weather app and widgets (Open-Meteo, no account needed). You can skip this.">
                <form className="flex gap-2 justify-center" onSubmit={async (e) => { e.preventDefault(); if (!q.trim()) return; setSearching(true); try { setCities(await geocode(q)); } catch { setCities([]); } finally { setSearching(false); } }}>
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 w-[340px]"><Search size={15} className="opacity-60" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for your city" className="bg-transparent outline-none py-2 flex-1" /></div>
                  <button className="btn btn-primary" type="submit">{searching ? '…' : 'Search'}</button>
                </form>
                <div className="mt-4 flex flex-col items-center gap-1 max-h-[220px] overflow-y-auto">
                  {cities.map((c) => (
                    <button key={`${c.lat},${c.lon}`} onClick={() => set({ weatherCity: c })} className={`w-[420px] flex items-center gap-2 px-3 py-2 rounded-lg text-left ${v.weatherCity?.lat === c.lat ? 'bg-[rgb(var(--accent))]' : 'hover:bg-white/10'}`}>
                      <MapPin size={14} /><span className="flex-1">{c.name}<span className="text-white/55 text-[12px]"> — {c.country}</span></span>{v.weatherCity?.lat === c.lat && <Check size={14} />}
                    </button>
                  ))}
                  {v.weatherCity && !cities.length && <div className="text-white/70 text-[13px]"><MapPin size={13} className="inline" /> {v.weatherCity.name}</div>}
                </div>
                <div className="flex justify-center gap-2 mt-4 text-[13px]">Units:
                  {(['metric', 'imperial'] as const).map((u) => <button key={u} onClick={() => set({ weatherUnits: u })} className={`px-3 rounded-md ${v.weatherUnits === u ? 'bg-white/20' : 'bg-white/5'}`}>{u === 'metric' ? '°C' : '°F'}</button>)}
                </div>
              </Section>
            )}
            {id === 'done' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="w-[74px] h-[74px] rounded-full bg-[rgb(var(--accent))] flex items-center justify-center"><Check size={38} /></motion.div>
                <div className="text-[30px] font-semibold font-display">You're all set</div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] text-white/80 mt-2">
                  {[['Spotlight', s.shortcuts.spotlight], ['Launchpad', s.shortcuts.launchpad], ['Control Centre', s.shortcuts.controlCentre], ['Notification Centre', s.shortcuts.notificationCentre], ['Screenshot (full)', s.shortcuts.screenshotFull], ['Screenshot (area)', s.shortcuts.screenshotRegion], ['Hide / show everything', s.shortcuts.toggleShell]].map(([a, b]) => (
                    <div key={a} className="flex justify-between gap-6"><span><Keyboard size={12} className="inline mr-1 opacity-60" />{a}</span><span className="kbd !bg-white/10 !text-white">{b}</span></div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="h-[64px] shrink-0 flex items-center justify-between px-8 border-t border-white/10">
        <div className="flex gap-[6px]">{STEPS.map((x, i) => <div key={x} className={`h-[6px] rounded-full transition-all ${i === step ? 'w-[18px] bg-white' : 'w-[6px] bg-white/30'}`} />)}</div>
        <div className="flex gap-2">
          {step > 0 && step < STEPS.length - 1 && <button className="btn !bg-white/10 !text-white" onClick={() => setStep(step - 1)}><ChevronLeft size={14} /> Back</button>}
          {id === 'weather' && <button className="btn !bg-white/10 !text-white" onClick={next}>Skip</button>}
          {id === 'done' ? <button className="btn btn-primary px-6" onClick={finish}>Start using MACOS X PRO</button> : <button className="btn btn-primary px-6" onClick={next}>{step === 0 ? 'Get Started' : 'Continue'}</button>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col pt-4">
      <div className="text-center mb-6"><div className="text-[26px] font-semibold font-display">{title}</div>{sub && <div className="text-white/60 text-[13px] mt-1 max-w-[560px] mx-auto">{sub}</div>}</div>
      {children}
    </div>
  );
}
