import { memo } from 'react';
import {
  Smile, StickyNote, Calculator, CalendarDays, CloudSun, AlarmClock, Music, Images, Camera, ClipboardList,
  Activity, ListChecks, Image as ImageIcon, Settings, LayoutGrid, Trash2, Download, AppWindow, LucideIcon,
} from 'lucide-react';
import { builtinById } from '@shared/apps';
import { fileUrl } from '../lib/api';

export const ICONS: Record<string, LucideIcon> = {
  Smile, StickyNote, Calculator, CalendarDays, CloudSun, AlarmClock, Music, Images, Camera, ClipboardList, Activity, ListChecks, Image: ImageIcon, Settings, LayoutGrid, Trash2, Download, AppWindow,
};

/** Consistent squircle icon used for every built-in app (original artwork, not Apple assets). */
export const BuiltinIcon = memo(function BuiltinIcon({ id, size = 48 }: { id: string; size?: number }) {
  const def = builtinById(id);
  if (id === 'calendar') return <CalendarGlyph size={size} />;
  if (id === 'finder') return <FinderGlyph size={size} />;
  const Ico = (def && ICONS[def.icon]) || AppWindow;
  const [a, b] = def?.gradient || ['#8e8e93', '#48484a'];
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.235, background: `linear-gradient(160deg, ${a}, ${b})`, boxShadow: `inset 0 ${size * 0.02}px 0 rgba(255,255,255,.35), inset 0 -${size * 0.03}px ${size * 0.06}px rgba(0,0,0,.18), 0 ${size * 0.04}px ${size * 0.1}px rgba(0,0,0,.28)` }}
      className="relative flex items-center justify-center overflow-hidden shrink-0">
      <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0))' }} />
      <Ico size={size * 0.52} color="white" strokeWidth={1.9} style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }} />
    </div>
  );
});

function CalendarGlyph({ size }: { size: number }) {
  const d = new Date();
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.235, boxShadow: `0 ${size * 0.04}px ${size * 0.1}px rgba(0,0,0,.28)` }} className="bg-white flex flex-col items-center overflow-hidden shrink-0">
      <div style={{ fontSize: size * 0.17, height: size * 0.28, lineHeight: `${size * 0.3}px` }} className="w-full text-center font-semibold text-white bg-[#ff3b30] uppercase tracking-wide">
        {d.toLocaleDateString([], { weekday: 'short' })}
      </div>
      <div style={{ fontSize: size * 0.48, lineHeight: 1.15 }} className="font-light text-neutral-800">{d.getDate()}</div>
    </div>
  );
}

function FinderGlyph({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.235, boxShadow: `0 ${size * 0.04}px ${size * 0.1}px rgba(0,0,0,.28)` }} className="overflow-hidden flex shrink-0 relative">
      <div style={{ background: 'linear-gradient(180deg,#7fd3ff,#1f8bff)' }} className="w-1/2 h-full relative">
        <div className="absolute rounded-full bg-[#0b2a55]" style={{ width: size * 0.07, height: size * 0.16, left: size * 0.26, top: size * 0.3 }} />
      </div>
      <div style={{ background: 'linear-gradient(180deg,#e9f4ff,#bcd9ff)' }} className="w-1/2 h-full relative">
        <div className="absolute rounded-full bg-[#0b2a55]" style={{ width: size * 0.07, height: size * 0.16, left: size * 0.14, top: size * 0.3 }} />
      </div>
      <svg className="absolute" width={size} height={size} viewBox="0 0 100 100" style={{ pointerEvents: 'none' }}>
        <path d="M27 66 Q50 80 73 66" stroke="#0b2a55" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M50 8 Q42 40 48 52 L56 52" stroke="#0b2a55" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function ExternalIcon({ icon, name, size = 48 }: { icon?: string | null; name: string; size?: number }) {
  if (icon) {
    return (
      <div style={{ width: size, height: size }} className="flex items-center justify-center shrink-0">
        <img src={icon.startsWith('mxfile:') || icon.startsWith('data:') ? icon : fileUrl(icon)} draggable={false} style={{ width: size * 0.92, height: size * 0.92, objectFit: 'contain', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }} alt="" />
      </div>
    );
  }
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.235, background: `linear-gradient(160deg, hsl(${hue} 70% 60%), hsl(${(hue + 40) % 360} 65% 42%))`, fontSize: size * 0.42 }}
      className="flex items-center justify-center text-white font-semibold shrink-0 shadow-md">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
