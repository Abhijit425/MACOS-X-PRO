import { useEffect, useState, ReactNode } from 'react';
import { Palette, Image as ImageIcon, PanelBottom, Monitor, LayoutGrid, Bell, Keyboard, Power, Gauge, Shield, Info, Search, ExternalLink, RotateCcw, Check, Sun, Moon, SunMoon } from 'lucide-react';
import type { Settings as S, Shortcuts, SysInfo, WallpaperInfo } from '@shared/types';
import { DEFAULT_SHORTCUTS } from '@shared/types';
import { Window } from '../components/Window';
import { api, openApp } from '../lib/api';
import { useEvent, useInvoke, useSettings } from '../lib/hooks';
import { bytes } from '../lib/format';
import { Group, Row, Toggle, Segmented, RangeInput, useDialog, useToast } from '../components/ui';
import { WIDGET_CATALOG } from '../desktop/widgets';

const SECTIONS = [
  ['appearance', 'Appearance', Palette, '#5e5ce6'], ['wallpapers', 'Wallpaper', ImageIcon, '#32ade6'], ['dock', 'Dock', PanelBottom, '#636366'], ['desktop', 'Desktop & Menu Bar', Monitor, '#0a84ff'],
  ['widgets', 'Widgets', LayoutGrid, '#30d158'], ['notifications', 'Notifications', Bell, '#ff453a'], ['shortcuts', 'Keyboard Shortcuts', Keyboard, '#8e8e93'], ['startup', 'Startup', Power, '#ff9f0a'],
  ['performance', 'Performance', Gauge, '#ff375f'], ['privacy', 'Privacy', Shield, '#0a84ff'], ['about', 'About', Info, '#8e8e93'],
] as const;
type Section = (typeof SECTIONS)[number][0];
const ACCENTS = ['#0a84ff', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#8e8e93'];

export default function Settings() {
  const [s, update] = useSettings();
  const [sec, setSec] = useState<Section>(() => (new URLSearchParams(location.hash.split('?')[1]).get('section') as Section) || 'appearance');
  const [q, setQ] = useState('');
  useEvent<Record<string, string>>('app:args', (a) => { if (a.section) setSec(a.section as Section); });
  const set = (p: Partial<S>) => void update(p);
  const side = (
    <div>
      <div className="flex items-center gap-2 field !py-[3px] mx-1 mb-2"><Search size={13} className="opacity-50" /><input className="bg-transparent outline-none flex-1 text-[12.5px] min-w-0" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {SECTIONS.filter(([, l]) => !q || l.toLowerCase().includes(q.toLowerCase())).map(([k, l, I, c]) => (
        <button key={k} onClick={() => setSec(k)} className={`sidebar-item w-full ${sec === k ? 'active' : ''}`}><span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-white" style={{ background: c }}><I size={13} /></span>{l}</button>
      ))}
    </div>
  );
  const title = SECTIONS.find((x) => x[0] === sec)?.[1];
  return (
    <Window sidebar={side} sidebarWidth={220} title={title}>
      <div className="h-full overflow-y-auto"><div className="max-w-[640px] mx-auto p-6">
        {sec === 'appearance' && <Appearance s={s} set={set} />}
        {sec === 'wallpapers' && <WallpaperSec s={s} set={set} />}
        {sec === 'dock' && <DockSec s={s} set={set} />}
        {sec === 'desktop' && <DesktopSec s={s} set={set} />}
        {sec === 'widgets' && <WidgetsSec s={s} set={set} />}
        {sec === 'notifications' && <NotifSec s={s} set={set} />}
        {sec === 'shortcuts' && <ShortcutSec s={s} set={set} />}
        {sec === 'startup' && <StartupSec s={s} set={set} />}
        {sec === 'performance' && <PerfSec s={s} set={set} />}
        {sec === 'privacy' && <PrivacySec s={s} set={set} />}
        {sec === 'about' && <About />}
      </div></div>
    </Window>
  );
}
type P = { s: S; set: (p: Partial<S>) => void };

function Appearance({ s, set }: P) {
  const toast = useToast();
  return (<>
    <Group title="Appearance">
      <div className="flex gap-4 p-4 justify-center">
        {([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['auto', 'Auto', SunMoon]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => set({ theme: k })} className="flex flex-col items-center gap-2">
            <div className={`w-[110px] h-[70px] rounded-xl border-2 flex items-center justify-center ${s.theme === k ? 'border-[rgb(var(--accent))]' : 'border-transparent'} ${k === 'light' ? 'bg-gradient-to-br from-white to-[#dfe6f2] text-[#444]' : k === 'dark' ? 'bg-gradient-to-br from-[#3a3c46] to-[#111216] text-white' : 'bg-gradient-to-r from-[#e9eef6] to-[#16171c] text-[#888]'}`}><I size={20} /></div>
            <span className="text-[12px]">{l}</span>
          </button>
        ))}
      </div>
      <Row label="Accent colour"><div className="flex gap-2">{ACCENTS.map((c) => <button key={c} onClick={() => set({ accent: c })} className="w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: c, boxShadow: s.accent === c ? `0 0 0 2px rgb(var(--glass)), 0 0 0 3.5px ${c}` : undefined }}>{s.accent === c && <Check size={10} color="white" />}</button>)}</div></Row>
      <Row label="Apply light/dark to Windows too" sub="Changes the Windows app & system theme to match."><button className="btn text-[12px]" onClick={async () => { const m = s.theme === 'auto' ? (document.documentElement.classList.contains('dark') ? 'dark' : 'light') : s.theme; await api.invoke('ostheme:set', m); toast(`Windows switched to ${m} mode`); }}>Apply Now</button></Row>
      <Row label="Reduce transparency" sub="Use solid backgrounds instead of glass."><Toggle checked={s.reduceTransparency} onChange={(v) => set({ reduceTransparency: v })} /></Row>
      <Row label="Text size"><Segmented size="sm" value={String(s.fontScale)} onChange={(v) => set({ fontScale: Number(v) })} options={[{ value: '0.92', label: 'Small' }, { value: '1', label: 'Default' }, { value: '1.08', label: 'Large' }]} /></Row>
    </Group>
    <Group title="Motion" footer="Animations are GPU-accelerated (transform/opacity only).">
      <Row label="Animations"><Segmented size="sm" value={s.animations} onChange={(v) => set({ animations: v })} options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }]} /></Row>
      <Row label="Animation speed"><div className="w-[180px]"><RangeInput value={s.animationSpeed} min={0.6} max={1.6} step={0.1} onChange={(v) => set({ animationSpeed: v })} /></div></Row>
    </Group>
  </>);
}

