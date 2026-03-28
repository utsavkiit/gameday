/**
 * ipl-sync.ts — run once during setup (or manually with FORCE_SYNC_SCHEDULE=true)
 */

import { DateTime } from "luxon";
import { CricketScheduleMatch, getIplSchedule } from "./cricket";
import {
  countMatchesForSeason,
  getIplDb,
  getMetadata,
  insertNotificationIfMissing,
  Match,
  setMetadata,
  upsertMatch,
} from "./ipl-db";
import {
  FORCE_SYNC_SCHEDULE,
  IPL_SEASON,
  IPL_SERIES_ID,
  IPL_TIMEZONE,
  MID_INNINGS_OFFSET_MINUTES,
  POST_MATCH_OFFSET_MINUTES,
  PRE_GAME_LOCAL_HOUR,
  PRE_MATCH_MINUTES,
} from "./ipl-config";

function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

function previousNightAtTenPm(isoUtc: string): string {
  return DateTime.fromISO(isoUtc, { zone: "utc" })
    .setZone(IPL_TIMEZONE)
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

function scheduleNotifications(db: ReturnType<typeof getIplDb>, match: Match): void {
  insertNotificationIfMissing(db, match.match_id, "preview_night", previousNightAtTenPm(match.date_start));
  insertNotificationIfMissing(db, match.match_id, "pre_match", addMinutes(match.date_start, -PRE_MATCH_MINUTES));
  insertNotificationIfMissing(db, match.match_id, "mid_innings", addMinutes(match.date_start, MID_INNINGS_OFFSET_MINUTES));
  insertNotificationIfMissing(db, match.match_id, "post_match", addMinutes(match.date_start, POST_MATCH_OFFSET_MINUTES));
}

async function main(): Promise<void> {
  console.log(`[ipl-sync] Starting — ${new Date().toISOString()}`);
  const db = getIplDb();
  const syncKey = `ipl_schedule_synced_${IPL_SEASON}`;
  const alreadySynced = getMetadata(db, syncKey) === "true";
  const existingMatches = countMatchesForSeason(db, IPL_SEASON);

  if (alreadySynced && existingMatches > 0 && !FORCE_SYNC_SCHEDULE) {
    console.log(`[ipl-sync] IPL ${IPL_SEASON} schedule already stored (${existingMatches} matches), skipping`);
    return;
  }

  const matches = await getIplSchedule(IPL_SERIES_ID);
  console.log(`[ipl-sync] IPL ${IPL_SEASON}: ${matches.length} match(es) fetched`);

  for (const scheduleMatch of matches) {
    const match = toMatch(scheduleMatch);
    upsertMatch(db, match);
    scheduleNotifications(db, match);
  }

  setMetadata(db, syncKey, "true");
  console.log(`[ipl-sync] Done — ${matches.length} matches processed`);
}

main().catch((err) => {
  console.error("[ipl-sync] Fatal error:", err);
  process.exit(1);
});
