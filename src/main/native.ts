// Thin Win32 bridge via koffi (FFI). Every call is guarded: on non-Windows or on failure the
// helpers become no-ops so the app degrades gracefully instead of crashing.
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

const isWin = process.platform === 'win32';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let k: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn: Record<string, any> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let APPBARDATA: any = null;
let ready = false;

function load() {
  if (ready || !isWin) return ready;
  try {
    // koffi looks for its native module under process.resourcesPath/koffi/win32_x64 when packaged
    k = require('koffi');
    const user32 = k.load('user32.dll');
    const kernel32 = k.load('kernel32.dll');
    const shell32 = k.load('shell32.dll');
    fn.SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)');
    fn.GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
    fn.SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(intptr_t hWnd)');
    fn.GetWindowTextW = user32.func('int __stdcall GetWindowTextW(intptr_t hWnd, _Out_ uint8_t *buf, int max)');
    fn.GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32_t *pid)');
    fn.FindWindowW = user32.func('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *name)');
    fn.GetWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t cmd)');
    fn.IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(intptr_t hWnd)');
    fn.ShowWindow = user32.func('bool __stdcall ShowWindow(intptr_t hWnd, int cmd)');
    fn.IsIconic = user32.func('bool __stdcall IsIconic(intptr_t hWnd)');
    fn.keybd_event = user32.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)');
    fn.SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, void *pv, uint32_t winIni)');
    fn.GetClipboardSequenceNumber = user32.func('uint32_t __stdcall GetClipboardSequenceNumber()');
    fn.OpenProcess = kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)');
    fn.CloseHandle = kernel32.func('bool __stdcall CloseHandle(intptr_t h)');
    fn.QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t h, uint32_t flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)');
    const RECT = k.struct('MX_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    APPBARDATA = k.struct('MX_APPBARDATA', { cbSize: 'uint32_t', hWnd: 'intptr_t', uCallbackMessage: 'uint32_t', uEdge: 'uint32_t', rc: RECT, lParam: 'intptr_t' });
    fn.SHAppBarMessage = shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ MX_APPBARDATA *data)');
    ready = true;
  } catch (e) {
    console.error('[native] koffi unavailable:', e);
    ready = false;
  }
  return ready;
}

export const nativeAvailable = () => load();

export function hwndOf(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
}

const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_NOOWNERZORDER = 0x200;
const HWND_BOTTOM = 1;

/** Keep a window directly above the Windows desktop (below every normal app window). */
export function pinToDesktop(win: BrowserWindow) {
  if (!load()) return;
  try {
    const me = hwndOf(win);
    const progman = fn.FindWindowW('Progman', null);
    let after = HWND_BOTTOM;
    if (progman) {
      const prev = fn.GetWindow(progman, 3 /* GW_HWNDPREV */);
      if (prev && Number(prev) !== me) after = Number(prev);
      else if (Number(prev) === me) return; // already right above the desktop
    }
    fn.SetWindowPos(me, after, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
  } catch (e) { console.error('[native] pinToDesktop', e); }
}

export function getForegroundWindow(): number {
  if (!load()) return 0;
  try { return Number(fn.GetForegroundWindow()); } catch { return 0; }
}

export function focusWindow(hwnd: number) {
  if (!load() || !hwnd) return;
  try {
    if (fn.IsIconic(hwnd)) fn.ShowWindow(hwnd, 9 /* SW_RESTORE */);
    fn.SetForegroundWindow(hwnd);
  } catch { /* ignore */ }
}

export function foregroundInfo(): { hwnd: number; title: string; pid: number; exe: string } | null {
  if (!load()) return null;
  try {
    const hwnd = Number(fn.GetForegroundWindow());
    if (!hwnd) return null;
    const tbuf = Buffer.alloc(512);
    const len = fn.GetWindowTextW(hwnd, tbuf, 256);
    const title = len > 0 ? tbuf.toString('utf16le', 0, len * 2) : '';
    const pidOut = [0];
    fn.GetWindowThreadProcessId(hwnd, pidOut);
    const pid = pidOut[0] as number;
    let exe = '';
    const h = fn.OpenProcess(0x1000, false, pid);
    if (h) {
      const buf = Buffer.alloc(2048);
      const size = [1024];
      if (fn.QueryFullProcessImageNameW(h, 0, buf, size)) exe = buf.toString('utf16le', 0, (size[0] as number) * 2);
      fn.CloseHandle(h);
    }
    return { hwnd, title, pid, exe };
  } catch { return null; }
}

export function clipboardSequence(): number | null {
  if (!load()) return null;
  try { return Number(fn.GetClipboardSequenceNumber()); } catch { return null; }
}

export function sendKeys(vks: number[]) {
  if (!load()) return false;
  try {
    for (const vk of vks) fn.keybd_event(vk, 0, 0, 0);
    for (const vk of [...vks].reverse()) fn.keybd_event(vk, 0, 2 /* KEYUP */, 0);
    return true;
  } catch { return false; }
}

export const VK = { LWIN: 0x5b, D: 0x44, TAB: 0x09, MEDIA_PLAY_PAUSE: 0xb3, MEDIA_NEXT: 0xb0, MEDIA_PREV: 0xb1, VOLUME_MUTE: 0xad };

export function setWindowsWallpaper(file: string): boolean {
  if (!load()) return false;
  try {
    const wide = Buffer.from(path.resolve(file) + '\0', 'utf16le');
    return !!fn.SystemParametersInfoW(0x14, 0, wide, 0x3);
  } catch { return false; }
}

export function getWindowsWallpaper(): string | null {
  if (!load()) return null;
  try {
    const buf = Buffer.alloc(1040);
    if (!fn.SystemParametersInfoW(0x73, 520, buf, 0)) return null;
    const s = buf.toString('utf16le');
    return s.slice(0, s.indexOf('\0')) || null;
  } catch { return null; }
}

// ---------- AppBar: reserve screen space for the menu bar so maximised windows don't sit under it.
let appbarHwnd = 0;
export function registerTopAppBar(win: BrowserWindow, dipRect: Electron.Rectangle): boolean {
  if (!load()) return false;
  try {
    const hwnd = hwndOf(win);
    const phys = screen.dipToScreenRect(win, dipRect);
    const data = { cbSize: k.sizeof(APPBARDATA), hWnd: hwnd, uCallbackMessage: 0x8000 + 77, uEdge: 1, rc: { left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height }, lParam: 0 };
    if (!appbarHwnd) {
      if (!fn.SHAppBarMessage(0 /* ABM_NEW */, data)) return false;
      appbarHwnd = hwnd;
    }
    fn.SHAppBarMessage(2 /* ABM_QUERYPOS */, data);
    data.rc.bottom = data.rc.top + phys.height;
    fn.SHAppBarMessage(3 /* ABM_SETPOS */, data);
    return true;
  } catch (e) {
    console.error('[native] appbar', e);
    return false;
  }
}

export function unregisterAppBar() {
  if (!load() || !appbarHwnd) return;
  try {
    const data = { cbSize: k.sizeof(APPBARDATA), hWnd: appbarHwnd, uCallbackMessage: 0, uEdge: 1, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
    fn.SHAppBarMessage(1 /* ABM_REMOVE */, data);
  } catch { /* ignore */ }
  appbarHwnd = 0;
}
export const appBarActive = () => appbarHwnd !== 0;
