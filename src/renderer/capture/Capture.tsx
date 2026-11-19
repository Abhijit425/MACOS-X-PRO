import { useEffect, useState } from 'react';
import { api, fileUrl } from '../lib/api';

/** Region selection over a frozen screenshot of the display. */
export default function Capture({ img }: { img: string }) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') void api.invoke('shot:regionFinish', null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const rect = start && cur ? { x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), width: Math.abs(cur.x - start.x), height: Math.abs(cur.y - start.y) } : null;
  return (
    <div className="fixed inset-0 cursor-crosshair select-none" style={{ backgroundImage: `url("${fileUrl(img)}")`, backgroundSize: '100% 100%' }}
      onMouseDown={(e) => { setStart({ x: e.clientX, y: e.clientY }); setCur({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={(e) => { setMouse({ x: e.clientX, y: e.clientY }); if (start) setCur({ x: e.clientX, y: e.clientY }); }}
      onMouseUp={() => { void api.invoke('shot:regionFinish', rect); }}
      onContextMenu={(e) => { e.preventDefault(); void api.invoke('shot:regionFinish', null); }}>
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs><mask id="m"><rect width="100%" height="100%" fill="white" />{rect && <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="black" />}</mask></defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,.35)" mask="url(#m)" />
        {rect && <rect x={rect.x + 0.5} y={rect.y + 0.5} width={rect.width} height={rect.height} fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 3" />}
      </svg>
      <div className="absolute pointer-events-none text-[11px] text-white bg-black/60 px-[6px] py-[1px] rounded" style={{ left: mouse.x + 14, top: mouse.y + 14 }}>
        {rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : `${mouse.x}, ${mouse.y}`}
      </div>
      {!start && <div className="absolute top-6 left-1/2 -translate-x-1/2 glass-strong rounded-full px-4 py-1 text-[12.5px] pointer-events-none">Drag to capture an area · Esc to cancel</div>}
    </div>
  );
}
