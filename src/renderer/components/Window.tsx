import { ReactNode, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, X, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useMotionPrefs } from '../lib/hooks';

export const hasMaterial = () => new URLSearchParams(location.hash.split('?')[1] || '').get('material') === '1';

export function TrafficLights({ onClose }: { onClose?: () => void }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(document.hasFocus());
  useEffect(() => {
    const f = () => setFocused(true), b = () => setFocused(false);
    window.addEventListener('focus', f); window.addEventListener('blur', b);
    return () => { window.removeEventListener('focus', f); window.removeEventListener('blur', b); };
  }, []);
  const dot = (bg: string, icon: ReactNode, onClick: () => void, label: string) => (
    <button aria-label={label} onClick={onClick} className="no-drag w-[12px] h-[12px] rounded-full flex items-center justify-center"
      style={{ background: focused || hover ? bg : 'rgb(var(--fg) / .2)', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.18)' }}>
      {hover && icon}
    </button>
  );
  return (
    <div className="flex gap-2 items-center no-drag" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {dot('#ff5f57', <X size={8} strokeWidth={3} color="#4d0000" />, () => (onClose ? onClose() : void api.invoke('win:close')), 'Close')}
      {dot('#febc2e', <Minus size={8} strokeWidth={3} color="#5a3a00" />, () => void api.invoke('win:minimize'), 'Minimize')}
      {dot('#28c840', <Plus size={8} strokeWidth={3} color="#003d00" />, () => void api.invoke('win:toggleMaximize'), 'Zoom')}
    </div>
  );
}

interface Props {
  title?: ReactNode;
  sidebar?: ReactNode;
  sidebarWidth?: number;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClass?: string;
  bare?: boolean; // content draws its own chrome (e.g. Calculator)
}

export function Window({ title, sidebar, sidebarWidth = 210, toolbar, children, className = '', contentClass = '', bare }: Props) {
  const material = hasMaterial();
  const motionPrefs = useMotionPrefs();
  const [closing, setClosing] = useState(false);
  const close = () => { if (!motionPrefs.enabled) void api.invoke('win:close'); else setClosing(true); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); close(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); void api.invoke('win:minimize'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (typeof title === 'string') void api.invoke('win:setTitle', title).catch(() => undefined); }, [title]);

  const rootBg = material ? 'transparent' : undefined;
  return (
    <motion.div
      initial={motionPrefs.enabled ? { opacity: 0, scale: 0.965, y: 6 } : false}
      animate={closing ? { opacity: 0, scale: 0.94 } : { opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420 * motionPrefs.speed, damping: 34 }}
      onAnimationComplete={() => { if (closing) void api.invoke('win:close'); }}
      className={`h-full w-full flex overflow-hidden ${material ? '' : 'bg-[#f4f4f6] dark:bg-[#1c1c1f]'} ${className}`}
      style={{ background: rootBg }}
    >
      {sidebar && (
        <aside className="h-full flex flex-col shrink-0 border-r border-[rgb(var(--stroke)/var(--stroke-a))]"
          style={{ width: sidebarWidth, background: material ? 'rgb(var(--glass) / 0.25)' : 'rgb(var(--fg) / 0.035)' }}>
          <div className="h-[52px] shrink-0 flex items-center px-[18px] drag" onDoubleClick={() => void api.invoke('win:toggleMaximize')}><TrafficLights onClose={close} /></div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">{sidebar}</div>
        </aside>
      )}
      <main className="flex-1 min-w-0 h-full flex flex-col" style={{ background: bare ? undefined : material ? 'rgb(var(--surface) / 0.72)' : 'rgb(var(--surface) / 0.55)' }}>
        {!bare && (
          <header className="h-[52px] shrink-0 flex items-center gap-3 px-4 drag border-b border-[rgb(var(--stroke)/var(--stroke-a))]" onDoubleClick={(e) => { if (e.target === e.currentTarget) void api.invoke('win:toggleMaximize'); }}>
            {!sidebar && <TrafficLights onClose={close} />}
            {title !== undefined && <div className="font-semibold text-[14px] truncate min-w-0 pointer-events-none">{title}</div>}
            <div className="flex-1" />
            <div className="no-drag flex items-center gap-1">{toolbar}</div>
          </header>
        )}
        {bare && !sidebar && <div className="absolute top-0 left-0 right-0 h-[40px] drag flex items-center px-4 z-10"><TrafficLights onClose={close} /></div>}
        <div className={`flex-1 min-h-0 ${contentClass}`}>{children}</div>
      </main>
    </motion.div>
  );
}
