// Registry of built-in applications. Shared by main (window sizes) and renderer (icons, names).
export interface BuiltinApp {
  id: string;
  name: string;
  icon: string; // lucide icon name
  gradient: [string, string];
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  multiWindow?: boolean;
  category: string;
  keywords?: string[];
}

export const BUILTIN_APPS: BuiltinApp[] = [
  { id: 'finder', name: 'Finder', icon: 'Smile', gradient: ['#4fc3ff', '#1767ff'], width: 1000, height: 640, minWidth: 640, minHeight: 400, multiWindow: true, category: 'Productivity', keywords: ['files', 'explorer', 'folders'] },
  { id: 'notes', name: 'Notes', icon: 'StickyNote', gradient: ['#ffe27a', '#f7b500'], width: 920, height: 620, minWidth: 600, minHeight: 380, category: 'Productivity', keywords: ['memo', 'text'] },
  { id: 'calculator', name: 'Calculator', icon: 'Calculator', gradient: ['#6b6b70', '#2b2b30'], width: 340, height: 540, minWidth: 300, minHeight: 480, category: 'Utilities' },
  { id: 'calendar', name: 'Calendar', icon: 'CalendarDays', gradient: ['#ff6b6b', '#e0263f'], width: 1000, height: 680, minWidth: 700, minHeight: 480, category: 'Productivity', keywords: ['events', 'schedule'] },
  { id: 'weather', name: 'Weather', icon: 'CloudSun', gradient: ['#5ab8ff', '#2160d9'], width: 860, height: 620, minWidth: 600, minHeight: 460, category: 'Utilities', keywords: ['forecast', 'temperature'] },
  { id: 'clock', name: 'Clock', icon: 'AlarmClock', gradient: ['#3b3b40', '#0d0d10'], width: 760, height: 560, minWidth: 560, minHeight: 440, category: 'Utilities', keywords: ['alarm', 'timer', 'stopwatch', 'world clock'] },
  { id: 'music', name: 'Music', icon: 'Music', gradient: ['#ff6a88', '#ff2d55'], width: 1000, height: 660, minWidth: 720, minHeight: 460, category: 'Entertainment', keywords: ['songs', 'audio', 'player', 'mp3'] },
  { id: 'photos', name: 'Photos', icon: 'Images', gradient: ['#ffcf5c', '#ff6f91'], width: 1000, height: 680, minWidth: 600, minHeight: 420, multiWindow: true, category: 'Entertainment', keywords: ['image viewer', 'pictures'] },
  { id: 'screenshot', name: 'Screenshot', icon: 'Camera', gradient: ['#9aa4b2', '#4b5563'], width: 520, height: 420, minWidth: 460, minHeight: 380, category: 'Utilities', keywords: ['capture', 'screen grab'] },
  { id: 'clipboard', name: 'Clipboard', icon: 'ClipboardList', gradient: ['#7ee3b8', '#14a37f'], width: 520, height: 640, minWidth: 420, minHeight: 420, category: 'Utilities', keywords: ['paste', 'history', 'copy'] },
  { id: 'monitor', name: 'Activity Monitor', icon: 'Activity', gradient: ['#52e08a', '#0b8f4d'], width: 1040, height: 700, minWidth: 760, minHeight: 500, category: 'Utilities', keywords: ['system monitor', 'cpu', 'gpu', 'performance'] },
  { id: 'taskmanager', name: 'Task Manager', icon: 'ListChecks', gradient: ['#8a7dff', '#4a35d9'], width: 900, height: 620, minWidth: 640, minHeight: 420, category: 'Utilities', keywords: ['processes', 'kill', 'end task'] },
  { id: 'wallpapers', name: 'Wallpapers', icon: 'Image', gradient: ['#61d1ff', '#a95cff'], width: 980, height: 660, minWidth: 700, minHeight: 460, category: 'Utilities', keywords: ['background', 'desktop picture'] },
  { id: 'settings', name: 'System Settings', icon: 'Settings', gradient: ['#a1a1aa', '#52525b'], width: 960, height: 660, minWidth: 760, minHeight: 480, category: 'Utilities', keywords: ['preferences', 'options'] },
];

// Pseudo-apps (shell surfaces), not windows
export const SHELL_ITEMS: BuiltinApp[] = [
  { id: 'launchpad', name: 'Launchpad', icon: 'LayoutGrid', gradient: ['#c7d2fe', '#6366f1'], width: 0, height: 0, minWidth: 0, minHeight: 0, category: 'System' },
];

export const ALL_BUILTINS = [...BUILTIN_APPS, ...SHELL_ITEMS];
export const builtinById = (id: string) => ALL_BUILTINS.find((a) => a.id === id);
