/**
 * ipl-checker.ts — run every 5 minutes via launchd
 */

import { getMatchSnapshot } from "./cricket";
import {
  DueNotification,
  getDueNotifications,
  getIplDb,
  markSent,
  rescheduleNotification,
} from "./ipl-db";
import { RETRY_INTERVAL_MINUTES } from "./ipl-config";
import { HEALTHCHECK_URL } from "./config";
import {
  sendMidInnings,
  sendPostMatch,
  sendPreMatch,
  sendPreviewNight,
} from "./ipl-slack";
import { getForecastSummary } from "./weather";

function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

function venueLabel(n: DueNotification): string {
  return [n.venue, n.city, n.country].filter(Boolean).join(", ");
}

function retryOrClose(
  db: ReturnType<typeof getIplDb>,
  n: DueNotification,
  latestAllowedAt: string
): void {
  const nextAttempt = addMinutes(new Date().toISOString(), RETRY_INTERVAL_MINUTES);
  if (nextAttempt <= latestAllowedAt) {
    rescheduleNotification(db, n.id, nextAttempt);
    console.log(`[ipl-checker] Rescheduled ${n.type} for ${n.match_id} to ${nextAttempt}`);
    return;
  }
  markSent(db, n.id);
  console.log(`[ipl-checker] Expired ${n.type} for ${n.match_id}`);
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

async function handle(db: ReturnType<typeof getIplDb>, n: DueNotification): Promise<void> {
  const label = `[${n.match_id}] ${n.team_1} vs ${n.team_2} (${n.type})`;
  console.log(`[ipl-checker] Processing: ${label}`);

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
    console.log(`[ipl-checker] Sent and marked: ${label}`);
  } else {
    console.error(`[ipl-checker] Failed to send: ${label} — will retry next cycle`);
  }
}

async function main(): Promise<void> {
  console.log(`[ipl-checker] Starting — ${new Date().toISOString()}`);
  const db = getIplDb();
  const due = getDueNotifications(db);
  console.log(`[ipl-checker] ${due.length} notification(s) due`);

  for (const n of due) {
    await handle(db, n);
  }

  if (HEALTHCHECK_URL) {
    await fetch(HEALTHCHECK_URL).catch((err) =>
      console.error("[ipl-checker] Healthcheck ping failed:", err)
    );
  }

  console.log("[ipl-checker] Done");
}

main().catch((err) => {
  console.error("[ipl-checker] Fatal error:", err);
  process.exit(1);
});
