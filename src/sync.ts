/**
 * sync.ts — run once daily via launchd
 *
 * 1. Fetches sessions from OpenF1 for current (+ next) year
 * 2. Upserts them into SQLite
 * 3. Computes notification times and inserts them if not already present
 */

import { getDb, upsertSession, insertNotificationIfMissing, Session } from "./db";
import { getUpcomingSessions, OpenF1Session } from "./openf1";
import { REMINDER_HOURS_EARLY, REMINDER_MINUTES_FINAL, RESULTS_DELAY_MINUTES, SESSION_FILTER, PODCAST_DELAY_MINUTES } from "./config";

function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

function addHours(isoUtc: string, hours: number): string {
  return addMinutes(isoUtc, hours * 60);
}

function toSession(s: OpenF1Session): Session {
  return {
    session_key: s.session_key,
    session_type: s.session_type,
    session_name: s.session_name,
    date_start: s.date_start,
    date_end: s.date_end ?? addHours(s.date_start, 2),
    location: s.location,
    country_name: s.country_name,
    country_code: s.country_code,
    circuit_short_name: s.circuit_short_name,
    year: s.year,
  };
}

function scheduleNotifications(db: ReturnType<typeof getDb>, session: Session): void {
  const key = session.session_key;
  const start = session.date_start;
  const end = session.date_end;
  const isRaceLike = ["Race", "Sprint"].includes(session.session_type);

  insertNotificationIfMissing(db, key, "reminder_24h", addHours(start, -REMINDER_HOURS_EARLY));
  insertNotificationIfMissing(db, key, "reminder_30m", addMinutes(start, -REMINDER_MINUTES_FINAL));
  insertNotificationIfMissing(db, key, "session_start", start);
  insertNotificationIfMissing(db, key, "results", addMinutes(end, RESULTS_DELAY_MINUTES));

  if (isRaceLike) {
    insertNotificationIfMissing(db, key, "live_update", addMinutes(start, 10));
    insertNotificationIfMissing(db, key, "podcast", addMinutes(end, PODCAST_DELAY_MINUTES));
  }
}

async function main(): Promise<void> {
  console.log(`[sync] Starting — ${new Date().toISOString()}`);
  const db = getDb();

  const now = new Date();
  const years = [now.getFullYear()];
  if (now.getMonth() >= 10) years.push(now.getFullYear() + 1);

  let total = 0;
  for (const year of years) {
    const sessions = await getUpcomingSessions(year);
    console.log(`[sync] ${year}: ${sessions.length} upcoming sessions`);

    for (const s of sessions) {
      if (SESSION_FILTER.length && !SESSION_FILTER.includes(s.session_type)) continue;

      const session = toSession(s);
      upsertSession(db, session);
      scheduleNotifications(db, session);
      total++;
    }
  }

  console.log(`[sync] Done — ${total} sessions processed`);
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
