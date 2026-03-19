import { IncomingWebhook } from "@slack/webhook";
import { DateTime } from "luxon";
import { Driver, DriverPosition, Lap, Weather } from "./openf1";
import { DueNotification } from "./db";
import { SLACK_WEBHOOK_URL, TIMEZONE, SESSION_EMOJI, SESSION_DISPLAY } from "./config";

const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

const FLAG: Record<string, string> = {
  GBR: "🇬🇧", GER: "🇩🇪", NED: "🇳🇱", ESP: "🇪🇸", MON: "🇲🇨",
  MEX: "🇲🇽", AUS: "🇦🇺", FRA: "🇫🇷", FIN: "🇫🇮", DEN: "🇩🇰",
  CAN: "🇨🇦", JPN: "🇯🇵", CHN: "🇨🇳", THA: "🇹🇭", NZL: "🇳🇿",
  USA: "🇺🇸", BRA: "🇧🇷", ITA: "🇮🇹", ARG: "🇦🇷", BRN: "🇧🇭",
  SAU: "🇸🇦", UAE: "🇦🇪", SGP: "🇸🇬", HUN: "🇭🇺", BEL: "🇧🇪",
  AUT: "🇦🇹", POR: "🇵🇹", AZE: "🇦🇿",
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function localTime(isoUtc: string): string {
  return DateTime.fromISO(isoUtc, { zone: "utc" })
    .setZone(TIMEZONE)
    .toFormat("EEE MMM d 'at' h:mm a ZZZZ");
}

function meetingName(n: DueNotification): string {
  return `${n.country_name} Grand Prix`;
}

function sessionHeader(n: DueNotification): string {
  const emoji = SESSION_EMOJI[n.session_type] ?? "🏎️";
  const display = SESSION_DISPLAY[n.session_type] ?? n.session_name;
  return `${emoji} *${meetingName(n)}* — ${display}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function send(blocks: any[]): Promise<boolean> {
  try {
    await webhook.send({ blocks });
    return true;
  } catch (err) {
    console.error("[slack] Send failed:", err);
    return false;
  }
}

// ── Public senders ──────────────────────────────────────────────────────────

export async function sendReminderEarly(n: DueNotification): Promise<boolean> {
  return send([
    { type: "header", text: { type: "plain_text", text: "Formula 1 — Tomorrow" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${sessionHeader(n)}\n📍 ${n.location}, ${n.country_name}\n🕐 ${localTime(n.date_start)}`,
      },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: "Reminder sent 24 hours early" }] },
  ]);
}

export async function sendReminderFinal(n: DueNotification, minutes: number): Promise<boolean> {
  return send([
    { type: "header", text: { type: "plain_text", text: `F1 Starting in ${minutes} Minutes!` } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${sessionHeader(n)}\n🕐 ${localTime(n.date_start)}` },
    },
  ]);
}

export async function sendSessionStart(n: DueNotification, weather: Weather | null): Promise<boolean> {
  const emoji = SESSION_EMOJI[n.session_type] ?? "🏎️";
  let weatherText = "";
  if (weather) {
    const rain = weather.rainfall ? " 🌧️ Rain!" : "";
    weatherText = `\n🌡️ Air: ${weather.air_temperature}°C  Track: ${weather.track_temperature}°C${rain}`;
  }
  return send([
    { type: "header", text: { type: "plain_text", text: `${emoji} Session Starting NOW!` } },
    { type: "section", text: { type: "mrkdwn", text: `${sessionHeader(n)}${weatherText}` } },
  ]);
}

export async function sendLiveUpdate(
  n: DueNotification,
  positions: DriverPosition[],
  drivers: Map<number, Driver>
): Promise<boolean> {
  const lines = positions.slice(0, 10).map((p) => {
    const drv = drivers.get(p.driver_number);
    const name = drv?.full_name ?? drv?.name_acronym ?? `#${p.driver_number}`;
    const flag = FLAG[drv?.country_code ?? ""] ?? "";
    const medal = MEDAL[p.position] ?? `\`${p.position}.\``;
    return `${medal} ${flag} ${name}`;
  });

  if (!lines.length) return false;

  return send([
    { type: "header", text: { type: "plain_text", text: "🏎️ Live Standings" } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${sessionHeader(n)}\n\n${lines.join("\n")}` },
    },
  ]);
}

export async function sendResults(
  n: DueNotification,
  positions: DriverPosition[],
  drivers: Map<number, Driver>,
  fastestLap: Lap | null
): Promise<boolean> {
  const limit = ["Race", "Sprint"].includes(n.session_type) ? 10 : 5;
  const lines = positions.slice(0, limit).map((p) => {
    const drv = drivers.get(p.driver_number);
    const name = drv?.full_name ?? drv?.name_acronym ?? `#${p.driver_number}`;
    const flag = FLAG[drv?.country_code ?? ""] ?? "";
    const team = drv?.team_name ?? "";
    const medal = MEDAL[p.position] ?? `\`${p.position}.\``;
    return `${medal} ${flag} ${name}  _${team}_`;
  });

  const body = lines.length ? lines.join("\n") : "_No position data available yet._";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: "🏁 Session Results" } },
    { type: "section", text: { type: "mrkdwn", text: `${sessionHeader(n)}\n\n${body}` } },
  ];

  if (fastestLap?.lap_duration) {
    const mins = Math.floor(fastestLap.lap_duration / 60);
    const secs = (fastestLap.lap_duration % 60).toFixed(3).padStart(6, "0");
    const drv = drivers.get(fastestLap.driver_number);
    const name = drv?.name_acronym ?? `#${fastestLap.driver_number}`;
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `⚡ Fastest Lap: *${name}* — ${mins}:${secs}` }],
    });
  }

  return send(blocks);
}

export async function sendScheduleDigest(sessions: DueNotification[]): Promise<boolean> {
  const lines: string[] = [];
  let lastCountry = "";

  for (const s of sessions.slice(0, 20)) {
    const country = s.country_name;
    if (country !== lastCountry) {
      lines.push(`\n*${country} Grand Prix*`);
      lastCountry = country;
    }
    const emoji = SESSION_EMOJI[s.session_type] ?? "•";
    const display = SESSION_DISPLAY[s.session_type] ?? s.session_name;
    lines.push(`  ${emoji} ${display} — ${localTime(s.date_start)}`);
  }

  return send([
    { type: "header", text: { type: "plain_text", text: "🗓️ Upcoming F1 Schedule" } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
  ]);
}
