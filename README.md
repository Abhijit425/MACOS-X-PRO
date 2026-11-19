# MACOS X PRO

A macOS-inspired desktop experience for Windows 10/11 (x64). You get a menu bar, Dock, Spotlight, Launchpad, Control Centre, Notification Centre, desktop widgets and 14 apps, all working with your real files, apps and hardware.

Windows itself is never modified. Explorer, the taskbar, Defender and system files are left alone. You can hide everything instantly with **Alt+Shift+M** or the tray icon, and quitting restores the normal desktop.

---

## Install

1. Run **`MACOS-X-PRO-Setup-1.0.0.exe`**.
2. The installer isn't code-signed, so Windows SmartScreen may show *“Windows protected your PC”*. Click **More info → Run anyway**.
3. The installer is per-user, so it needs no admin rights. By default it installs to `%LOCALAPPDATA%\Programs\MACOS X PRO`, and you can change the folder. It also creates a **Desktop shortcut**, a **Start menu shortcut** and an **Add/Remove Programs** entry.
4. On first launch, the **Setup Assistant** asks you to choose:
   - your look (light, dark or auto, plus an accent colour)
   - the mode (Overlay or Immersive)
   - a wallpaper
   - your weather city

**Uninstall:** go to Settings → Apps → *MACOS X PRO* → Uninstall. You can also run `Uninstall MACOS X PRO.exe` in the install folder. The uninstaller asks whether to keep your notes, events and settings.

## Modes

| Mode | What you see |
|---|---|
| **Overlay** | The menu bar, Dock and widgets float over your normal Windows desktop and taskbar. |
| **Immersive** | A full macOS-style desktop with a wallpaper, desktop icons (your real Desktop folder) and widgets, sitting behind your app windows. |

Switch modes in **View** menu, **System Settings › Desktop & Menu Bar** or the tray icon.

With *Reserve screen space for the menu bar* turned on, the menu bar registers as a Windows AppBar. Maximised windows then sit below it instead of under it.

## Keyboard shortcuts (global, changeable in Settings)

| Action | Default |
|---|---|
| Spotlight | **Alt+Space** |
| Launchpad | **Alt+F1** |
| Control Centre | **Alt+F2** |
| Notification Centre | **Alt+F3** |
| Screenshot: entire screen | **Alt+Shift+3** |
| Screenshot: selected area | **Alt+Shift+4** |
| Hide/show MACOS X PRO | **Alt+Shift+M** |

If another program already owns a combination (for example, PowerToys Run uses Alt+Space), Settings › Keyboard Shortcuts flags it in red so you can pick another.

## What's inside

- **Menu bar:** shows the name of the active Windows app, plus the logo menu (About, Settings, Recent Items, Force Quit, Sleep, Restart, Shut Down, Lock, Log Out, with confirmation for anything destructive).
  - **Edit** commands (Undo, Cut, Copy, Paste) are sent to the app you're using.
  - The right side shows battery %, Wi-Fi, volume, Control Centre, Spotlight, the clock and an unread-notifications dot.
- **Dock:**
  - spring magnification and launch bounce
  - running-app dots (for built-in apps and real Windows processes)
  - drag to reorder, drag off to remove, drop any `.exe` or `.lnk` to add it
  - right-click menus, auto-hide, adjustable size
  - a Downloads stack and the Recycle Bin
- **Finder:**
  - browse your real drives and folders, plus Recents, Desktop, Documents, Downloads, Pictures, Music and Videos
  - grid or list view, sort, kind filters, search, multiple tabs, back/forward, clickable path bar
  - a preview pane and Quick Look (Space)
  - copy, cut, paste, duplicate, rename (F2), new folder and new file
  - drag and drop, including to and from File Explorer
  - **Delete always asks first and goes to the Recycle Bin.** Permanent delete (Shift+Del) asks a second, explicit question.
- **Spotlight:**
  - installed apps (Start Menu and Store apps), files and folders (from an in-memory index of your user folders), recent documents
  - System Settings and Windows Settings pages
  - a calculator (`sqrt(2)*pi`), unit conversion (`10 km to mi`, `100 f to c`, `2 gb in mb`) and quick actions (lock, screenshot, dark mode, focus, show desktop…)
  - full keyboard navigation
- **Launchpad:** every installed Windows app with its real high-resolution icon. Includes search, category filters, pages (scroll or arrow keys), drag to reorder, drag one app onto another to make a folder, and right-click › Add to Dock.
- **Control Centre:**
  - Wi-Fi status and nearby networks, with one-click joining of saved networks
  - a Bluetooth on/off toggle
  - Focus, light/dark mode, brightness, and volume with mute
  - battery, screenshot, Show Desktop, Lock and Task View
  - shortcuts to Windows Night light, Display and Sound settings
- **Notification Centre:** date and time, weather, upcoming events, Focus and notification toggles, plus notification history grouped by app with Clear All. Notifications appear as Windows toasts, so they also land in the Windows notification centre.
- **Widgets:** Clock (digital or analog), Calendar, Weather, System Performance, CPU, GPU, RAM, Storage, Battery, Network speed and Daily Productivity.
  - Daily Productivity shows screen time, focus sessions (25 or 50 min) and a task list.
  - To move, resize, add or remove widgets, right-click the desktop › **Edit Widgets…**.
