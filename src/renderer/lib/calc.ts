// Safe math evaluator (no eval) + unit conversion, shared by Calculator and Spotlight.
type Tok = { t: 'n'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string } | { t: '('; } | { t: ')' } | { t: ',' };

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,_]/.test(s[j]) && !(s[j] === ',' && !/\d{3}(\D|$)/.test(s.slice(j + 1, j + 5)))) j++;
      if (s[j] === 'e' && /[+-]?\d/.test(s.slice(j + 1, j + 3))) { j++; if (/[+-]/.test(s[j])) j++; while (/\d/.test(s[j] || '')) j++; }
      const v = Number(s.slice(i, j).replace(/[,_]/g, ''));
      if (!Number.isFinite(v)) throw new Error('bad number');
      out.push({ t: 'n', v });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(c)) { let j = i; while (j < s.length && /[a-z0-9]/i.test(s[j])) j++; out.push({ t: 'id', v: s.slice(i, j).toLowerCase() }); i = j; continue; }
    if ('+-*/^%!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: '(' }); i++; continue; }
    if (c === ')') { out.push({ t: ')' }); i++; continue; }
    if (c === ',') { out.push({ t: ',' }); i++; continue; }
    throw new Error(`Unexpected ${c}`);
  }
  return out;
}

const FN: Record<string, (...a: number[]) => number> = {
  sin: (x) => Math.sin(x), cos: (x) => Math.cos(x), tan: (x) => Math.tan(x), asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp,
  round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow,
};
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

function fact(n: number) { if (n < 0 || !Number.isInteger(n) || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

export function evaluate(expr: string, opts: { degrees?: boolean } = {}): number {
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const trig = (name: string, x: number) => (opts.degrees && /^(sin|cos|tan)$/.test(name) ? (x * Math.PI) / 180 : x);
  const itrig = (name: string, x: number) => (opts.degrees && /^(asin|acos|atan)$/.test(name) ? (x * 180) / Math.PI : x);

  function primary(): number {
    const t = toks[p++];
    if (!t) throw new Error('Incomplete');
    if (t.t === 'n') return t.v;
    if (t.t === '(') { const v = expr0(); if (toks[p]?.t !== ')') throw new Error('Missing )'); p++; return v; }
    if (t.t === 'op' && t.v === '-') return -unary();
    if (t.t === 'op' && t.v === '+') return unary();
    if (t.t === 'id') {
      if (t.v in CONST) return CONST[t.v];
      const f = FN[t.v];
      if (f) {
        if (toks[p]?.t !== '(') { const a = unary(); return itrig(t.v, f(trig(t.v, a))); }
        p++;
        const args: number[] = [];
        if (toks[p]?.t !== ')') { args.push(expr0()); while (toks[p]?.t === ',') { p++; args.push(expr0()); } }
        if (toks[p]?.t !== ')') throw new Error('Missing )');
        p++;
        return itrig(t.v, f(...args.map((a, i) => (i === 0 ? trig(t.v, a) : a))));
      }
      throw new Error(`Unknown ${t.v}`);
    }
    throw new Error('Syntax');
  }
  function postfix(): number {
    let v = primary();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && t.v === '!') { p++; v = fact(v); continue; }
      if (t?.t === 'op' && t.v === '%' && !(toks[p + 1] && (toks[p + 1].t === 'n' || toks[p + 1].t === '(' || toks[p + 1].t === 'id'))) { p++; v = v / 100; continue; }
      break;
    }
    return v;
  }
  function power(): number {
    const b = postfix();
    const t = peek();
    if (t?.t === 'op' && t.v === '^') { p++; return Math.pow(b, unary()); }
    return b;
  }
  function unary(): number {
    const t = peek();
    if (t?.t === 'op' && (t.v === '-' || t.v === '+')) { p++; const v = unary(); return t.v === '-' ? -v : v; }
    return power();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) { p++; const r = unary(); v = t.v === '*' ? v * r : t.v === '/' ? v / r : v % r; continue; }
      if (t && (t.t === '(' || t.t === 'id' || (t.t === 'n' && toks[p - 1]?.t === ')'))) { v *= unary(); continue; } // implicit multiplication: 2pi, 3(4)
      break;
    }
    return v;
  }
  function expr0(): number {
    let v = term();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) { p++; const r = term(); v = t.v === '+' ? v + r : v - r; continue; }
      break;
    }
    return v;
  }
  const v = expr0();
  if (p < toks.length) throw new Error('Syntax');
  return v;
}

export function formatNumber(v: number, maxDigits = 12): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'Error' : v > 0 ? '∞' : '-∞';
  if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0)) return v.toExponential(6).replace(/\.?0+e/, 'e');
  const r = parseFloat(v.toPrecision(maxDigits));
  return r.toLocaleString(undefined, { maximumFractionDigits: 10 });
}

/** Quick check whether a query looks like math worth evaluating in Spotlight. */
export function tryMath(q: string): string | null {
  const s = q.trim().replace(/^=/, '');
  if (!s || !/[\d)]/.test(s) || /^[\d.,\s]+$/.test(s)) return null;
  if (!/^[\d\s+\-*/^%().,!a-z×÷π−]+$/i.test(s)) return null;
  try { const v = evaluate(s); return Number.isFinite(v) ? formatNumber(v) : null; } catch { return null; }
}

