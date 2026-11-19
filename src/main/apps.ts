// Installed application discovery (Start Menu shortcuts + Store apps), high-resolution icon
// extraction through the Windows Shell, and launching.
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { kvGet, kvSet } from './db';
import { psJson, psOnce } from './ps';
import { broadcast } from './settings';
import type { AppEntry } from '@shared/types';

const isWin = process.platform === 'win32';
let apps: AppEntry[] = [];
let scanning: Promise<AppEntry[]> | null = null;

const iconDir = () => path.join(app.getPath('userData'), 'icon-cache');
const hash = (s: string) => crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 16);

const SKIP = /(uninstall|uninst|unins\d*|readme|release notes|license|documentation|help|manual|website|on the web|support|changelog|what'?s new|\bdebug\b)/i;
const DOC_EXT = /\.(chm|txt|pdf|html?|url|rtf|md|log|ini)$/i;

function categorize(name: string, folder: string, target: string): string {
  const s = `${name} ${folder} ${target}`.toLowerCase();
  if (/(code|studio|jetbrains|intellij|pycharm|git|terminal|powershell|python|node|docker|postman|sql|developer|sdk|cmake|android studio|wsl|notepad\+\+|sublime)/.test(s)) return 'Developer';
  if (/(chrome|firefox|edge|brave|opera|vivaldi|browser)/.test(s)) return 'Internet';
  if (/(word|excel|powerpoint|outlook|onenote|office|teams|libreoffice|acrobat|pdf|notion|slack|zoom|onedrive|access|publisher)/.test(s)) return 'Productivity';
  if (/(spotify|vlc|music|media|player|photo|camera|movies|video|audacity|obs|premiere|photoshop|lightroom|gimp|paint|blender|davinci|capcut|canva|figma)/.test(s)) return 'Creativity & Media';
  if (/(steam|epic|game|xbox|riot|ubisoft|origin|battle\.net|minecraft)/.test(s)) return 'Games';
  if (/(whatsapp|telegram|discord|skype|signal|messenger|mail)/.test(s)) return 'Social';
  if (/(control panel|settings|task manager|device|system|administrative|nvidia|intel|realtek|driver|defender|security|backup|recovery|cmd|command prompt|registry|disk|accessories|windows tools|maintenance|accessibility)/.test(s)) return 'System';
  return 'Other';
}

function walk(dir: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 5) return acc;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc, depth + 1);
    else if (/\.(lnk|url)$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

async function doScan(): Promise<AppEntry[]> {
  if (!isWin) return [];
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];
  const byName = new Map<string, AppEntry>();
  for (const root of roots) {
    for (const file of walk(root)) {
      const name = path.basename(file).replace(/\.(lnk|url)$/i, '');
      if (SKIP.test(name)) continue;
      const folder = path.relative(root, path.dirname(file));
      let target = '';
      let kind: AppEntry['kind'] = 'lnk';
      if (file.toLowerCase().endsWith('.url')) {
        try {
          const txt = fs.readFileSync(file, 'utf8');
          const url = (txt.match(/^URL=(.*)$/m) || [])[1] || '';
          if (!/^(steam|com\.epicgames|uplay|origin)/i.test(url)) continue; // only game launchers' app links
          kind = 'url'; target = url;
        } catch { continue; }
      } else {
        try { target = shell.readShortcutLink(file).target || ''; } catch { target = ''; }
        if (target && DOC_EXT.test(target)) continue;
        if (target && /unins\d*\.exe$/i.test(target)) continue;
      }
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, {
        id: hash(file), name, target: file, kind,
        exe: target && /\.exe$/i.test(target) ? path.basename(target).toLowerCase() : undefined,
        category: categorize(name, folder, target),
      });
    }
  }
  // Microsoft Store / packaged apps
  try {
    const store = await psJson<{ Name: string; AppID: string }[] | { Name: string; AppID: string }>('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', 30000);
    const list = Array.isArray(store) ? store : store ? [store] : [];
    for (const s of list) {
      if (!s.AppID || !s.AppID.includes('!')) continue;
      const key = s.Name.toLowerCase();
      if (byName.has(key) || SKIP.test(s.Name)) continue;
      byName.set(key, { id: hash(s.AppID), name: s.Name, target: `shell:AppsFolder\\${s.AppID}`, kind: 'uwp', category: categorize(s.Name, '', s.AppID) });
    }
  } catch (e) { console.error('[apps] Get-StartApps failed', e); }

  const list = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const dir = iconDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const a of list) {
    const f = path.join(dir, `${a.id}.png`);
    if (fs.existsSync(f)) a.icon = f;
  }
  apps = list;
  kvSet('apps', apps);
  broadcast('apps:changed', apps);
  void extractIcons(list.filter((a) => !a.icon));
  return apps;
}

