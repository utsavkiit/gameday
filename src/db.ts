// Uses Node 22's built-in SQLite (node --experimental-sqlite)
// No native dependencies required.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite");

import { DB_PATH, GRACE_PERIOD_HOURS } from "./config";

export interface Match {
  match_id: string;
  series_id: string;
  season: number;
  title: string;
  team_1: string;
  team_2: string;
  date_start: string;
  date_end: string;
  venue: string;
  city: string;
  country: string;
  status: string;
}

export type NotificationType =
  | "preview_night"
  | "pre_match"
  | "mid_innings"
  | "post_match";

export interface DueNotification {
  id: number;
  match_id: string;
  type: NotificationType;
  scheduled_at: string;
  sent_at: string | null;
  series_id: string;
  season: number;
  title: string;
  team_1: string;
  team_2: string;
  date_start: string;
  date_end: string;
  venue: string;
  city: string;
  country: string;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

let _db: Db = null;

export function getDb(): Db {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);

  _db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS matches (
      match_id           TEXT PRIMARY KEY,
      series_id          TEXT NOT NULL,
      season             INTEGER NOT NULL,
      title              TEXT NOT NULL,
      team_1             TEXT NOT NULL,
      team_2             TEXT NOT NULL,
      date_start         TEXT NOT NULL,
      date_end           TEXT NOT NULL,
      venue              TEXT NOT NULL,
      city               TEXT NOT NULL,
      country            TEXT NOT NULL,
      status             TEXT NOT NULL,
      synced_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id     TEXT NOT NULL,
      type         TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_at      TEXT,
      UNIQUE(match_id, type),
      FOREIGN KEY (match_id) REFERENCES matches(match_id)
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_due
      ON notifications(scheduled_at, sent_at);
  `);

  return _db;
}

export function upsertMatch(db: Db, match: Match): void {
  db.prepare(`
    INSERT INTO matches
      (match_id, series_id, season, title, team_1, team_2,
       date_start, date_end, venue, city, country, status, synced_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      title      = excluded.title,
      team_1     = excluded.team_1,
      team_2     = excluded.team_2,
      date_start = excluded.date_start,
      date_end   = excluded.date_end,
      venue      = excluded.venue,
      city       = excluded.city,
      country    = excluded.country,
      status     = excluded.status,
      synced_at  = excluded.synced_at
  `).run(
    match.match_id, match.series_id, match.season, match.title, match.team_1, match.team_2,
    match.date_start, match.date_end, match.venue, match.city, match.country, match.status,
    new Date().toISOString()
  );
}

export function insertNotificationIfMissing(
  db: Db,
  match_id: string,
  type: NotificationType,
  scheduled_at: string
): void {
  db.prepare(`
    INSERT OR IGNORE INTO notifications (match_id, type, scheduled_at)
    VALUES (?, ?, ?)
  `).run(match_id, type, scheduled_at);
}

export function getDueNotifications(db: Db): DueNotification[] {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();

  return db.prepare(`
    SELECT
      n.id, n.match_id, n.type, n.scheduled_at, n.sent_at,
      m.series_id, m.season, m.title, m.team_1, m.team_2, m.date_start, m.date_end,
      m.venue, m.city, m.country, m.status
    FROM notifications n
    JOIN matches m ON n.match_id = m.match_id
    WHERE n.sent_at IS NULL
      AND n.scheduled_at <= ?
      AND n.scheduled_at >= ?
    ORDER BY n.scheduled_at ASC
  `).all(now, cutoff) as DueNotification[];
}

export function markSent(db: Db, id: number): void {
  db.prepare(`UPDATE notifications SET sent_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export function rescheduleNotification(db: Db, id: number, newScheduledAt: string): void {
  db.prepare(`UPDATE notifications SET scheduled_at = ? WHERE id = ?`)
    .run(newScheduledAt, id);
}

export function setMetadata(db: Db, key: string, value: string): void {
  db.prepare(`
    INSERT INTO metadata (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

export function getMetadata(db: Db, key: string): string | null {
  const row = db.prepare(`SELECT value FROM metadata WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function countMatchesForSeason(db: Db, season: number): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM matches WHERE season = ?`).get(season) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}
