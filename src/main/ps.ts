// Persistent, queued PowerShell host. Keeps one warm powershell.exe so frequent queries
// (volume, brightness, Wi-Fi) cost milliseconds instead of a full process start each time.
import { spawn, ChildProcessWithoutNullStreams, execFile } from 'node:child_process';

const isWin = process.platform === 'win32';
interface Job { id: number; script: string; resolve: (s: string) => void; reject: (e: Error) => void; timeout: number }

let proc: ChildProcessWithoutNullStreams | null = null;
let queue: Job[] = [];
let current: Job | null = null;
let buffer = '';
let seq = 0;
let timer: NodeJS.Timeout | null = null;

function start() {
  proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdin.write('[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference="SilentlyContinue"; $ErrorActionPreference="Stop"\n');
  proc.stdout.on('data', (d: string) => { buffer += d; drain(); });
  proc.stderr.on('data', () => { /* errors are captured inside the wrapper */ });
  proc.on('exit', () => {
    proc = null;
    if (current) { current.reject(new Error('PowerShell exited')); current = null; }
    buffer = '';
  });
}

function drain() {
  if (!current) return;
  const marker = `__MXEND_${current.id}__`;
  const idx = buffer.indexOf(marker);
  if (idx === -1) return;
  const out = buffer.slice(0, idx);
  buffer = buffer.slice(idx + marker.length).replace(/^\r?\n/, '');
  const job = current;
  current = null;
  if (timer) { clearTimeout(timer); timer = null; }
  const errIdx = out.indexOf('__MXERR__');
  if (errIdx !== -1) job.reject(new Error(out.slice(errIdx + 9).trim()));
  else job.resolve(out.trim());
  next();
}

function next() {
  if (current || queue.length === 0) return;
  if (!proc) start();
  current = queue.shift()!;
  const b64 = Buffer.from(current.script, 'utf8').toString('base64');
  const line = `try { $__s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')); Invoke-Expression $__s | Out-String -Width 8192 | Write-Output } catch { Write-Output ("__MXERR__" + $_.Exception.Message) }; Write-Output '__MXEND_${current.id}__'\n`;
  proc!.stdin.write(line);
  const job = current;
  timer = setTimeout(() => {
    if (current === job) {
      job.reject(new Error('PowerShell timeout'));
      current = null;
      try { proc?.kill(); } catch { /* ignore */ }
      proc = null;
      buffer = '';
      next();
    }
  }, job.timeout);
}

export function ps(script: string, timeout = 15000): Promise<string> {
  if (!isWin) return Promise.reject(new Error('Windows only'));
  return new Promise((resolve, reject) => {
    queue.push({ id: ++seq, script, resolve, reject, timeout });
    next();
  });
}

export async function psJson<T>(script: string, timeout?: number): Promise<T> {
  const out = await ps(script, timeout);
  return JSON.parse(out || 'null') as T;
}

/** One-off PowerShell (separate process) for long-running jobs that must not block the queue. */
export function psOnce(script: string, timeout = 120000): Promise<string> {
  if (!isWin) return Promise.reject(new Error('Windows only'));
  const enc = Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue';\n${script}`, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout.toString());
    });
  });
}

export function run(cmd: string, args: string[], timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout.toString());
    });
  });
}

export function disposePs() {
  try { proc?.kill(); } catch { /* ignore */ }
  proc = null;
}

export const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