function WallpaperSec({ s, set }: P) {
  const { data } = useInvoke<WallpaperInfo[]>('wallpapers:list');
  return (<>
    <Group title="Wallpaper">
      <div className="p-3 grid grid-cols-4 gap-2">{(data || []).slice(0, 12).map((w) => <button key={w.id} onClick={() => set({ wallpaper: w.id, wallpaperPerDisplay: {} })} className={`rounded-lg overflow-hidden border-2 ${s.wallpaper === w.id ? 'border-[rgb(var(--accent))]' : 'border-transparent'}`}><img src={w.thumb} className="w-full aspect-video object-cover" alt="" /></button>)}</div>
      <Row label="Dynamic wallpaper" sub="Sonoma & Ridge follow the time of day."><Toggle checked={s.wallpaperDynamic} onChange={(v) => set({ wallpaperDynamic: v })} /></Row>
      <Row label="Rotate automatically"><Toggle checked={s.wallpaperRotate} onChange={(v) => set({ wallpaperRotate: v })} /></Row>
      <Row label="Also set as the Windows wallpaper" sub="Your original Windows wallpaper is remembered and restored when you turn this off."><Toggle checked={s.wallpaperApplyToWindows} onChange={(v) => set({ wallpaperApplyToWindows: v })} /></Row>
      <Row label="More options, per-display wallpapers and importing"><button className="btn text-[12px]" onClick={() => void openApp('wallpapers')}>Open Wallpapers…</button></Row>
    </Group>
  </>);
}

function DockSec({ s, set }: P) {
  return (
    <Group title="Dock" footer="Drag apps from Launchpad (right-click › Add to Dock) or drop an .exe / shortcut onto the Dock. Drag an icon off the Dock to remove it.">
      <Row label="Size"><div className="w-[200px]"><RangeInput value={s.dockSize} min={36} max={84} onChange={(v) => set({ dockSize: v })} /></div></Row>
      <Row label="Magnification"><Toggle checked={s.dockMagnification} onChange={(v) => set({ dockMagnification: v })} /></Row>
      <Row label="Magnification amount"><div className="w-[200px]"><RangeInput value={s.dockMagnifyScale} min={1.2} max={2.2} step={0.05} onChange={(v) => set({ dockMagnifyScale: v })} /></div></Row>
      <Row label="Automatically hide and show the Dock"><Toggle checked={s.dockAutoHide} onChange={(v) => set({ dockAutoHide: v })} /></Row>
      <Row label="Show open apps that aren't in the Dock"><Toggle checked={s.dockShowRecents} onChange={(v) => set({ dockShowRecents: v })} /></Row>
      <Row label="Reset Dock to default apps"><button className="btn text-[12px]" onClick={async () => { const { DEFAULT_SETTINGS } = await import('@shared/types'); set({ dockItems: DEFAULT_SETTINGS.dockItems }); }}><RotateCcw size={12} /> Reset</button></Row>
    </Group>
  );
}

