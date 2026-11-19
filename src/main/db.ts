// SQLite persistence via sql.js (WebAssembly SQLite — no native build needed).
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import initSqlJs, { Database } from 'sql.js';

let db: Database | null = null;
let dbPath = '';
let saveTimer: NodeJS.Timeout | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, body TEXT, folder TEXT, pinned INTEGER DEFAULT 0, created INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, start INTEGER, end INTEGER, allDay INTEGER, color TEXT, notes TEXT, remindMinutes INTEGER, reminded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS clipboard (id TEXT PRIMARY KEY, kind TEXT, text TEXT, image TEXT, ts INTEGER, pinned INTEGER DEFAULT 0, hash TEXT);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, app TEXT, title TEXT, body TEXT, ts INTEGER, read INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity (day TEXT PRIMARY KEY, activeSeconds INTEGER DEFAULT 0, focusSeconds INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, text TEXT, done INTEGER DEFAULT 0, day TEXT, ts INTEGER);
`;

export async function initDb() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'macosxpro.sqlite');
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) as unknown as ArrayBuffer });
  if (fs.existsSync(dbPath)) {
    try {
      db = new SQL.Database(fs.readFileSync(dbPath));
    } catch (e) {
      // Corrupted DB: keep a backup and start fresh rather than crash.
      fs.renameSync(dbPath, dbPath + '.corrupt-' + Date.now());
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }
  db.exec(SCHEMA);
  persistNow();
}

function d(): Database {
  if (!db) throw new Error('DB not initialised');
  return db;
}

export function run(sql: string, params: unknown[] = []) {
  d().run(sql, params as never);
  schedulePersist();
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const stmt = d().prepare(sql);
  stmt.bind(params as never);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return all<T>(sql, params)[0];
}

export function kvGet<T>(key: string, fallback: T): T {
  const row = get<{ value: string }>('SELECT value FROM kv WHERE key=?', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function kvSet(key: string, value: unknown) {
  run('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
}

function schedulePersist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, 800);
}

export function persistNow() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, dbPath);
  } catch (e) {
    console.error('DB persist failed', e);
  }
}
