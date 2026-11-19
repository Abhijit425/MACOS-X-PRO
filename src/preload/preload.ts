import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  invoke: async (name: string, ...args: unknown[]) => {
    const r = await ipcRenderer.invoke(`mx:${name}`, ...args);
    if (r && r.ok === false) throw new Error(r.error);
    return r?.value;
  },
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const fn = (_e: unknown, ...args: unknown[]) => cb(...args);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  pathForFile: (f: File) => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('mx', api);
export type MxApi = typeof api;
