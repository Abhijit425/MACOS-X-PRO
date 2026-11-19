// Real Windows hardware/system controls. Each function reports what actually happened —
// if Windows does not support a control on this device we say so instead of pretending.
import { shell, nativeTheme } from 'electron';
import os from 'node:os';
import { ps, psJson, run, psQuote } from './ps';
import type { ControlState, WifiState } from '@shared/types';

const isWin = process.platform === 'win32';

const AUDIO_CS = `
if (-not ([System.Management.Automation.PSTypeName]'MxAudio').Type) {
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMxAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid ctx);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid ctx);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMxMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IMxAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMxMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMxMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MxMMDeviceEnumerator { }
public class MxAudio {
  static IMxAudioEndpointVolume Vol() {
    var en = new MxMMDeviceEnumerator() as IMxMMDeviceEnumerator;
    IMxMMDevice dev = null;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IMxAudioEndpointVolume epv = null;
    var id = typeof(IMxAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv));
    return epv;
  }
  public static float Volume { get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; } set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, Guid.Empty)); } }
  public static bool Mute { get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; } set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, Guid.Empty)); } }
}
'@
}`;

const RADIO_PS = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function MxAwait($t, $type) { $a = $asTaskGeneric.MakeGenericMethod($type); $n = $a.Invoke($null, @($t)); $n.Wait(-1) | Out-Null; $n.Result }
[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
MxAwait ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
$radios = MxAwait ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$bt = $radios | Where-Object { $_.Kind -eq 'Bluetooth' } | Select-Object -First 1
`;

export async function getVolume(): Promise<ControlState['volume']> {
  if (!isWin) return { supported: false, level: 0, muted: false };
  try {
    const r = await psJson<{ v: number; m: boolean }>(`${AUDIO_CS}\n@{ v=[MxAudio]::Volume; m=[MxAudio]::Mute } | ConvertTo-Json -Compress`);
    return { supported: true, level: Math.round(r.v * 100), muted: !!r.m };
  } catch { return { supported: false, level: 0, muted: false }; }
}

export async function setVolume(level: number) {
  const v = Math.max(0, Math.min(100, level)) / 100;
  await ps(`${AUDIO_CS}\n[MxAudio]::Volume = ${v.toFixed(3)}; if (${v} -gt 0) { [MxAudio]::Mute = $false }`);
  return getVolume();
}

export async function setMute(muted: boolean) {
  await ps(`${AUDIO_CS}\n[MxAudio]::Mute = $${muted}`);
  return getVolume();
}

export async function getBrightness(): Promise<ControlState['brightness']> {
  if (!isWin) return { supported: false, level: 0 };
  try {
    const out = await ps(`(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness`);
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? { supported: true, level: n } : { supported: false, level: 0 };
  } catch { return { supported: false, level: 0 }; }
}

export async function setBrightness(level: number) {
  const n = Math.max(0, Math.min(100, Math.round(level)));
  await ps(`Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=1; Brightness=[byte]${n}} | Out-Null`);
  return getBrightness();
}

export async function getBluetooth(): Promise<ControlState['bluetooth']> {
  if (!isWin) return { supported: false, on: null };
  try {
    const out = await ps(`${RADIO_PS}\nif ($bt) { [string]$bt.State } else { 'none' }`, 20000);
    if (out === 'none') return { supported: false, on: null, error: 'No Bluetooth radio found' };
    return { supported: true, on: out.trim() === 'On' };
  } catch (e) { return { supported: false, on: null, error: (e as Error).message }; }
}

export async function setBluetooth(on: boolean) {
  await ps(`${RADIO_PS}\nif (-not $bt) { throw 'No Bluetooth radio' }\n$r = MxAwait ($bt.SetStateAsync('${on ? 'On' : 'Off'}')) ([Windows.Devices.Radios.RadioAccessStatus]); [string]$r`, 20000);
  return getBluetooth();
}

function parseKV(block: string) {
  const o: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:]+?)\s*:\s(.*)$/);
    if (m) o[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return o;
}

export async function getWifi(scan = false): Promise<WifiState> {
  if (!isWin) return { supported: false, connected: false, ssid: null, signal: null, state: 'unsupported', networks: [] };
  try {
    const iface = await run('netsh', ['wlan', 'show', 'interfaces']);
    if (/There is no wireless interface|not running/i.test(iface)) return { supported: false, connected: false, ssid: null, signal: null, state: 'No Wi-Fi adapter', networks: [] };
    const kv = parseKV(iface);
    const state = kv['state'] || 'unknown';
    const connected = /^connected$/i.test(state);
    const res: WifiState = {
      supported: true, connected, state,
      ssid: connected ? kv['ssid'] || null : null,
      signal: kv['signal'] ? parseInt(kv['signal'], 10) : null,
      networks: [],
    };
    if (scan) {
      try {
        const [nets, profiles] = await Promise.all([run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']), run('netsh', ['wlan', 'show', 'profiles'])]);
        const known = new Set(Array.from(profiles.matchAll(/:\s(.+)$/gm)).map((m) => m[1].trim()));
        const blocks = nets.split(/\r?\n(?=SSID \d+ :)/);
        const map = new Map<string, WifiState['networks'][number]>();
        for (const b of blocks) {
          const m = b.match(/^SSID \d+ : (.*)$/m);
          if (!m) continue;
          const ssid = m[1].trim();
          if (!ssid) continue;
          const sig = Math.max(...Array.from(b.matchAll(/Signal\s*:\s*(\d+)%/g)).map((x) => parseInt(x[1], 10)), 0);
          const auth = (b.match(/Authentication\s*:\s*(.*)/) || [])[1]?.trim() || '';
          const prev = map.get(ssid);
          if (!prev || prev.signal < sig) map.set(ssid, { ssid, signal: sig, auth, known: known.has(ssid) });
        }
        res.networks = [...map.values()].sort((a, b) => b.signal - a.signal);
        if (/location permission|Location services/i.test(nets)) res.error = 'Windows requires Location permission to list nearby networks. Open Wi-Fi settings to see them.';
      } catch (e) {
        res.error = (e as Error).message;
      }
    }
    return res;
  } catch (e) {
    return { supported: false, connected: false, ssid: null, signal: null, state: 'error', networks: [], error: (e as Error).message };
  }
}

export async function connectWifi(ssid: string) {
  // Only saved profiles can be joined without a password prompt; others go to Windows Settings.
  const out = await run('netsh', ['wlan', 'connect', `name=${ssid}`]);
  return { ok: /successfully/i.test(out), message: out.trim() };
}
export async function disconnectWifi() {
  const out = await run('netsh', ['wlan', 'disconnect']);
  return { ok: /successfully/i.test(out), message: out.trim() };
}

export function osTheme(): 'light' | 'dark' {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

export async function setOsTheme(mode: 'light' | 'dark') {
  const v = mode === 'light' ? '1' : '0';
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
  await run('reg', ['add', key, '/v', 'AppsUseLightTheme', '/t', 'REG_DWORD', '/d', v, '/f']);
  await run('reg', ['add', key, '/v', 'SystemUsesLightTheme', '/t', 'REG_DWORD', '/d', v, '/f']);
  return mode;
}

export async function getControlState(): Promise<ControlState> {
  const [volume, brightness] = await Promise.all([getVolume(), getBrightness()]);
  return { volume, brightness, bluetooth: { supported: false, on: null }, osTheme: osTheme() };
}

export function windowsBuild(): number {
  const parts = os.release().split('.');
  return parseInt(parts[2] || '0', 10);
}
export const isWin11 = () => isWin && windowsBuild() >= 22000;

const SETTINGS_URIS: Record<string, string> = {
  display: 'ms-settings:display',
  sound: 'ms-settings:sound',
  nightlight: 'ms-settings:nightlight',
  bluetooth: 'ms-settings:bluetooth',
  wifi: 'ms-settings:network-wifi',
  network: 'ms-settings:network-status',
  battery: 'ms-settings:batterysaver',
  power: 'ms-settings:powersleep',
  notifications: 'ms-settings:notifications',
  personalization: 'ms-settings:personalization',
  colors: 'ms-settings:colors',
  background: 'ms-settings:personalization-background',
  apps: 'ms-settings:appsfeatures',
  startup: 'ms-settings:startupapps',
  storage: 'ms-settings:storagesense',
  about: 'ms-settings:about',
  update: 'ms-settings:windowsupdate',
  privacy: 'ms-settings:privacy',
  mouse: 'ms-settings:mousetouchpad',
  keyboard: 'ms-settings:typing',
  datetime: 'ms-settings:dateandtime',
  language: 'ms-settings:regionlanguage',
  accounts: 'ms-settings:yourinfo',
  defaultapps: 'ms-settings:defaultapps',
  multitasking: 'ms-settings:multitasking',
  taskbar: 'ms-settings:taskbar',
  location: 'ms-settings:privacy-location',
  vpn: 'ms-settings:network-vpn',
  printers: 'ms-settings:printers',
};

export function openWindowsSettings(page: string) {
  let uri = SETTINGS_URIS[page] || page;
  if (page === 'focus') uri = isWin11() ? 'ms-settings:focus' : 'ms-settings:quiethours';
  if (!uri.startsWith('ms-settings:')) uri = 'ms-settings:';
  return shell.openExternal(uri);
}

export async function power(action: 'lock' | 'sleep' | 'restart' | 'shutdown' | 'logout') {
  if (!isWin) throw new Error('Windows only');
  switch (action) {
    case 'lock': return run('rundll32.exe', ['user32.dll,LockWorkStation']);
    case 'sleep': return ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) | Out-Null`);
    case 'restart': return run('shutdown', ['/r', '/t', '0']);
    case 'shutdown': return run('shutdown', ['/s', '/t', '0']);
    case 'logout': return run('shutdown', ['/l']);
  }
}

export async function emptyRecycleBin() {
  await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
}

export { psQuote };
