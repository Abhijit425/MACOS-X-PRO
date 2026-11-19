// Typed access to the main process. In a plain browser (design preview) a small mock is used so
// the UI can still render; in the real app every call goes to Windows.
import type { MxApi } from '../../preload/preload';

declare global { interface Window { mx: MxApi } }

const isElectron = typeof window !== 'undefined' && !!window.mx;

export const api = {
  invoke<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
    if (!isElectron) return Promise.reject(new Error(`Not running inside MACOS X PRO (${name})`));
    return window.mx.invoke(name, ...args) as Promise<T>;
  },
  on(channel: string, cb: (...args: any[]) => void): () => void { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!isElectron) return () => undefined;
    return window.mx.on(channel, cb);
  },
  pathForFile(f: File) { return isElectron ? window.mx.pathForFile(f) : ''; },
  isElectron,
};

export const fileUrl = (p: string) => `mxfile://local/${encodeURIComponent(p)}`;
export const thumbUrl = (p: string, s = 256) => `mxfile://thumb/${encodeURIComponent(p)}?s=${s}`;

export const openApp = (id: string, args?: Record<string, string>) => api.invoke('app:open', id, args);
export const toShell = (channel: string, payload?: unknown) => api.invoke('shell:send', channel, payload);