function DesktopSec({ s, set }: P) {
  return (<>
    <Group title="Mode" footer="Your Windows desktop, taskbar and Explorer are never replaced or modified. Hide everything at any time with the tray icon or the Hide shortcut.">
      <Row label="Overlay" sub="Menu bar, Dock and widgets float over the normal Windows desktop."><input type="radio" checked={s.mode === 'overlay'} onChange={() => set({ mode: 'overlay' })} /></Row>
      <Row label="Immersive desktop" sub="Full wallpaper, desktop icons and widgets behind your windows."><input type="radio" checked={s.mode === 'immersive'} onChange={() => set({ mode: 'immersive' })} /></Row>
      <Row label="Hide MACOS X PRO now" sub={`Restores the plain Windows desktop. Shortcut: ${s.shortcuts.toggleShell}`}><button className="btn text-[12px]" onClick={() => void api.invoke('shell:toggle')}>Hide</button></Row>
    </Group>
    <Group title="Menu Bar">
      <Row label="Show menu bar"><Toggle checked={s.menuBarEnabled} onChange={(v) => set({ menuBarEnabled: v })} /></Row>
      <Row label="Reserve screen space for the menu bar" sub="Maximised windows will sit below the menu bar instead of under it."><Toggle checked={s.reserveMenuBarSpace} onChange={(v) => set({ reserveMenuBarSpace: v })} /></Row>
      <Row label="Use 24-hour clock"><Toggle checked={s.clock24h} onChange={(v) => set({ clock24h: v })} /></Row>
      <Row label="Show seconds"><Toggle checked={s.showSeconds} onChange={(v) => set({ showSeconds: v })} /></Row>
      <Row label="Show battery percentage"><Toggle checked={s.showBatteryPercent} onChange={(v) => set({ showBatteryPercent: v })} /></Row>
    </Group>
    <Group title="Windows">
      <Row label="Taskbar settings" sub="Tip: set the Windows taskbar to auto-hide for the cleanest macOS look."><button className="btn text-[12px]" onClick={() => void api.invoke('winsettings:open', 'taskbar')}><ExternalLink size={12} /> Open</button></Row>
      <Row label="Display settings"><button className="btn text-[12px]" onClick={() => void api.invoke('winsettings:open', 'display')}><ExternalLink size={12} /> Open</button></Row>
    </Group>
  </>);
}

function WidgetsSec({ s, set }: P) {
  return (
    <Group title="Widgets" footer="Right-click the desktop and choose “Edit Widgets…” to move, resize and add widgets visually.">
      <Row label="Show desktop widgets"><Toggle checked={s.widgetsEnabled} onChange={(v) => set({ widgetsEnabled: v })} /></Row>
      {WIDGET_CATALOG.map((c) => {
        const on = s.widgets.some((w) => w.type === c.type);
        return <Row key={c.type} label={c.name}><Toggle checked={on} onChange={(v) => set({ widgets: v ? [...s.widgets, { id: `w-${Date.now()}`, type: c.type, x: 40, y: 20, w: c.w, h: c.h, options: {} }] : s.widgets.filter((w) => w.type !== c.type) })} /></Row>;
      })}
    </Group>
  );
}

function NotifSec({ s, set }: P) {
  return (<>
    <Group title="Notifications">
      <Row label="Allow notifications"><Toggle checked={s.notificationsEnabled} onChange={(v) => set({ notificationsEnabled: v })} /></Row>
      <Row label="Show as Windows notifications" sub="Uses native Windows toasts, which also appear in the Windows notification centre. Off = in-app banners."><Toggle checked={s.nativeToasts} onChange={(v) => set({ nativeToasts: v })} /></Row>
      <Row label="Play sound"><Toggle checked={s.notificationSound} onChange={(v) => set({ notificationSound: v })} /></Row>
      <Row label="Send a test notification"><button className="btn text-[12px]" onClick={() => void api.invoke('notify', 'System Settings', 'Notifications are working', 'This is how MACOS X PRO notifications look.')}>Test</button></Row>
    </Group>
    <Group title="Focus" footer="Focus silences banners from MACOS X PRO (alarms, timers and calendar alerts still come through). Notifications from other Windows apps are controlled by Windows Focus / Do not disturb.">
      <Row label="Focus"><Toggle checked={s.focusMode} onChange={(v) => set({ focusMode: v })} /></Row>
      <Row label="Windows Focus / Do not disturb"><button className="btn text-[12px]" onClick={() => void api.invoke('winsettings:open', 'focus')}><ExternalLink size={12} /> Open</button></Row>
    </Group>
  </>);
}

