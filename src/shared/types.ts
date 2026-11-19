export type ThemeMode = 'light' | 'dark' | 'auto';
export type DesktopMode = 'overlay' | 'immersive';

export type DockItem =
  | { kind: 'builtin'; id: string }
  | { kind: 'external'; id: string; name: string; target: string; exe?: string };

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number; // percent of desktop width (0..100)
  y: number; // percent of desktop height
  w: number; // px
  h: number; // px
  options: Record<string, unknown>;
}
export type WidgetType =
  | 'clock' | 'calendar' | 'weather' | 'performance' | 'cpu' | 'gpu' | 'ram'
  | 'storage' | 'battery' | 'network' | 'productivity';

export interface Shortcuts {
  spotlight: string;
  launchpad: string;
  controlCentre: string;
  notificationCentre: string;
  screenshotFull: string;
  screenshotRegion: string;
  toggleShell: string;
}

export interface Settings {
  setupComplete: boolean;
  theme: ThemeMode;
  accent: string; // hex
  mode: DesktopMode;
  reduceTransparency: boolean;
  animations: 'full' | 'reduced' | 'off';
  animationSpeed: number; // 0.5 .. 1.5
  fontScale: number;
  // Menu bar
  menuBarEnabled: boolean;
  reserveMenuBarSpace: boolean;
  clock24h: boolean;
  showSeconds: boolean;
  showBatteryPercent: boolean;
  // Dock
  dockItems: DockItem[];
  dockSize: number; // icon px
  dockMagnification: boolean;
  dockMagnifyScale: number; // 1.2 .. 2
  dockAutoHide: boolean;
  dockShowRecents: boolean;
  // Desktop / wallpaper
  wallpaper: string; // id or absolute path
  wallpaperPerDisplay: Record<string, string>;
  wallpaperDynamic: boolean; // light/dark pairing by time of day
  wallpaperRotate: boolean;
  wallpaperRotateMinutes: number;
  wallpaperRotateCategory: string; // 'all' | category | 'custom'
  wallpaperApplyToWindows: boolean;
  originalWindowsWallpaper: string | null;
  customWallpapers: string[];
  widgets: WidgetInstance[];
  widgetsEnabled: boolean;
  // Notifications
  notificationsEnabled: boolean;
  notificationSound: boolean;
  focusMode: boolean;
  nativeToasts: boolean;
  // Shortcuts
  shortcuts: Shortcuts;
  // Performance
  metricsIntervalMs: number;
  gpuMetrics: boolean;
  // Privacy
  clipboardHistory: boolean;
  clipboardMax: number;
  recentFilesInSpotlight: boolean;
  fileIndexing: boolean;
  // Startup
  launchAtLogin: boolean;
  // Weather
  weatherCity: { name: string; lat: number; lon: number; country?: string } | null;
  weatherUnits: 'metric' | 'imperial';
  // Finder
  finderView: 'grid' | 'list';
  finderShowHidden: boolean;
  // Launchpad
  launchpadFolders: { id: string; name: string; apps: string[] }[];
  launchpadOrder: string[];
  // Music
  musicFolders: string[];
  // Clock
  worldClocks: { city: string; tz: string }[];
}

export interface AppEntry {
  id: string; // stable id
  name: string;
  target: string; // .lnk path, exe path, or shell:AppsFolder\ID
  kind: 'lnk' | 'uwp' | 'exe' | 'url';
  exe?: string; // resolved exe for running detection
  category: string;
  icon?: string; // file:// path to cached icon png
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
  ext: string;
  hidden: boolean;
}

export interface DriveInfo {
  mount: string;
  label: string;
  size: number;
  used: number;
  type: string;
}

