import { ReactNode, useEffect, useLayoutEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useSpring } from '../lib/hooks';

export function Toggle({ checked, onChange, disabled, small }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; small?: boolean }) {
  const tr = useSpring(700, 35);
  const w = small ? 30 : 38, h = small ? 18 : 22;
  return (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ width: w, height: h, background: checked ? 'rgb(var(--accent))' : 'rgb(var(--fg) / 0.18)', boxShadow: 'inset 0 0 0 0.5px rgb(0 0 0 / .12)' }}>
      <motion.span layout transition={tr} className="absolute top-[2px] rounded-full bg-white shadow"
        style={{ width: h - 4, height: h - 4, left: checked ? w - h + 2 : 2 }} />
    </button>
  );
}

export function Slider({ value, onChange, onCommit, min = 0, max = 100, step = 1, icon, disabled, className = '' }: {
  value: number; onChange: (v: number) => void; onCommit?: (v: number) => void; min?: number; max?: number; step?: number; icon?: ReactNode; disabled?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const fromEvent = (e: React.PointerEvent | PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const raw = min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min);
    return Math.round(raw / step) * step;
  };
  return (
    <div ref={ref} className={`relative h-[22px] rounded-full overflow-hidden ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
      style={{ background: 'rgb(var(--fg) / 0.12)' }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onChange(fromEvent(e));
        const move = (ev: PointerEvent) => onChange(fromEvent(ev));
        const up = (ev: PointerEvent) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onCommit?.(fromEvent(ev)); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}>
      <div className="absolute inset-y-0 left-0 bg-white/95 dark:bg-white/90 rounded-full" style={{ width: `max(22px, ${pct}%)`, boxShadow: '0 0 4px rgba(0,0,0,.2)' }} />
      {icon && <div className="absolute left-[4px] top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none">{icon}</div>}
    </div>
  );
}

export function RangeInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return <input type="range" className="w-full accent-[rgb(var(--accent))]" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  const tr = useSpring(600, 40);
  return (
    <div className="inline-flex p-[2px] rounded-lg" style={{ background: 'rgb(var(--fg) / 0.08)' }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`relative ${size === 'sm' ? 'px-2 py-[2px] text-[12px]' : 'px-3 py-[3px]'} rounded-md`}>
          {value === o.value && <motion.div layoutId={`seg-${options.map((x) => x.value).join()}`} transition={tr} className="absolute inset-0 rounded-md bg-white dark:bg-white/20 shadow-sm" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) { return <Loader2 size={size} className="animate-spin opacity-60" />; }

export function Empty({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center gap-2 p-8">
      {icon && <div className="opacity-40 mb-1">{icon}</div>}
      <div className="font-semibold text-[15px]">{title}</div>
      {sub && <div className="muted max-w-[340px] leading-snug">{sub}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Row({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-[10px] min-h-[44px]">
      <div className="min-w-0"><div>{label}</div>{sub && <div className="muted text-[12px] mt-[1px] leading-snug">{sub}</div>}</div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}
export function Group({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mb-5">
      {title && <div className="text-[13px] font-semibold mb-2 px-1">{title}</div>}
      <div className="tile divide-y divide-[rgb(var(--stroke)/var(--stroke-a))]">{children}</div>
      {footer && <div className="muted text-[12px] mt-2 px-1 leading-snug">{footer}</div>}
    </div>
  );
}

// ---------- Context menus
export interface MenuItem { label?: string; icon?: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean; checked?: boolean; onClick?: () => void; separator?: boolean; submenu?: MenuItem[] }

export function MenuList({ items, onClose, className = '' }: { items: MenuItem[]; onClose: () => void; className?: string }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div className={`glass-strong rounded-[10px] p-[5px] min-w-[220px] text-[13px] ${className}`} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it.separator ? <div key={i} className="h-px my-[5px] mx-2" style={{ background: 'rgb(var(--fg) / .12)' }} /> : (
        <div key={i} className="relative" onMouseEnter={() => setSub(it.submenu ? i : null)}>
          <button disabled={it.disabled}
            onClick={() => { if (it.submenu) return; onClose(); it.onClick?.(); }}
            className={`w-full flex items-center gap-2 px-2 py-[4px] rounded-[6px] text-left disabled:opacity-35 hover:bg-[rgb(var(--accent))] hover:text-white group ${it.danger ? 'text-[#ff453a]' : ''}`}>
            <span className="w-4 flex justify-center">{it.checked ? <Check size={13} /> : it.icon}</span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && <span className="opacity-50 text-[12px] group-hover:opacity-90">{it.shortcut}</span>}
            {it.submenu && <ChevronRight size={13} className="opacity-60" />}
          </button>
          {it.submenu && sub === i && (
            <div className="absolute left-full top-[-5px] pl-1 z-10"><MenuList items={it.submenu} onClose={onClose} /></div>
          )}
        </div>
      ))}
    </div>
  );
}

interface CtxState { x: number; y: number; items: MenuItem[] }
const CtxMenuContext = createContext<(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => void>(() => undefined);
export const useContextMenu = () => useContext(CtxMenuContext);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CtxState | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const open = useCallback((e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => { e.preventDefault?.(); setState({ x: e.clientX, y: e.clientY, items }); }, []);
  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(state.x, window.innerWidth - r.width - 6), y: Math.min(state.y, window.innerHeight - r.height - 6) });
  }, [state]);
  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('blur', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('blur', close); window.removeEventListener('keydown', key); };
  }, [state]);
  return (
    <CtxMenuContext.Provider value={open}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999]" data-hit onMouseDown={(e) => { if (e.target === e.currentTarget) setState(null); }} onContextMenu={(e) => { e.preventDefault(); setState(null); }}>
          <div ref={ref} className="fixed" style={{ left: pos.x || state.x, top: pos.y || state.y }}>
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.09 }}>
              <MenuList items={state.items} onClose={() => setState(null)} />
            </motion.div>
          </div>
        </div>
      )}
    </CtxMenuContext.Provider>
  );
}

// ---------- Confirm / prompt dialogs (sheet style)
interface DialogReq { title: string; message?: string; confirm?: string; cancel?: string; danger?: boolean; input?: string; resolve: (v: string | boolean | null) => void; icon?: ReactNode }
const DialogContext = createContext<{ confirm: (o: Omit<DialogReq, 'resolve' | 'input'>) => Promise<boolean>; prompt: (o: Omit<DialogReq, 'resolve'> & { input: string }) => Promise<string | null>; alert: (title: string, message?: string) => Promise<void> }>({
  confirm: async () => false, prompt: async () => null, alert: async () => undefined,
});
export const useDialog = () => useContext(DialogContext);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const api = useRef({
    confirm: (o: Omit<DialogReq, 'resolve' | 'input'>) => new Promise<boolean>((resolve) => setReq({ ...o, resolve: (v) => resolve(!!v) })),
    prompt: (o: Omit<DialogReq, 'resolve'> & { input: string }) => new Promise<string | null>((resolve) => { setText(o.input); setReq({ ...o, resolve: (v) => resolve(typeof v === 'string' ? v : null) }); }),
    alert: (title: string, message?: string) => new Promise<void>((resolve) => setReq({ title, message, confirm: 'OK', cancel: '', resolve: () => resolve() })),
  }).current;
  useEffect(() => { if (req?.input !== undefined) setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50); }, [req]);
  const done = (ok: boolean) => { if (!req) return; req.resolve(ok ? (req.input !== undefined ? text : true) : req.input !== undefined ? null : false); setReq(null); };
  return (
    <DialogContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {req && (
          <motion.div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20" data-hit initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onKeyDown={(e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); }}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="glass-strong rounded-2xl p-5 w-[300px] text-center" tabIndex={-1} ref={(el) => { if (el && req.input === undefined) el.focus(); }}>
              {req.icon && <div className="flex justify-center mb-2">{req.icon}</div>}
              <div className="font-semibold text-[14px]">{req.title}</div>
              {req.message && <div className="text-[12px] mt-1 opacity-80 leading-snug whitespace-pre-line">{req.message}</div>}
              {req.input !== undefined && <input ref={inputRef} className="field w-full mt-3 text-left" value={text} onChange={(e) => setText(e.target.value)} />}
              <div className="flex gap-2 mt-4">
                {req.cancel !== '' && <button className="btn flex-1" onClick={() => done(false)}>{req.cancel || 'Cancel'}</button>}
                <button className={`btn flex-1 ${req.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => done(true)}>{req.confirm || 'OK'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

// ---------- Toast (in-window)
const ToastCtx = createContext<(msg: string, kind?: 'info' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback((msg: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10001] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
              className={`glass-strong rounded-xl px-4 py-2 text-[13px] max-w-[460px] ${t.kind === 'error' ? 'text-[#ff453a]' : ''}`}>{t.msg}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider><DialogProvider><ContextMenuProvider>{children}</ContextMenuProvider></DialogProvider></ToastProvider>;
}