const LABELS: Record<keyof Shortcuts, string> = { spotlight: 'Spotlight', launchpad: 'Launchpad', controlCentre: 'Control Centre', notificationCentre: 'Notification Centre', screenshotFull: 'Screenshot — entire screen', screenshotRegion: 'Screenshot — selected area', toggleShell: 'Hide / show MACOS X PRO' };
function ShortcutSec({ s, set }: P) {
  const [recording, setRecording] = useState<keyof Shortcuts | null>(null);
  const { data: status, reload } = useInvoke<Record<string, { accelerator: string; ok: boolean }>>('shortcuts:status');
  useEffect(() => { const t = setTimeout(() => void reload(), 400); return () => clearTimeout(t); }, [s.shortcuts, reload]);
  useEffect(() => {
    if (!recording) return;
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') { setRecording(null); return; }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
      if (!mods.length && !/^F\d+$/.test(e.key)) return;
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      set({ shortcuts: { ...s.shortcuts, [recording]: [...mods, key].join('+') } });
      setRecording(null);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [recording, s.shortcuts, set]);
  return (
    <Group title="Global keyboard shortcuts" footer="Shortcuts work anywhere in Windows. A red “In use” means another app already owns that combination — pick a different one.">
      {(Object.keys(LABELS) as (keyof Shortcuts)[]).map((k) => (
        <Row key={k} label={LABELS[k]} sub={status?.[k] && !status[k].ok && s.shortcuts[k] ? <span className="text-[#ff453a]">In use by another app — not active</span> : undefined}>
          <button className={`kbd !text-[12px] min-w-[110px] ${recording === k ? '!bg-[rgb(var(--accent))] text-white' : ''}`} onClick={() => setRecording(k)}>{recording === k ? 'Press keys…' : s.shortcuts[k] || 'None'}</button>
          <button className="icon-btn" title="Reset" onClick={() => set({ shortcuts: { ...s.shortcuts, [k]: DEFAULT_SHORTCUTS[k] } })}><RotateCcw size={12} /></button>
        </Row>
      ))}
    </Group>
  );
}

function StartupSec({ s, set }: P) {
  const { data, loading, error } = useInvoke<{ Name: string; Command: string; Location: string; User: string }[]>('startup:list');
  return (<>
    <Group title="MACOS X PRO">
      <Row label="Open at login" sub="Start MACOS X PRO automatically when you sign in to Windows."><Toggle checked={s.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} /></Row>
      <Row label="Run setup assistant again"><button className="btn text-[12px]" onClick={() => void api.invoke('setup:open')}>Open</button></Row>
    </Group>
    <Group title="Other startup apps" footer="Read from Windows. To enable or disable these, use Windows Startup apps settings (this keeps Windows in charge of system configuration).">
      {loading && <Row label="Loading…" />}
      {error && <Row label="Couldn't read startup apps" sub={error} />}
      {(data || []).map((x, i) => <Row key={i} label={x.Name} sub={<span className="break-all">{x.Command}</span>}><span className="text-[11px] muted">{/HKLM|Common/i.test(x.Location) ? 'All users' : 'You'}</span></Row>)}
      <Row label="Manage in Windows"><button className="btn text-[12px]" onClick={() => void api.invoke('winsettings:open', 'startup')}><ExternalLink size={12} /> Startup apps</button></Row>
    </Group>
  </>);
}

function PerfSec({ s, set }: P) {
  return (
    <Group title="Performance" footer="Metrics are only collected while a widget, Activity Monitor or Control Centre needs them — an idle desktop does no polling.">
      <Row label="Live metrics refresh" sub="Lower = smoother charts, higher = less CPU."><Segmented size="sm" value={String(s.metricsIntervalMs)} onChange={(v) => set({ metricsIntervalMs: Number(v) })} options={[{ value: '1000', label: '1s' }, { value: '2000', label: '2s' }, { value: '5000', label: '5s' }]} /></Row>
      <Row label="GPU metrics (NVIDIA)" sub="Queries the NVIDIA driver via nvidia-smi."><Toggle checked={s.gpuMetrics} onChange={(v) => set({ gpuMetrics: v })} /></Row>
      <Row label="Animations"><Segmented size="sm" value={s.animations} onChange={(v) => set({ animations: v })} options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }]} /></Row>
      <Row label="Reduce transparency" sub="Slightly cheaper to draw on older GPUs."><Toggle checked={s.reduceTransparency} onChange={(v) => set({ reduceTransparency: v })} /></Row>
    </Group>
  );
}

