// Uses Node 22's built-in SQLite (node --experimental-sqlite)
// No native dependencies required.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite");

import { DB_PATH } from "./config";

export interface Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  location: string;
  country_name: string;
  country_code: string;
  circuit_short_name: string;
  year: number;
}

export type NotificationType =
  | "reminder_24h"
  | "reminder_30m"
  | "session_start"
  | "live_update"
  | "results"
  | "podcast";

export interface DueNotification {
  id: number;
  session_key: number;
  type: NotificationType;
  scheduled_at: string;
  sent_at: string | null;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  location: string;
  country_name: string;
  country_code: string;
  circuit_short_name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

let _db: Db = null;

export function getDb(): Db {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);

  _db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sessions (
      session_key        INTEGER PRIMARY KEY,
      session_type       TEXT NOT NULL,
      session_name       TEXT NOT NULL,
      date_start         TEXT NOT NULL,
      date_end           TEXT NOT NULL,
      location           TEXT NOT NULL,
      country_name       TEXT NOT NULL,
      country_code       TEXT NOT NULL,
      circuit_short_name TEXT NOT NULL,
      year               INTEGER NOT NULL,
      synced_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key  INTEGER NOT NULL,
      type         TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_at      TEXT,
      UNIQUE(session_key, type),
      FOREIGN KEY (session_key) REFERENCES sessions(session_key)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_due
      ON notifications(scheduled_at, sent_at);
  `);

  return _db;
}

export function upsertSession(db: Db, s: Session): void {
  db.prepare(`
    INSERT INTO sessions
      (session_key, session_type, session_name, date_start, date_end,
       location, country_name, country_code, circuit_short_name, year, synced_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_key) DO UPDATE SET
      date_start = excluded.date_start,
      date_end   = excluded.date_end,
      synced_at  = excluded.synced_at
  `).run(
    s.session_key, s.session_type, s.session_name, s.date_start, s.date_end,
    s.location, s.country_name, s.country_code, s.circuit_short_name, s.year,
    new Date().toISOString()
  );
}

export function insertNotificationIfMissing(
  db: Db,
  session_key: number,
  type: NotificationType,
  scheduled_at: string
): void {
  db.prepare(`
    INSERT OR IGNORE INTO notifications (session_key, type, scheduled_at)
    VALUES (?, ?, ?)
  `).run(session_key, type, scheduled_at);
}

export function getDueNotifications(db: Db): DueNotification[] {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  return db.prepare(`
    SELECT
      n.id, n.session_key, n.type, n.scheduled_at, n.sent_at,
      s.session_type, s.session_name, s.date_start, s.date_end,
      s.location, s.country_name, s.country_code, s.circuit_short_name
    FROM notifications n
    JOIN sessions s ON n.session_key = s.session_key
    WHERE n.sent_at IS NULL
      AND n.scheduled_at <= ?
      AND n.scheduled_at >= ?
    ORDER BY n.scheduled_at ASC
  `).all(now, cutoff) as DueNotification[];
}

export function markSent(db: Db, id: number): void {
  db.prepare("UPDATE notifications SET sent_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function rescheduleNotification(db: Db, id: number, newScheduledAt: string): void {
  db.prepare("UPDATE notifications SET scheduled_at = ? WHERE id = ?")
    .run(newScheduledAt, id);
}
