import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Window } from '../components/Window';
import { evaluate, formatNumber } from '../lib/calc';
import { api } from '../lib/api';
import { useLocalStorage } from '../lib/hooks';

type Mode = 'basic' | 'scientific';

export default function Calculator() {
  const [mode, setMode] = useLocalStorage<Mode>('calc:mode', 'basic');
  const [expr, setExpr] = useState('');
  const [display, setDisplay] = useState('0');
  const [justEval, setJustEval] = useState(false);
  const [deg, setDeg] = useLocalStorage('calc:deg', true);
  const [mem, setMem] = useState(0);
  const [tape, setTape] = useLocalStorage<{ e: string; r: string }[]>('calc:tape', []);
  const [showTape, setShowTape] = useState(false);

  useEffect(() => { void api.invoke('win:setTitle', 'Calculator').catch(() => undefined); }, []);
  useEffect(() => {
    // resize window to fit mode (scientific is wider)
  }, [mode]);

  const live = useCallback((e: string) => { try { const v = evaluate(e, { degrees: deg }); return Number.isFinite(v) ? formatNumber(v) : null; } catch { return null; } }, [deg]);

  const press = useCallback((k: string) => {
    if (k === 'AC') { setExpr(''); setDisplay('0'); setJustEval(false); return; }
    if (k === '⌫') { setExpr((x) => { const n = x.slice(0, -1); setDisplay(n ? live(n) ?? n : '0'); return n; }); return; }
    if (k === '=') {
      if (!expr) return;
      try {
        const v = evaluate(expr, { degrees: deg });
        const r = formatNumber(v);
        setTape([{ e: expr, r }, ...tape].slice(0, 100));
        setDisplay(r); setExpr(String(Number.isFinite(v) ? parseFloat(v.toPrecision(14)) : '')); setJustEval(true);
      } catch { setDisplay('Error'); }
      return;
    }
    if (k === '±') { setExpr((x) => { const n = x ? `-(${x})` : '-'; setDisplay(live(n) ?? n); return n; }); return; }
    if (k === 'mc') return setMem(0);
    if (k === 'm+') return setMem((m) => m + (Number(display.replace(/,/g, '')) || 0));
    if (k === 'm-') return setMem((m) => m - (Number(display.replace(/,/g, '')) || 0));
    if (k === 'mr') k = String(mem);
    const fnKeys: Record<string, string> = { 'x²': '^2', 'x³': '^3', 'xʸ': '^', '√': 'sqrt(', '∛': 'cbrt(', '1/x': '1/(', 'ln': 'ln(', 'log': 'log(', 'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(', 'eˣ': 'e^', '10ˣ': '10^', 'x!': '!', 'π': 'pi', 'e': 'e', 'EE': 'e', 'Rand': String(Math.random().toFixed(8)) };
    const ins = fnKeys[k] ?? k;
    setExpr((x) => {
      const startsFresh = justEval && /^[\d.(πe√]|^(sqrt|cbrt|ln|log|sin|cos|tan|pi|1\/)/.test(ins);
      const n = (startsFresh ? '' : x) + ins;
      setDisplay(live(n) ?? (n.length > 18 ? '…' + n.slice(-17) : n));
      return n;
    });
    setJustEval(false);
  }, [expr, deg, display, live, mem, justEval, tape, setTape]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'c') { void navigator.clipboard.writeText(display.replace(/,/g, '')); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'v') { void navigator.clipboard.readText().then((t) => { const c = t.replace(/[^\d.+\-*/()^%e]/gi, ''); if (c) press(c); }); return; }
      if (e.ctrlKey) return;
      const map: Record<string, string> = { Enter: '=', '=': '=', Backspace: '⌫', Escape: 'AC', Delete: 'AC', '*': '×', '/': '÷', x: '×' };
      const k = map[e.key] ?? (/^[\d.+\-%^()!]$/.test(e.key) ? e.key : null);
      if (k) { e.preventDefault(); press(k === '×' ? '*' : k === '÷' ? '/' : k); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, display]);

  const basic = [['AC', '±', '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['⌫', '0', '.', '=']];
  const sci = [['(', ')', 'mc', 'm+', 'm-', 'mr'], ['x²', 'x³', 'xʸ', 'eˣ', '10ˣ', 'x!'], ['1/x', '√', '∛', 'ln', 'log', 'Rand'], ['sin', 'cos', 'tan', 'π', 'e', 'EE']];
  const keyToInput = (k: string) => (k === '×' ? '*' : k === '÷' ? '/' : k === '−' ? '-' : k);

  return (
    <Window bare className="!bg-[#1c1c1e] dark:!bg-[#1c1c1e]">
      <div className="h-full flex text-white select-none" style={{ background: 'linear-gradient(180deg,#2a2a2d,#1c1c1e)' }}>
        <div className="flex-1 flex flex-col p-[10px] pt-[40px]">
          <div className="flex justify-end gap-2 items-center h-[20px] no-drag">
            <button className={`text-[11px] px-2 rounded ${mode === 'scientific' ? 'bg-white/20' : 'bg-white/5'}`} onClick={() => setMode(mode === 'basic' ? 'scientific' : 'basic')}>{mode === 'basic' ? 'Scientific' : 'Basic'}</button>
            {mode === 'scientific' && <button className="text-[11px] px-2 rounded bg-white/5" onClick={() => setDeg(!deg)}>{deg ? 'Deg' : 'Rad'}</button>}
            <button className={`p-1 rounded ${showTape ? 'bg-white/20' : ''}`} onClick={() => setShowTape(!showTape)} title="History"><History size={13} /></button>
          </div>
          <div className="text-right px-2 text-white/45 text-[13px] h-[20px] truncate mt-2">{justEval ? '' : expr.replace(/\*/g, '×').replace(/\//g, '÷')}</div>
          <div className="text-right px-2 font-light tabular-nums truncate" style={{ fontSize: display.length > 12 ? 34 : 52, lineHeight: '64px' }} title="Ctrl+C to copy">{display}</div>
          {mem !== 0 && <div className="text-[10px] text-white/50 px-2">M = {formatNumber(mem)}</div>}
          <div className="flex-1 flex flex-col gap-[8px] mt-2">
            {mode === 'scientific' && sci.map((row, i) => (
              <div key={`s${i}`} className="flex-1 grid gap-[8px]" style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
                {row.map((k) => <Key key={k} k={k} kind="fn" onPress={() => press(k)} />)}
              </div>
            ))}
            {basic.map((row, i) => (
              <div key={i} className="flex-1 grid grid-cols-4 gap-[8px]">
                {row.map((k) => <Key key={k} k={k} kind={/^[÷×−+=]$/.test(k) ? 'op' : /^(AC|±|%)$/.test(k) ? 'fn' : 'num'} onPress={() => press(keyToInput(k))} />)}
              </div>
            ))}
          </div>
        </div>
        {showTape && (
          <div className="w-[200px] border-l border-white/10 flex flex-col pt-[40px]">
            <div className="flex justify-between items-center px-3 pb-2"><span className="text-[12px] font-semibold text-white/70">History</span><button className="text-[11px] text-white/50 hover:text-white" onClick={() => setTape([])}>Clear</button></div>
            <div className="flex-1 overflow-y-auto px-3 space-y-2">
              {tape.map((t, i) => <button key={i} className="block w-full text-right" onClick={() => { setExpr(t.r.replace(/,/g, '')); setDisplay(t.r); setJustEval(true); }}><div className="text-[11px] text-white/45 truncate">{t.e}</div><div className="text-[15px]">{t.r}</div></button>)}
            </div>
          </div>
        )}
      </div>
    </Window>
  );
}

function Key({ k, kind, onPress }: { k: string; kind: 'num' | 'op' | 'fn'; onPress: () => void }) {
  const bg = kind === 'op' ? 'bg-[#ff9f0a] hover:bg-[#ffb340] active:bg-[#d98500]' : kind === 'fn' ? 'bg-white/[.16] hover:bg-white/25 active:bg-white/30' : 'bg-white/[.08] hover:bg-white/[.14] active:bg-white/20';
  return <button onClick={onPress} className={`rounded-full ${bg} text-[19px] font-normal transition-colors active:scale-[.97] min-h-[34px]`} style={{ fontSize: k.length > 2 ? 13 : undefined }}>{k}</button>;
}
