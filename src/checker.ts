/**
 * checker.ts — run every 5 minutes via launchd
 *
 * Queries SQLite for due IPL notifications, sends them to Slack,
 * marks them sent, and retries when live match data is not ready yet.
 */

import {
  getDb,
  getDueNotifications,
  markSent,
  rescheduleNotification,
  DueNotification,
} from "./db";
import { getMatchSnapshot } from "./cricket";
import { getForecastSummary } from "./weather";
import {
  sendMidInnings,
  sendPostMatch,
  sendPreMatch,
  sendPreviewNight,
} from "./slack";
import { HEALTHCHECK_URL, RETRY_INTERVAL_MINUTES } from "./config";

function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

function isMatchWindowOpen(n: DueNotification): boolean {
  const now = new Date().toISOString();
  return n.date_start <= now && now <= addMinutes(n.date_end, 180);
}

function retryOrClose(
  db: ReturnType<typeof getDb>,
  n: DueNotification,
  latestAllowedAt: string
): void {
  const nextAttempt = addMinutes(new Date().toISOString(), RETRY_INTERVAL_MINUTES);
  if (nextAttempt <= latestAllowedAt) {
    rescheduleNotification(db, n.id, nextAttempt);
    console.log(`[checker] Rescheduled ${n.type} for ${n.match_id} to ${nextAttempt}`);
    return;
  }
  markSent(db, n.id);
  console.log(`[checker] Expired ${n.type} for ${n.match_id}`);
}

function parseOvers(overs: string | undefined): number {
  if (!overs) return 0;
  const value = parseFloat(overs);
  return Number.isFinite(value) ? value : 0;
}

function isMidInningsSnapshot(snapshot: Awaited<ReturnType<typeof getMatchSnapshot>>): boolean {
  if (!snapshot || snapshot.matchEnded || !snapshot.innings.length) return false;

  const status = (snapshot.status || snapshot.result || "").toLowerCase();
  const firstInningsOvers = parseOvers(snapshot.innings[0]?.overs);
  const inningsBreakInStatus =
    /innings break|end of innings|target|need \d+|require \d+/i.test(status);
  const secondInningsStarted = snapshot.innings.length > 1;

  return !secondInningsStarted && (inningsBreakInStatus || firstInningsOvers >= 19);
}

async function handle(db: ReturnType<typeof getDb>, n: DueNotification): Promise<void> {
  const label = `[${n.match_id}] ${n.team_1} vs ${n.team_2} (${n.type})`;
  console.log(`[checker] Processing: ${label}`);

  let sent = false;

  switch (n.type) {
    case "preview_night": {
      const weather = await getForecastSummary(venueLabel(n), n.date_start);
      sent = await sendPreviewNight(n, weather);
      break;
    }

    case "pre_match": {
      const snapshot = await getMatchSnapshot(n.match_id, n.series_id);
      if (!snapshot || (!snapshot.tossSummary && !snapshot.lineups.length)) {
        retryOrClose(db, n, addMinutes(n.date_start, 20));
        return;
      }
      sent = await sendPreMatch(n, snapshot);
      break;
    }

    case "mid_innings": {
      if (!isMatchWindowOpen(n)) {
        console.log(`[checker] Match window closed, skipping mid-innings for ${label}`);
        markSent(db, n.id);
        return;
      }

      const snapshot = await getMatchSnapshot(n.match_id, n.series_id);

      if (!snapshot || !isMidInningsSnapshot(snapshot)) {
        retryOrClose(db, n, addMinutes(n.date_end, 90));
        return;
      }
      sent = await sendMidInnings(n, snapshot);
      break;
    }

    case "post_match": {
      const snapshot = await getMatchSnapshot(n.match_id, n.series_id);
      if (!snapshot || !snapshot.matchEnded) {
        retryOrClose(db, n, addMinutes(n.date_end, 240));
        return;
      }
      sent = await sendPostMatch(n, snapshot);
      break;
    }
  }

  if (sent) {
    markSent(db, n.id);
    console.log(`[checker] Sent and marked: ${label}`);
  } else {
    console.error(`[checker] Failed to send: ${label} — will retry next cycle`);
  }
}

function venueLabel(n: DueNotification): string {
  return [n.venue, n.city, n.country].filter(Boolean).join(", ");
}

async function main(): Promise<void> {
  console.log(`[checker] Starting — ${new Date().toISOString()}`);
  const db = getDb();

  const due = getDueNotifications(db);
  console.log(`[checker] ${due.length} notification(s) due`);

  for (const n of due) {
    await handle(db, n);
  }

  if (HEALTHCHECK_URL) {
    await fetch(HEALTHCHECK_URL).catch((err) =>
      console.error("[checker] Healthcheck ping failed:", err)
    );
  }

  console.log(`[checker] Done`);
}

main().catch((err) => {
  console.error("[checker] Fatal error:", err);
  process.exit(1);
});