- **Apps:**
  - **Notes:** rich text, checklists, folders, pinning, search.
  - **Calculator:** basic and scientific, history tape, keyboard input.
  - **Calendar:** day, week and month views, colours, reminders.
  - **Weather:** hourly and 10-day forecasts plus details.
  - **Clock:** world clock, alarms, stopwatch, timers.
  - **Music:** your local MP3, M4A, FLAC, WAV and OGG files, with album art. It shows in the Windows media flyout and responds to the keyboard media keys.
  - **Photos:** zoom, pan, rotate, slideshow, set as wallpaper.
  - **Screenshot:** full screen, a selected area or a single window, with a delay timer. Captures go to `Pictures\Screenshots` and the clipboard.
  - **Clipboard:** history of text and images, pinning, search.
  - **Activity Monitor:** real CPU, per-core, GPU, memory, disk, network, battery-health and process data.
  - **Task Manager:** live processes with an End Task confirmation, and a warning for Windows system processes.
  - **Wallpapers:** 14 built-in 4K wallpapers, dynamic day/night variants, rotation, per-display wallpapers, importing your own pictures, and an optional sync to the Windows wallpaper (your original wallpaper is remembered and restored).
  - **System Settings:** Appearance, Wallpaper, Dock, Desktop & Menu Bar, Widgets, Notifications, Keyboard Shortcuts, Startup, Performance, Privacy and About. Everything is saved automatically.

## How the Windows integration works (and its honest limits)

| Feature | Implementation | Limits |
|---|---|---|
| Volume / mute | Windows Core Audio API | Affects the default output device. |
| Brightness | WMI `WmiMonitorBrightnessMethods` | Works on laptop panels. External monitors usually don't expose it, and the app says so instead of faking it. |
| Wi-Fi | `netsh wlan` | Saved networks join directly. New networks need a password, so Windows Wi-Fi settings open. On Windows 11 24H2, listing nearby networks needs Location permission. |
| Bluetooth | WinRT `Windows.Devices.Radios` | If Windows denies radio access, Bluetooth settings open instead. |
| Night light, Focus/Do Not Disturb | Open the Windows settings page | Windows has no public API to toggle these. |
| GPU usage / temperature | `nvidia-smi` (NVIDIA driver) | Works on your RTX 2050. Intel iGPU load isn't exposed without vendor tools, so it shows "—". |
| CPU temperature | WMI | Most laptops don't expose this to Windows. Shown as "not exposed" rather than an invented number. |
| Notifications | Native Windows toasts | Reading *other* apps' Windows notifications requires a packaged (MSIX) app identity, so history covers MACOS X PRO's own notifications (alarms, timers, calendar, screenshots, battery…). |
| Installed apps & icons | Start Menu shortcuts + `Get-StartApps`; icons via the Shell `IShellItemImageFactory` | Very old apps without Start Menu entries can be added by dropping their `.exe` onto the Dock. |
| Startup | Windows login item for MACOS X PRO; other startup apps are listed read-only | Enabling or disabling other apps' startup stays in Windows Settings, by design. |
| Blur | Real Windows 11 acrylic on app windows | Windows can't blur *across* separate overlay windows, so the menu bar, Dock and popovers use a denser tinted glass. Windows 10 uses tinted glass everywhere. |

## Data and privacy

Everything is stored locally in `%APPDATA%\MACOS X PRO\macosxpro.sqlite` (SQLite). This covers settings, notes, events, clipboard history, notifications and screen-time stats. The only network requests are weather forecasts from Open-Meteo, for the city you choose. Logs are in `%APPDATA%\MACOS X PRO\logs`.

## Troubleshooting

- **The overlay seems stuck or covers something:** press **Alt+Shift+M**, or right-click the tray icon › *Restore Windows desktop*. Quit from the tray icon or the  menu.
- **Alt+Space doesn't open Spotlight:** another app owns it. Change the shortcut in Settings › Keyboard Shortcuts.
- **Something looks wrong after a crash:** each window reloads itself automatically, and the Windows desktop is never touched. Logs are in the folder above.

## Build from source

Requirements: Node 20 or later.

```bash
npm install
npm run dev          # development (Vite + Electron)
npm run typecheck
npm run dist         # → release/MACOS-X-PRO-Setup-<version>.exe
```

The project is organised like this:

```
src/main/       Electron main process
  windows.ts      menu bar strip, shell overlay, desktop layer, app windows
  native.ts       Win32 via koffi (AppBar, z-order, foreground app, wallpaper, keys)
  ps.ts           persistent PowerShell host
  controls.ts     audio, brightness, Wi-Fi, Bluetooth, theme, power
  system.ts       metrics (systeminformation + nvidia-smi), processes
  apps.ts         app discovery, icons, launching
  files.ts        filesystem, search index, mxfile:// streaming protocol
  db.ts           SQLite via sql.js
  …
src/renderer/   React + Tailwind + Framer Motion UI
  shell/  menubar/  desktop/  apps/  setup/  components/  lib/
src/shared/     shared types and app registry
scripts/        wallpaper and icon generators, installer pipeline
build/          icons, NSIS installer script
```

Tech stack: Electron 45, React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide, SQLite (sql.js), systeminformation and koffi.

MACOS X PRO is not affiliated with or endorsed by Apple Inc. All artwork, icons and wallpapers are original.