const ICON_CS = `
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class MxIcon {
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx; public int cy; }
  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public ushort bmPlanes, bmBitsPixel; public IntPtr bmBits; }
  [StructLayout(LayoutKind.Sequential)] struct BMIH { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biX, biY, biClrUsed, biClrImportant; }
  [StructLayout(LayoutKind.Sequential)] struct DIBSECTION { public BITMAP dsBm; public BMIH dsBmih; public uint b0, b1, b2; public IntPtr dshSection; public uint dsOffset; }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int c, ref DIBSECTION ds);
  public static bool Save(string src, string outFile, int size) {
    IShellItemImageFactory f;
    try { SHCreateItemFromParsingName(src, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f); } catch { return false; }
    IntPtr hbm;
    if (f.GetImage(new SIZE{cx=size,cy=size}, 0x1 | 0x4, out hbm) != 0) return false;
    try {
      DIBSECTION ds = new DIBSECTION();
      int got = GetObject(hbm, Marshal.SizeOf(typeof(DIBSECTION)), ref ds);
      if (got == 0 || ds.dsBm.bmBits == IntPtr.Zero || ds.dsBm.bmBitsPixel != 32) {
        using (var b = Image.FromHbitmap(hbm)) b.Save(outFile, ImageFormat.Png); return true;
      }
      int w = ds.dsBm.bmWidth, h = ds.dsBm.bmHeight, stride = ds.dsBm.bmWidthBytes;
      bool topDown = ds.dsBmih.biHeight < 0;
      using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppPArgb)) {
        var data = bmp.LockBits(new Rectangle(0,0,w,h), ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
        byte[] row = new byte[stride];
        for (int y=0; y<h; y++) {
          int srcY = topDown ? y : (h-1-y);
          Marshal.Copy(IntPtr.Add(ds.dsBm.bmBits, srcY*stride), row, 0, stride);
          Marshal.Copy(row, 0, IntPtr.Add(data.Scan0, y*data.Stride), Math.Min(stride, data.Stride));
        }
        bmp.UnlockBits(data);
        bmp.Save(outFile, ImageFormat.Png);
      }
      return true;
    } finally { DeleteObject(hbm); }
  }
}
'@
`;

async function extractIcons(list: AppEntry[]) {
  if (!isWin || list.length === 0) return;
  const dir = iconDir();
  const jobFile = path.join(app.getPath('temp'), `mx-icons-${Date.now()}.json`);
  const jobs = list.map((a) => ({ s: a.target, o: path.join(dir, `${a.id}.png`) }));
  fs.writeFileSync(jobFile, JSON.stringify(jobs), 'utf8');
  try {
    await psOnce(`${ICON_CS}\n$jobs = Get-Content -Raw -Encoding UTF8 '${jobFile.replace(/'/g, "''")}' | ConvertFrom-Json\nforeach ($j in $jobs) { try { [MxIcon]::Save($j.s, $j.o, 256) | Out-Null } catch {} }`, 300000);
  } catch (e) { console.error('[apps] icon extraction', e); }
  try { fs.unlinkSync(jobFile); } catch { /* ignore */ }
  // Fallback for anything the shell could not render: Electron's own (smaller) icon API.
  for (const a of list) {
    const f = path.join(dir, `${a.id}.png`);
    if (!fs.existsSync(f) && a.kind !== 'uwp' && a.kind !== 'url') {
      try { const img = await app.getFileIcon(a.target, { size: 'large' }); fs.writeFileSync(f, img.toPNG()); } catch { /* ignore */ }
    }
    if (fs.existsSync(f)) a.icon = f;
  }
  kvSet('apps', apps);
  broadcast('apps:changed', apps);
}

export function listApps(): AppEntry[] {
  if (apps.length === 0) apps = kvGet<AppEntry[]>('apps', []);
  return apps;
}

export function scanApps(): Promise<AppEntry[]> {
  if (!scanning) scanning = doScan().finally(() => { scanning = null; });
  return scanning;
}

export async function launchTarget(target: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (target.startsWith('shell:')) {
      spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || /^(steam|com\.epicgames):/i.test(target)) {
      await shell.openExternal(target);
      return { ok: true };
    }
    const err = await shell.openPath(target);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function iconForPath(p: string): Promise<string | null> {
  try { const img = await app.getFileIcon(p, { size: 'large' }); return img.toDataURL(); } catch { return null; }
}

/** Resolve a file the user dropped on the Dock into a dock entry. */
export function resolveDockTarget(file: string) {
  const name = path.basename(file).replace(/\.(lnk|exe|url)$/i, '');
  let exe: string | undefined;
  if (/\.lnk$/i.test(file)) { try { const t = shell.readShortcutLink(file).target; if (/\.exe$/i.test(t)) exe = path.basename(t).toLowerCase(); } catch { /* ignore */ } }
  else if (/\.exe$/i.test(file)) exe = path.basename(file).toLowerCase();
  const known = listApps().find((a) => a.target.toLowerCase() === file.toLowerCase());
  return { kind: 'external' as const, id: known?.id || hash(file), name: known?.name || name, target: file, exe: known?.exe || exe };
}

export function ensureIconFor(id: string, target: string) {
  const f = path.join(iconDir(), `${id}.png`);
  if (fs.existsSync(f)) return;
  void extractIcons([{ id, name: '', target, kind: target.startsWith('shell:') ? 'uwp' : 'lnk', category: '' }]);
}
export const iconFileFor = (id: string) => { const f = path.join(iconDir(), `${id}.png`); return fs.existsSync(f) ? f : null; };