// ---------------- Unit conversion
type Unit = { k: number; dim: string; off?: number };
const U: Record<string, Unit> = {};
const add = (dim: string, k: number, ...names: string[]) => names.forEach((n) => (U[n] = { k, dim }));
add('len', 1, 'm', 'meter', 'meters', 'metre', 'metres'); add('len', 1000, 'km', 'kilometer', 'kilometers'); add('len', 0.01, 'cm', 'centimeter', 'centimeters'); add('len', 0.001, 'mm', 'millimeter', 'millimeters');
add('len', 1609.344, 'mi', 'mile', 'miles'); add('len', 0.9144, 'yd', 'yard', 'yards'); add('len', 0.3048, 'ft', 'foot', 'feet'); add('len', 0.0254, 'in', 'inch', 'inches'); add('len', 1852, 'nmi', 'nauticalmile');
add('mass', 1, 'kg', 'kilogram', 'kilograms', 'kgs'); add('mass', 0.001, 'g', 'gram', 'grams'); add('mass', 1e-6, 'mg', 'milligram'); add('mass', 0.45359237, 'lb', 'lbs', 'pound', 'pounds'); add('mass', 0.028349523125, 'oz', 'ounce', 'ounces'); add('mass', 1000, 't', 'tonne', 'tonnes'); add('mass', 6.35029318, 'st', 'stone');
add('vol', 1, 'l', 'liter', 'liters', 'litre', 'litres'); add('vol', 0.001, 'ml', 'milliliter', 'milliliters'); add('vol', 3.785411784, 'gal', 'gallon', 'gallons'); add('vol', 0.946352946, 'qt', 'quart', 'quarts'); add('vol', 0.473176473, 'pt', 'pint', 'pints'); add('vol', 0.2365882365, 'cup', 'cups'); add('vol', 0.0295735295625, 'floz'); add('vol', 0.01478676478125, 'tbsp'); add('vol', 0.00492892159375, 'tsp');
add('data', 1, 'b', 'byte', 'bytes'); add('data', 1024, 'kb', 'kib'); add('data', 1024 ** 2, 'mb', 'mib'); add('data', 1024 ** 3, 'gb', 'gib'); add('data', 1024 ** 4, 'tb', 'tib'); add('data', 0.125, 'bit', 'bits');
add('time', 1, 's', 'sec', 'second', 'seconds'); add('time', 60, 'min', 'minute', 'minutes'); add('time', 3600, 'h', 'hr', 'hour', 'hours'); add('time', 86400, 'd', 'day', 'days'); add('time', 604800, 'wk', 'week', 'weeks'); add('time', 31557600, 'yr', 'year', 'years'); add('time', 0.001, 'ms', 'millisecond', 'milliseconds');
add('speed', 1, 'm/s', 'mps'); add('speed', 1 / 3.6, 'km/h', 'kmh', 'kph'); add('speed', 0.44704, 'mph'); add('speed', 0.514444, 'kn', 'knot', 'knots');
add('area', 1, 'm2', 'sqm'); add('area', 1e6, 'km2', 'sqkm'); add('area', 0.09290304, 'ft2', 'sqft'); add('area', 4046.8564224, 'acre', 'acres'); add('area', 10000, 'ha', 'hectare', 'hectares');
add('energy', 1, 'j', 'joule', 'joules'); add('energy', 4184, 'kcal', 'calories'); add('energy', 3.6e6, 'kwh');
add('angle', 1, 'deg', 'degree', 'degrees'); add('angle', 180 / Math.PI, 'rad', 'radian', 'radians');
const TEMP: Record<string, string> = { c: 'C', celsius: 'C', '°c': 'C', f: 'F', fahrenheit: 'F', '°f': 'F', k: 'K', kelvin: 'K' };

export function tryConvert(q: string): { result: string; detail: string } | null {
  const m = q.trim().toLowerCase().match(/^([-+]?[\d.,]+(?:e[-+]?\d+)?)\s*([a-z°/0-9]+)\s+(?:to|in|into|as|=|->)\s+([a-z°/0-9]+)$/);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  const [from, to] = [m[2], m[3]];
  if (TEMP[from] && TEMP[to]) {
    const f = TEMP[from], t = TEMP[to];
    const c = f === 'C' ? v : f === 'F' ? ((v - 32) * 5) / 9 : v - 273.15;
    const r = t === 'C' ? c : t === 'F' ? (c * 9) / 5 + 32 : c + 273.15;
    return { result: `${formatNumber(r, 8)} °${t === 'K' ? 'K' : t}`, detail: `${formatNumber(v)} °${f} → °${t}` };
  }
  const a = U[from], b = U[to];
  if (!a || !b || a.dim !== b.dim) return null;
  const r = (v * a.k) / b.k;
  return { result: `${formatNumber(r, 8)} ${to}`, detail: `${formatNumber(v)} ${from} = ${formatNumber(r, 10)} ${to}` };
}