function PrivacySec({ s, set }: P) {
  const dialog = useDialog();
  const toast = useToast();
  return (
    <Group title="Privacy" footer="Everything stays on this PC in a local SQLite database. The only network requests are weather forecasts (Open-Meteo) for the city you choose.">
      <Row label="Clipboard history" sub="Remembers text and images you copy."><Toggle checked={s.clipboardHistory} onChange={(v) => set({ clipboardHistory: v })} /></Row>
      <Row label="Clipboard items to keep"><Segmented size="sm" value={String(s.clipboardMax)} onChange={(v) => set({ clipboardMax: Number(v) })} options={[{ value: '50', label: '50' }, { value: '200', label: '200' }, { value: '500', label: '500' }]} /></Row>
      <Row label="Clear clipboard history"><button className="btn text-[12px]" onClick={async () => { if (await dialog.confirm({ title: 'Clear clipboard history?', confirm: 'Clear', danger: true })) { await api.invoke('clips:clear'); toast('Cleared'); } }}>Clear</button></Row>
      <Row label="Show recent files in Spotlight"><Toggle checked={s.recentFilesInSpotlight} onChange={(v) => set({ recentFilesInSpotlight: v })} /></Row>
      <Row label="Index my folders for Spotlight" sub="Desktop, Documents, Downloads, Pictures, Music and Videos (names only, kept in memory)."><Toggle checked={s.fileIndexing} onChange={(v) => set({ fileIndexing: v })} /></Row>
      <Row label="Clear notification history"><button className="btn text-[12px]" onClick={() => void api.invoke('notifications:clear').then(() => toast('Cleared'))}>Clear</button></Row>
      <Row label="Reset all settings"><button className="btn btn-danger text-[12px]" onClick={async () => { if (await dialog.confirm({ title: 'Reset all settings?', message: 'Your notes, events and files are not affected.', confirm: 'Reset', danger: true })) { await api.invoke('settings:reset'); toast('Settings reset'); } }}>Reset…</button></Row>
    </Group>
  );
}

function About() {
  const { data: info } = useInvoke<SysInfo>('sys:info');
  const { data: paths } = useInvoke<{ userData: string }>('app:paths');
  return (
    <div className="flex flex-col items-center text-center gap-3 pt-4">
      <img src="./icon.png" className="w-[110px]" alt="" />
      <div className="text-[26px] font-semibold font-display">MACOS X PRO</div>
      <div className="muted text-[12.5px]">Version {info?.appVersion || '…'} · Electron {info?.electron}</div>
      <div className="tile w-full text-left mt-3 divide-y divide-[rgb(var(--stroke)/var(--stroke-a))]">
        {info && ([['Computer', `${info.manufacturer} ${info.model}`.trim()], ['Name', info.hostname], ['Processor', `${info.cpu} (${info.cores} cores)`], ['Graphics', info.gpus.join(', ') || '—'], ['Memory', bytes(info.memTotal, 0)], ['Windows', `${info.isWin11 ? 'Windows 11' : info.os} · ${info.release} (build ${info.build || info.release.split('.').pop()})`], ['Architecture', info.arch]] as [string, string][]).map(([a, b]) => <Row key={a} label={<span className="muted">{a}</span>}><span className="text-[12.5px] text-right">{b}</span></Row>)}
      </div>
      <div className="flex gap-2 mt-2"><button className="btn text-[12px]" onClick={() => void api.invoke('winsettings:open', 'about')}>Windows System Info…</button>{paths && <button className="btn text-[12px]" onClick={() => void api.invoke('fs:open', paths.userData)}>Open Data Folder</button>}</div>
      <div className="muted text-[11px] mt-4 max-w-[440px] leading-relaxed">A macOS-inspired experience for Windows. Not affiliated with or endorsed by Apple Inc. All artwork and icons are original. Weather data by Open-Meteo.com.</div>
    </div>
  );
}
export type { ReactNode };
