import { Notification, app } from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, run } from './db';
import { getSettings, broadcast } from './settings';
import { sendToShell } from './windows';
import type { NotificationItem } from '@shared/types';

const iconPath = () => path.join(app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'), 'icon.ico');

export function listNotifications(): NotificationItem[] {
  return all<Omit<NotificationItem, 'read'> & { read: number }>('SELECT * FROM notifications ORDER BY ts DESC LIMIT 200').map((n) => ({ ...n, read: !!n.read }));
}

export function notify(appName: string, title: string, body = '', opts: { urgent?: boolean } = {}) {
  const s = getSettings();
  const item: NotificationItem = { id: crypto.randomUUID(), app: appName, title, body, ts: Date.now(), read: false };
  run('INSERT INTO notifications(id,app,title,body,ts,read) VALUES(?,?,?,?,?,0)', [item.id, item.app, item.title, item.body, item.ts]);
  run('DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY ts DESC LIMIT 200)');
  broadcast('notifications:changed', listNotifications());
  if (!s.notificationsEnabled) return item;
  if (s.focusMode && !opts.urgent) return item; // Focus: silently kept in history
  if (s.nativeToasts && Notification.isSupported()) {
    // Windows toast (also lands in the Windows Action Centre)
    const n = new Notification({ title, body, icon: iconPath(), silent: !s.notificationSound });
    n.show();
  } else {
    sendToShell('notification:banner', item);
  }
  return item;
}

export function markAllRead() { run('UPDATE notifications SET read=1'); broadcast('notifications:changed', listNotifications()); }
export function clearNotifications(id?: string) {
  if (id) run('DELETE FROM notifications WHERE id=?', [id]); else run('DELETE FROM notifications');
  broadcast('notifications:changed', listNotifications());
}