export interface Metrics {
  ts: number;
  cpu: { load: number; cores: number[]; speed: number; temp: number | null; model: string };
  mem: { total: number; used: number; active: number; swapUsed: number; swapTotal: number };
  gpu: { model: string; load: number | null; memUsed: number | null; memTotal: number | null; temp: number | null }[];
  net: { rx: number; tx: number; iface: string };
  battery: { hasBattery: boolean; percent: number; charging: boolean; acConnected: boolean; timeRemaining: number | null; cycleCount: number | null; maxCapacity: number | null; designedCapacity: number | null; health: number | null };
  disks: { fs: string; mount: string; size: number; used: number }[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  mem: number; // bytes rss
  user?: string;
  path?: string;
}

export interface NotificationItem {
  id: string;
  app: string;
  title: string;
  body: string;
  ts: number;
  read: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  color: string;
  notes: string;
  remindMinutes: number | null;
}

export interface Note {
  id: string;
  title: string;
  body: string; // html
  folder: string;
  pinned: boolean;
  updated: number;
  created: number;
}

export interface ClipItem {
  id: string;
  kind: 'text' | 'image';
  text: string;
  image: string | null; // data URL thumb
  ts: number;
  pinned: boolean;
}

export interface WifiState {
  supported: boolean;
  connected: boolean;
  ssid: string | null;
  signal: number | null;
  state: string;
  networks: { ssid: string; signal: number; auth: string; known: boolean }[];
  error?: string;
}

export interface ControlState {
  volume: { supported: boolean; level: number; muted: boolean };
  brightness: { supported: boolean; level: number };
  bluetooth: { supported: boolean; on: boolean | null; error?: string };
  osTheme: 'light' | 'dark';
}

export interface Alarm { id: string; time: string; label: string; days: number[]; enabled: boolean }
export interface TimerState { id: string; label: string; endsAt: number; duration: number; paused: boolean; remaining: number }

export interface WallpaperInfo { id: string; name: string; category: string; tone: 'light' | 'dark'; path: string; thumb: string; custom?: boolean }

export interface SysInfo {
  os: string; release: string; build: string; arch: string; hostname: string;
  cpu: string; cores: number; memTotal: number; gpus: string[]; manufacturer: string; model: string;
  appVersion: string; electron: string; isWin11: boolean;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  spotlight: 'Alt+Space',
  launchpad: 'Alt+F1',
  controlCentre: 'Alt+F2',
  notificationCentre: 'Alt+F3',
  screenshotFull: 'Alt+Shift+3',
  screenshotRegion: 'Alt+Shift+4',
  toggleShell: 'Alt+Shift+M',
};

export const DEFAULT_SETTINGS: Settings = {
  setupComplete: false,
  theme: 'auto',
  accent: '#0a84ff',
  mode: 'overlay',
  reduceTransparency: false,
  animations: 'full',
  animationSpeed: 1,
  fontScale: 1,
  menuBarEnabled: true,
  reserveMenuBarSpace: true,
  clock24h: false,
  showSeconds: false,
  showBatteryPercent: true,
  dockItems: [
    { kind: 'builtin', id: 'finder' },
    { kind: 'builtin', id: 'launchpad' },
    { kind: 'builtin', id: 'notes' },
    { kind: 'builtin', id: 'calendar' },
    { kind: 'builtin', id: 'weather' },
    { kind: 'builtin', id: 'music' },
    { kind: 'builtin', id: 'photos' },
    { kind: 'builtin', id: 'monitor' },
    { kind: 'builtin', id: 'calculator' },
    { kind: 'builtin', id: 'settings' },
  ],
  dockSize: 54,
  dockMagnification: true,
  dockMagnifyScale: 1.6,
  dockAutoHide: false,
  dockShowRecents: true,
  wallpaper: 'sonoma-dawn',
  wallpaperPerDisplay: {},
  wallpaperDynamic: true,
  wallpaperRotate: false,
  wallpaperRotateMinutes: 30,
  wallpaperRotateCategory: 'all',
  wallpaperApplyToWindows: false,
  originalWindowsWallpaper: null,
  customWallpapers: [],
  widgets: [
    { id: 'w-clock', type: 'clock', x: 3, y: 6, w: 320, h: 170, options: { style: 'digital' } },
    { id: 'w-cal', type: 'calendar', x: 3, y: 28, w: 320, h: 300, options: {} },
    { id: 'w-weather', type: 'weather', x: 3, y: 62, w: 320, h: 170, options: {} },
    { id: 'w-perf', type: 'performance', x: 76, y: 6, w: 340, h: 250, options: {} },
    { id: 'w-prod', type: 'productivity', x: 76, y: 40, w: 340, h: 260, options: {} },
  ],
  widgetsEnabled: true,
  notificationsEnabled: true,
  notificationSound: true,
  focusMode: false,
  nativeToasts: true,
  shortcuts: DEFAULT_SHORTCUTS,
  metricsIntervalMs: 2000,
  gpuMetrics: true,
  clipboardHistory: true,
  clipboardMax: 200,
  recentFilesInSpotlight: true,
  fileIndexing: true,
  launchAtLogin: false,
  weatherCity: null,
  weatherUnits: 'metric',
  finderView: 'grid',
  finderShowHidden: false,
  launchpadFolders: [],
  launchpadOrder: [],
  musicFolders: [],
  worldClocks: [
    { city: 'London', tz: 'Europe/London' },
    { city: 'New York', tz: 'America/New_York' },
    { city: 'Tokyo', tz: 'Asia/Tokyo' },
  ],
};
