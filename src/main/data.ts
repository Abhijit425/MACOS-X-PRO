// CRUD for Notes and Calendar (SQLite).
import crypto from 'node:crypto';
import { all, run } from './db';
import { broadcast } from './settings';
import type { CalendarEvent, Note } from '@shared/types';

export function listNotes(): Note[] {
  return all<Omit<Note, 'pinned'> & { pinned: number }>('SELECT * FROM notes ORDER BY pinned DESC, updated DESC').map((n) => ({ ...n, pinned: !!n.pinned }));
}
export function saveNote(n: Partial<Note> & { id?: string }): Note {
  const now = Date.now();
  if (!n.id) {
    const note: Note = { id: crypto.randomUUID(), title: n.title || 'New Note', body: n.body || '', folder: n.folder || 'Notes', pinned: !!n.pinned, created: now, updated: now };
    run('INSERT INTO notes(id,title,body,folder,pinned,created,updated) VALUES(?,?,?,?,?,?,?)', [note.id, note.title, note.body, note.folder, note.pinned ? 1 : 0, now, now]);
    broadcast('notes:changed');
    return note;
  }
  const cur = all<Note>('SELECT * FROM notes WHERE id=?', [n.id])[0];
  const next = { ...cur, ...n, updated: now } as Note;
  run('UPDATE notes SET title=?, body=?, folder=?, pinned=?, updated=? WHERE id=?', [next.title, next.body, next.folder, next.pinned ? 1 : 0, now, n.id]);
  broadcast('notes:changed');
  return next;
}
export function deleteNote(id: string) { run('DELETE FROM notes WHERE id=?', [id]); broadcast('notes:changed'); return true; }

export function listEvents(from: number, to: number): CalendarEvent[] {
  return all<Omit<CalendarEvent, 'allDay'> & { allDay: number }>('SELECT id,title,start,end,allDay,color,notes,remindMinutes FROM events WHERE end >= ? AND start <= ? ORDER BY start', [from, to]).map((e) => ({ ...e, allDay: !!e.allDay }));
}
export function saveEvent(e: Partial<CalendarEvent>): CalendarEvent {
  const ev: CalendarEvent = {
    id: e.id || crypto.randomUUID(), title: e.title || 'New Event', start: e.start || Date.now(), end: e.end || (e.start || Date.now()) + 3600000,
    allDay: !!e.allDay, color: e.color || '#0a84ff', notes: e.notes || '', remindMinutes: e.remindMinutes ?? null,
  };
  run(`INSERT INTO events(id,title,start,end,allDay,color,notes,remindMinutes,reminded) VALUES(?,?,?,?,?,?,?,?,0)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title,start=excluded.start,end=excluded.end,allDay=excluded.allDay,color=excluded.color,notes=excluded.notes,remindMinutes=excluded.remindMinutes,reminded=0`,
  [ev.id, ev.title, ev.start, ev.end, ev.allDay ? 1 : 0, ev.color, ev.notes, ev.remindMinutes]);
  broadcast('events:changed');
  return ev;
}
export function deleteEvent(id: string) { run('DELETE FROM events WHERE id=?', [id]); broadcast('events:changed'); return true; }
