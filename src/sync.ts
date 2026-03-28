/**
 * sync.ts — run once during setup (or manually with FORCE_SYNC_SCHEDULE=true)
 *
 * 1. Fetches the IPL schedule for the configured season
 * 2. Stores matches in SQLite
 * 3. Computes the fixed notification schedule for each match
 */

import { DateTime } from "luxon";
import {
  countMatchesForSeason,
  getDb,
  getMetadata,
  insertNotificationIfMissing,
  Match,
  setMetadata,
  upsertMatch,
} from "./db";
import { CricketScheduleMatch, getIplSchedule } from "./cricket";
import {
  FORCE_SYNC_SCHEDULE,
  IPL_SEASON,
  IPL_SERIES_ID,
  MID_INNINGS_OFFSET_MINUTES,
  POST_MATCH_OFFSET_MINUTES,
  PRE_GAME_LOCAL_HOUR,
  PRE_MATCH_MINUTES,
  TIMEZONE,
} from "./config";

function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

function previousNightAtTenPm(isoUtc: string): string {
  return DateTime.fromISO(isoUtc, { zone: "utc" })
    .setZone(TIMEZONE)
    .minus({ days: 1 })
    .set({ hour: PRE_GAME_LOCAL_HOUR, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toISO() ?? isoUtc;
}

function toMatch(s: CricketScheduleMatch): Match {
  return {
    match_id: s.id,
    series_id: IPL_SERIES_ID,
    season: IPL_SEASON,
    title: s.title,
    team_1: s.team1,
    team_2: s.team2,
    date_start: s.dateTimeGmt,
    date_end: s.dateEndGmt,
    venue: s.venue,
    city: s.city,
    country: s.country,
    status: s.status,
  };
}

function scheduleNotifications(db: ReturnType<typeof getDb>, match: Match): void {
  insertNotificationIfMissing(db, match.match_id, "preview_night", previousNightAtTenPm(match.date_start));
  insertNotificationIfMissing(db, match.match_id, "pre_match", addMinutes(match.date_start, -PRE_MATCH_MINUTES));
  insertNotificationIfMissing(db, match.match_id, "mid_innings", addMinutes(match.date_start, MID_INNINGS_OFFSET_MINUTES));
  insertNotificationIfMissing(db, match.match_id, "post_match", addMinutes(match.date_start, POST_MATCH_OFFSET_MINUTES));
}

async function main(): Promise<void> {
  console.log(`[sync] Starting — ${new Date().toISOString()}`);
  const db = getDb();
  const syncKey = `ipl_schedule_synced_${IPL_SEASON}`;
  const alreadySynced = getMetadata(db, syncKey) === "true";
  const existingMatches = countMatchesForSeason(db, IPL_SEASON);

  if (alreadySynced && existingMatches > 0 && !FORCE_SYNC_SCHEDULE) {
    console.log(`[sync] IPL ${IPL_SEASON} schedule already stored (${existingMatches} matches), skipping`);
    return;
  }

  const matches = await getIplSchedule(IPL_SERIES_ID);
  console.log(`[sync] IPL ${IPL_SEASON}: ${matches.length} match(es) fetched`);

  for (const scheduleMatch of matches) {
    const match = toMatch(scheduleMatch);
    upsertMatch(db, match);
    scheduleNotifications(db, match);
  }

  setMetadata(db, syncKey, "true");
  console.log(`[sync] Done — ${matches.length} matches processed`);
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
