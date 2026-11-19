// Real system metrics. Polling only runs while at least one window has subscribed,
// so an idle desktop with no metric widgets costs nothing.
import si from 'systeminformation';
import os from 'node:os';
import { app, WebContents } from 'electron';
import { run } from './ps';
import { getSettings } from './settings';
import type { Metrics, ProcessInfo, SysInfo } from '@shared/types';
import { isWin11 } from './controls';

const subscribers = new Set<WebContents>();
let timer: NodeJS.Timeout | null = null;
let tick = 0;
let last: Metrics | null = null;
let nvidiaOk = process.platform === 'win32';
let gpuModels: string[] | null = null;
let slow = { battery: null as Metrics['battery'] | null, disks: [] as Metrics['disks'], swap: { used: 0, total: 0 }, cpuModel: '', temp: null as number | null };

async function nvidia(): Promise<Metrics['gpu'] | null> {
  if (!nvidiaOk) return null;
  try {
    const out = await run('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'], 4000);
    return out.trim().split(/\r?\n/).filter(Boolean).map((l) => {
      const [name, util, used, total, temp] = l.split(',').map((s) => s.trim());
      const num = (s: string) => (s && !/N\/A/i.test(s) ? Number(s) : null);
      return { model: name, load: num(util), memUsed: num(used) !== null ? num(used)! * 1024 * 1024 : null, memTotal: num(total) !== null ? num(total)! * 1024 * 1024 : null, temp: num(temp) };
    });
  } catch {
    nvidiaOk = false; // not an NVIDIA system / driver tool missing
    return null;
  }
}

async function collectSlow(force = false) {
  if (force || tick % 8 === 0) {
    try {
      const b = await si.battery();
      slow.battery = {
        hasBattery: b.hasBattery, percent: b.percent, charging: b.isCharging, acConnected: b.acConnected,
        timeRemaining: b.timeRemaining && b.timeRemaining > 0 ? b.timeRemaining : null,
        cycleCount: b.cycleCount || null, maxCapacity: b.maxCapacity || null, designedCapacity: b.designedCapacity || null,
        health: b.maxCapacity && b.designedCapacity ? Math.min(100, Math.round((b.maxCapacity / b.designedCapacity) * 100)) : null,
      };
    } catch { /* ignore */ }
  }
  if (force || tick % 15 === 0) {
    try {
      const fsz = await si.fsSize();
      slow.disks = fsz.filter((d) => d.size > 0).map((d) => ({ fs: d.fs, mount: d.mount, size: d.size, used: d.used }));
    } catch { /* ignore */ }
    try { const m = await si.mem(); slow.swap = { used: m.swapused, total: m.swaptotal }; } catch { /* ignore */ }
    try { const t = await si.cpuTemperature(); slow.temp = t.main && t.main > 0 ? t.main : null; } catch { /* ignore */ }
  }
  if (!slow.cpuModel) slow.cpuModel = os.cpus()[0]?.model?.trim() || 'CPU';
  if (!gpuModels) {
    try { gpuModels = (await si.graphics()).controllers.map((c) => c.model).filter(Boolean); } catch { gpuModels = []; }
  }
}

async function collect(): Promise<Metrics> {
  await collectSlow(tick === 0);
  const load = await si.currentLoad();
  const total = os.totalmem();
  const free = os.freemem();
  let net = { rx: 0, tx: 0, iface: '' };
  try {
    const n = await si.networkStats();
    const sum = n.reduce((a, s) => ({ rx: a.rx + Math.max(0, s.rx_sec || 0), tx: a.tx + Math.max(0, s.tx_sec || 0) }), { rx: 0, tx: 0 });
    net = { ...sum, iface: n[0]?.iface || '' };
  } catch { /* ignore */ }
  let gpu: Metrics['gpu'] = [];
  if (getSettings().gpuMetrics) {
    const nv = tick % 2 === 0 || !last ? await nvidia() : last.gpu.filter((g) => g.load !== null);
    const nvNames = new Set((nv || []).map((g) => g.model));
    gpu = [...(nv || []), ...(gpuModels || []).filter((m) => ![...nvNames].some((n) => m.includes(n) || n.includes(m))).map((m) => ({ model: m, load: null, memUsed: null, memTotal: null, temp: null }))];
  }
  const m: Metrics = {
    ts: Date.now(),
    cpu: { load: load.currentLoad, cores: load.cpus.map((c) => c.load), speed: os.cpus()[0]?.speed || 0, temp: slow.temp, model: slow.cpuModel },
    mem: { total, used: total - free, active: total - free, swapUsed: slow.swap.used, swapTotal: slow.swap.total },
    gpu,
    net,
    battery: slow.battery || { hasBattery: false, percent: 0, charging: false, acConnected: true, timeRemaining: null, cycleCount: null, maxCapacity: null, designedCapacity: null, health: null },
    disks: slow.disks,
  };
  tick++;
  return m;
}

async function loop() {
  timer = null;
  if (subscribers.size === 0) return;
  try {
    last = await collect();
    for (const wc of subscribers) if (!wc.isDestroyed()) wc.send('metrics', last);
  } catch (e) { console.error('[metrics]', e); }
  if (subscribers.size > 0) timer = setTimeout(loop, Math.max(1000, getSettings().metricsIntervalMs));
}

export function subscribeMetrics(wc: WebContents) {
  if (subscribers.has(wc)) { if (last) wc.send('metrics', last); return; }
  subscribers.add(wc);
  wc.once('destroyed', () => subscribers.delete(wc));
  if (last) wc.send('metrics', last);
  if (!timer) timer = setTimeout(loop, 10);
}
export function unsubscribeMetrics(wc: WebContents) { subscribers.delete(wc); }
export const lastMetrics = () => last;

export async function batteryNow() { await collectSlow(true); return slow.battery; }

export async function processes(): Promise<ProcessInfo[]> {
  const p = await si.processes();
  return p.list
    .filter((x) => x.pid > 4)
    .map((x) => ({ pid: x.pid, name: x.name, cpu: x.cpu, mem: (x.memRss || 0) * 1024, user: x.user, path: x.path }))
    .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem);
}

export function killProcess(pid: number) {
  if (pid === process.pid) throw new Error('Refusing to end MACOS X PRO itself from here — use Quit.');
  process.kill(pid);
  return true;
}

let runningCache: { ts: number; set: Set<string> } = { ts: 0, set: new Set() };
export async function runningExes(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  if (Date.now() - runningCache.ts < 2500) return [...runningCache.set];
  try {
    const out = await run('tasklist', ['/fo', 'csv', '/nh'], 6000);
    const set = new Set<string>();
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)"/);
      if (m) set.add(m[1].toLowerCase());
    }
    runningCache = { ts: Date.now(), set };
  } catch { /* ignore */ }
  return [...runningCache.set];
}

let sysInfoCache: SysInfo | null = null;
export async function sysInfo(): Promise<SysInfo> {
  if (sysInfoCache) return sysInfoCache;
  const [osi, cpu, sys, gfx] = await Promise.all([si.osInfo(), si.cpu(), si.system(), si.graphics().catch(() => ({ controllers: [] as { model: string }[] }))]);
  sysInfoCache = {
    os: osi.distro, release: osi.release, build: osi.build, arch: osi.arch, hostname: osi.hostname,
    cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(), cores: cpu.cores, memTotal: os.totalmem(),
    gpus: gfx.controllers.map((c) => c.model).filter(Boolean), manufacturer: sys.manufacturer, model: sys.model,
    appVersion: app.getVersion(), electron: process.versions.electron, isWin11: isWin11(),
  };
  return sysInfoCache;
}
