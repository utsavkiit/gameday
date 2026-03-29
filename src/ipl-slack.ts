import { IncomingWebhook } from "@slack/webhook";
import { DateTime } from "luxon";
import { MatchSnapshot } from "./cricket";
import { DueNotification } from "./ipl-db";
import { IPL_SLACK_WEBHOOK_URL, IPL_TIMEZONE } from "./ipl-config";

const webhook = new IncomingWebhook(IPL_SLACK_WEBHOOK_URL);

function localTime(isoUtc: string): string {
  return DateTime.fromISO(isoUtc, { zone: "utc" })
    .setZone(IPL_TIMEZONE)
    .toFormat("EEE MMM d 'at' h:mm a ZZZZ");
}

function header(n: DueNotification): string {
  return `${n.team_1} vs ${n.team_2}`;
}

function venueLabel(n: DueNotification): string {
  return [n.venue, n.city, n.country].filter(Boolean).join(", ");
}

function lineupText(snapshot: MatchSnapshot): string {
  if (!snapshot.lineups.length) return "_Starting XIs unavailable right now._";
  return snapshot.lineups
    .map((team) => `*${team.name}*\n${team.players.slice(0, 11).join(", ")}`)
    .join("\n\n");
}

function inningsText(snapshot: MatchSnapshot): string {
  if (!snapshot.innings.length) return "_No innings score available yet._";
  return snapshot.innings
    .map((innings) => `*${innings.team}* ${innings.score} (${innings.overs} ov)`)
    .join("\n");
}

function standingsText(snapshot: MatchSnapshot): string {
  if (!snapshot.standings.length) return "_Standings unavailable from the API._";
  return snapshot.standings
    .slice(0, 6)
    .map((row, index) => {
      const played = row.played ?? "-";
      const points = row.points ?? "-";
      const nrr = row.netRunRate ?? "-";
      return `${index + 1}. ${row.team}  P:${played}  Pts:${points}  NRR:${nrr}`;
    })
    .join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function send(blocks: any[]): Promise<boolean> {
  try {
    await webhook.send({ blocks });
    return true;
  } catch (err) {
    console.error("[ipl-slack] Send failed:", err);
    return false;
  }
}

export async function sendPreviewNight(
  n: DueNotification,
  weatherSummary: string | null
): Promise<boolean> {
  const weatherLine = weatherSummary ? `\n🌦️ Likely weather: ${weatherSummary}` : "";
  return send([
    { type: "header", text: { type: "plain_text", text: "IPL Tomorrow Night Preview" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `🏏 *${header(n)}*\n` +
          `🕐 ${localTime(n.date_start)}\n` +
          `📍 ${venueLabel(n)}${weatherLine}`,
      },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: "Scheduled for 10:00 PM the night before" }] },
  ]);
}

export async function sendPreMatch(n: DueNotification, snapshot: MatchSnapshot): Promise<boolean> {
  return send([
    { type: "header", text: { type: "plain_text", text: "IPL Starting in 15 Minutes" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `🏏 *${header(n)}*\n` +
          `🕐 ${localTime(n.date_start)}\n` +
          `📍 ${venueLabel(n)}\n` +
          `🪙 ${snapshot.tossSummary ?? "Toss update unavailable yet."}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: lineupText(snapshot) },
    },
  ]);
}

export async function sendMidInnings(n: DueNotification, snapshot: MatchSnapshot): Promise<boolean> {
  return send([
    { type: "header", text: { type: "plain_text", text: "IPL Mid-Innings Update" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🏏 *${header(n)}*\n${inningsText(snapshot)}`,
      },
    },
  ]);
}

export async function sendPostMatch(n: DueNotification, snapshot: MatchSnapshot): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: "IPL Final Result" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `🏏 *${header(n)}*\n` +
          `${snapshot.result ?? "Result unavailable yet."}\n\n` +
          `${inningsText(snapshot)}`,
      },
    },
  ];

  if (snapshot.playerOfTheMatch) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `🏅 Player of the Match: *${snapshot.playerOfTheMatch}*` }],
    });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Standings*\n${standingsText(snapshot)}` },
  });

  return send(blocks);
}
