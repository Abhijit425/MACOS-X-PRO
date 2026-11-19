// Generates the bundled high-resolution wallpaper collection (3840x2160 JPEG + thumbnails).
// All artwork is procedural and original.
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const W = 3840, H = 2160;
const out = path.resolve('resources/wallpapers');
fs.mkdirSync(path.join(out, 'thumbs'), { recursive: true });

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function ridge(baseY, amp, rough, color, opacity = 1) {
  const pts = [];
  const n = 90;
  let y = baseY;
  const phase = rnd() * 10;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    y = baseY + Math.sin(i / 7 + phase) * amp * 0.6 + Math.sin(i / 2.3 + phase * 2) * amp * 0.25 + (rnd() - 0.5) * rough;
    pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
  }
  return `<polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="${color}" opacity="${opacity}"/>`;
}
function stars(count, maxY) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const r = rnd() * 2.6 + 0.6;
    s += `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * maxY).toFixed(0)}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.3 + rnd() * 0.7).toFixed(2)}"/>`;
  }
  return s;
}
const blob = (cx, cy, r, c, o = 1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" opacity="${o}"/>`;
const wave = (y, amp, c, o = 1, k = 1) => {
  const d = `M0 ${y} C ${W * 0.25} ${y - amp * k}, ${W * 0.45} ${y + amp}, ${W * 0.65} ${y - amp * 0.3} S ${W * 0.95} ${y - amp * 0.8}, ${W} ${y - amp * 0.2} L ${W} ${H} L 0 ${H} Z`;
  return `<path d="${d}" fill="${c}" opacity="${o}"/>`;
};
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="160"/></filter><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="40"/></filter></defs>${body}</svg>`;
const lin = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.7) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;

const walls = [
  { id: 'sonoma-dawn', name: 'Sonoma Dawn', category: 'abstract', tone: 'light', svg: () => svg(lin('g', [[0, '#ffd9b8'], [0.5, '#f7a97c'], [1, '#c96f8a']]),
    `<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#b)">${blob(600, 300, 700, '#fff1da', .9)}${blob(3300, 500, 800, '#ff9f8a', .7)}</g>
    <g filter="url(#s)">${wave(1200, 380, '#f08a6b', .85)}${wave(1450, 300, '#d9667a', .9, 1.4)}${wave(1720, 260, '#a94d7d', .95, .8)}${wave(1950, 200, '#6f3a73', 1, 1.2)}</g>`) },
  { id: 'sonoma-night', name: 'Sonoma Night', category: 'abstract', tone: 'dark', svg: () => svg(lin('g', [[0, '#120f2a'], [0.6, '#271a4a'], [1, '#43215a']]),
    `<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#b)">${blob(3000, 300, 700, '#5b3ea8', .6)}${blob(700, 900, 600, '#1f3a8a', .55)}</g>
    <g filter="url(#s)">${wave(1250, 380, '#3b2a7a', .85)}${wave(1500, 300, '#55307d', .9, 1.4)}${wave(1760, 260, '#7a2f6f', .9, .8)}${wave(1990, 200, '#2a1438', 1, 1.2)}</g>`) },
  { id: 'aurora', name: 'Aurora', category: 'abstract', tone: 'dark', svg: () => svg('',
    `<rect width="${W}" height="${H}" fill="#050a1a"/><g filter="url(#b)">${blob(900, 700, 800, '#0fbf9f', .55)}${blob(2200, 500, 700, '#1d6bff', .6)}${blob(3200, 1300, 800, '#7a3cff', .5)}${blob(1500, 1700, 600, '#00e0ff', .35)}</g>${stars(220, H)}`) },
  { id: 'lagoon', name: 'Lagoon', category: 'abstract', tone: 'light', svg: () => svg('',
    `<rect width="${W}" height="${H}" fill="#eaf3ff"/><g filter="url(#b)">${blob(700, 500, 800, '#9fd8ff', .9)}${blob(2600, 400, 700, '#c6b5ff', .85)}${blob(3300, 1600, 900, '#ffc7e0', .8)}${blob(1500, 1800, 700, '#b5ffe4', .8)}</g>`) },
  { id: 'ridge-day', name: 'Ridge — Day', category: 'landscape', tone: 'light', svg: () => svg(lin('sky', [[0, '#5fa8ff'], [0.7, '#bfe0ff'], [1, '#e8f4ff']]),
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${blob(2900, 520, 150, '#fffbe6', 1)}<g filter="url(#b)">${blob(2900, 520, 420, '#fff4c2', .5)}</g>
    ${ridge(1050, 160, 60, '#8fb4e0', .9)}${ridge(1300, 180, 70, '#6d93c4')}${ridge(1550, 160, 60, '#4a6fa3')}${ridge(1800, 140, 50, '#2f4f7d')}${ridge(2000, 100, 40, '#1d3557')}`) },
  { id: 'ridge-dusk', name: 'Ridge — Dusk', category: 'landscape', tone: 'dark', svg: () => svg(lin('sky', [[0, '#2b1e5c'], [0.45, '#b54b6b'], [0.75, '#ff9a62'], [1, '#ffd29a']]),
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${blob(1900, 1250, 230, '#ffe3b0', 1)}<g filter="url(#b)">${blob(1900, 1250, 600, '#ffb27a', .55)}</g>
    ${ridge(1150, 170, 60, '#8e4f7d', .9)}${ridge(1380, 180, 70, '#6b3a6e')}${ridge(1620, 160, 60, '#4a2a5c')}${ridge(1850, 140, 50, '#2e1b45')}${ridge(2040, 90, 40, '#1a1030')}`) },
  { id: 'ridge-night', name: 'Ridge — Night', category: 'landscape', tone: 'dark', svg: () => svg(lin('sky', [[0, '#02040f'], [0.6, '#0b1640'], [1, '#1b2f6b']]),
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(500, 1400)}${blob(3100, 420, 110, '#f4f1e6', 1)}<g filter="url(#b)">${blob(3100, 420, 400, '#9fb6ff', .25)}</g>
    ${ridge(1150, 170, 60, '#1c2d63', .95)}${ridge(1380, 180, 70, '#152350')}${ridge(1620, 160, 60, '#0f1a3d')}${ridge(1850, 140, 50, '#0a122c')}${ridge(2040, 90, 40, '#050a1c')}`) },
  { id: 'dunes', name: 'Dunes', category: 'landscape', tone: 'light', svg: () => svg(lin('sky', [[0, '#f9d9b0'], [1, '#fff3e0']]),
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${blob(800, 600, 180, '#fff8ea', 1)}<g filter="url(#s)">${wave(1300, 260, '#efb57c', 1, 1.3)}${wave(1550, 300, '#e09a5e', 1, .7)}${wave(1800, 220, '#c97e45', 1, 1.5)}${wave(2020, 160, '#a8612f', 1, 1)}</g>`) },
  { id: 'coast', name: 'Coast', category: 'landscape', tone: 'light', svg: () => svg(lin('sky', [[0, '#7cc4ff'], [0.55, '#ffd6a8'], [1, '#2b7bb9']]),
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${blob(1920, 1180, 200, '#fff2d6', 1)}<g filter="url(#b)">${blob(1920, 1180, 520, '#ffcf91', .6)}</g>
    <rect y="1200" width="${W}" height="${H - 1200}" fill="#1f6fa8"/><g filter="url(#s)">${wave(1350, 60, '#2a86c4', .9)}${wave(1550, 50, '#1b5f94', .9)}${wave(1800, 40, '#134a77', 1)}</g>
    <rect x="1700" y="1210" width="440" height="14" rx="7" fill="#fff0d0" opacity=".7"/><rect x="1780" y="1260" width="280" height="10" rx="5" fill="#fff0d0" opacity=".5"/>`) },
  { id: 'graphite', name: 'Graphite', category: 'dark', tone: 'dark', svg: () => svg(rad('g', [[0, '#2a2d34'], [1, '#0c0d10']], .5, .35, .9),
    `<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#b)">${blob(1920, 900, 500, '#3a4250', .6)}</g>`) },
  { id: 'obsidian', name: 'Obsidian Ring', category: 'dark', tone: 'dark', svg: () => svg(rad('g', [[0, '#141826'], [1, '#05060a']]),
    `<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#s)"><circle cx="1920" cy="1080" r="620" fill="none" stroke="#6a7cff" stroke-width="70" opacity=".55"/><circle cx="1920" cy="1080" r="620" fill="none" stroke="#c45cff" stroke-width="22" opacity=".7"/></g><g filter="url(#b)">${blob(1920, 1080, 700, '#3f48c9', .25)}</g>`) },
  { id: 'paper', name: 'Paper', category: 'minimal', tone: 'light', svg: () => svg(lin('g', [[0, '#f6f5f2'], [1, '#e7e4dd']]),
    `<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#s)"><circle cx="2700" cy="700" r="520" fill="#e9b97a" opacity=".55"/><circle cx="1200" cy="1500" r="380" fill="#9db8c9" opacity=".45"/></g>`) },
  { id: 'mist', name: 'Mist', category: 'minimal', tone: 'light', svg: () => svg(lin('g', [[0, '#dfe7f1'], [1, '#f6f8fb']]),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>${ridge(1500, 120, 30, '#c7d3e3', .8)}${ridge(1750, 90, 25, '#b3c2d6', .8)}${ridge(1980, 60, 20, '#9fb1c9', .8)}`) },
  { id: 'midnight', name: 'Midnight', category: 'minimal', tone: 'dark', svg: () => svg(lin('g', [[0, '#0a0f1f'], [1, '#141b33']]),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>${ridge(1500, 120, 30, '#1a2444', .9)}${ridge(1750, 90, 25, '#121a33', .9)}${ridge(1980, 60, 20, '#0b1124', .9)}${stars(120, 1200)}`) },
];

const manifest = [];
for (const w of walls) {
  const png = new Resvg(w.svg(), { fitTo: { mode: 'width', value: W } }).render().asPng();
  await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(out, `${w.id}.jpg`));
  await sharp(png).resize(480, 270).jpeg({ quality: 80 }).toFile(path.join(out, 'thumbs', `${w.id}.jpg`));
  manifest.push({ id: w.id, name: w.name, category: w.category, tone: w.tone, file: `${w.id}.jpg` });
  console.log('wallpaper', w.id);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
