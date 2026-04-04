/**
 * checker.ts — run every 5 minutes via launchd
 *
 * Queries SQLite for due notifications, sends them to Slack,
 * marks them sent. For live race updates, reschedules the next poll.
 */

import {
  getDb,
  getDueNotifications,
  markSent,
  rescheduleNotification,
  DueNotification,
} from "./db";
import {
  getLivePositions,
  getDrivers,
  getFastestLap,
  getLatestWeather,
} from "./openf1";
import {
  sendReminderEarly,
  sendReminderFinal,
  sendSessionStart,
  sendLiveUpdate,
  sendResults,
} from "./slack";
import { handlePodcast } from "./podcast/podcastHandler";
import { REMINDER_MINUTES_FINAL, LIVE_POLL_INTERVAL_MINUTES, HEALTHCHECK_URL } from "./config";

function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

function isSessionLive(n: DueNotification): boolean {
  const now = new Date().toISOString();
  return n.date_start <= now && now <= addMinutes(n.date_end, 15);
}

async function handle(db: ReturnType<typeof getDb>, n: DueNotification): Promise<void> {
  const label = `[${n.session_key}] ${n.country_name} — ${n.session_name} (${n.type})`;
  console.log(`[checker] Processing: ${label}`);

  let sent = false;

  switch (n.type) {
    case "reminder_24h": {
      sent = await sendReminderEarly(n);
      break;
    }

    case "reminder_30m": {
      sent = await sendReminderFinal(n, REMINDER_MINUTES_FINAL);
      break;
    }

    case "session_start": {
      const weather = await getLatestWeather(n.session_key);
      sent = await sendSessionStart(n, weather);
      break;
    }

    case "live_update": {
      if (!isSessionLive(n)) {
        console.log(`[checker] Session not live, skipping live_update for ${label}`);
        markSent(db, n.id);
        return;
      }

      const [positions, drivers] = await Promise.all([
        getLivePositions(n.session_key),
        getDrivers(n.session_key),
      ]);

      if (positions.length) {
        sent = await sendLiveUpdate(n, positions, drivers);
      } else {
        console.log(`[checker] No position data yet for ${label}`);
        sent = true;
      }

      if (sent) {
        const nextPoll = addMinutes(new Date().toISOString(), LIVE_POLL_INTERVAL_MINUTES);
        const raceEnd = addMinutes(n.date_end, 15);
        if (nextPoll < raceEnd) {
          rescheduleNotification(db, n.id, nextPoll);
          console.log(`[checker] Live update rescheduled to ${nextPoll}`);
        } else {
          markSent(db, n.id);
          console.log("[checker] Race finished, no more live updates");
        }
        return;
      }
      break;
    }

    case "results": {
      const [positions, drivers, fastestLap] = await Promise.all([
        getLivePositions(n.session_key),
        getDrivers(n.session_key),
        getFastestLap(n.session_key),
      ]);
      sent = await sendResults(n, positions, drivers, fastestLap);
      break;
    }

    case "podcast": {
      sent = await handlePodcast(n);
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

  console.log("[checker] Done");
}

main().catch((err) => {
  console.error("[checker] Fatal error:", err);
  process.exit(1);
});
