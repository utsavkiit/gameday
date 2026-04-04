/**
 * test-api.ts — diagnostic script to check what each CricAPI endpoint returns
 * Usage: npm run build && node --experimental-sqlite dist/test-api.js
 */

import { CRICKETDATA_API_KEY, CRICKETDATA_BASE_URL } from "./ipl-config";

const MATCH_ID = process.argv[2] ?? "cacf2d34-41b8-41dd-91ed-5183d880084c";
const SERIES_ID = process.argv[3] ?? "d5a498c8-7596-4b93-8ab0-e0efc3345312";

async function rawGet(endpoint: string, id: string): Promise<unknown> {
  const url = new URL(`${CRICKETDATA_BASE_URL}/${endpoint}`);
  url.searchParams.set("apikey", CRICKETDATA_API_KEY);
  url.searchParams.set("id", id);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    return await res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

function summarise(endpoint: string, response: unknown): void {
  const r = response as Record<string, unknown>;
  const status = r?.status ?? "unknown";
  const hasData = r?.data !== undefined && r?.data !== null;
  const dataKeys = hasData && typeof r.data === "object" ? Object.keys(r.data as object) : [];

  console.log(`\n── ${endpoint} ──`);
  console.log(`  status : ${status}`);

  if (status === "failure") {
    console.log(`  reason : ${r?.reason ?? "none"}`);
    return;
  }

  if (!hasData) {
    console.log("  data   : (missing)");
    return;
  }

  console.log(`  data keys: ${dataKeys.join(", ") || "(empty object)"}`);

  // Highlight the specific fields we care about
  const d = r.data as Record<string, unknown>;
  if (endpoint === "match_info" || endpoint === "match_scorecard") {
    console.log(`  matchStarted : ${d.matchStarted}`);
    console.log(`  matchEnded   : ${d.matchEnded}`);
    console.log(`  tossWinner   : ${d.tossWinner ?? d.toss_winner ?? "(none)"}`);
    const score = Array.isArray(d.score) ? d.score : Array.isArray(d.scorecard) ? d.scorecard : [];
    console.log(`  innings count: ${score.length}`);
    console.log(`  status       : ${d.status ?? "(none)"}`);
  }
  if (endpoint === "match_squad") {
    const squads = Array.isArray(d.squads) ? d.squads : [];
    console.log(`  squads count : ${squads.length}`);
    for (const s of squads as Array<Record<string, unknown>>) {
      const players = Array.isArray(s.players) ? s.players : [];
      console.log(`    ${s.name ?? "?"}: ${players.length} player(s)`);
    }
  }
  if (endpoint === "series_info") {
    const matches = Array.isArray(d.matchList) ? d.matchList : Array.isArray(d.matches) ? d.matches : [];
    const table = d.pointsTable ?? d.points_table ?? d.standings ?? d.table;
    console.log(`  matches in series : ${matches.length}`);
    console.log(`  pointsTable found : ${table !== undefined}`);
  }
}

async function main(): Promise<void> {
  console.log(`CricAPI base : ${CRICKETDATA_BASE_URL}`);
  console.log(`Match ID     : ${MATCH_ID}`);
  console.log(`Series ID    : ${SERIES_ID}`);

  const [info, scorecard, squad, series] = await Promise.all([
    rawGet("match_info", MATCH_ID),
    rawGet("match_scorecard", MATCH_ID),
    rawGet("match_squad", MATCH_ID),
    rawGet("series_info", SERIES_ID),
  ]);

  summarise("match_info", info);
  summarise("match_scorecard", scorecard);
  summarise("match_squad", squad);
  summarise("series_info", series);

  console.log("\n── raw match_scorecard response ──");
  console.log(JSON.stringify(scorecard, null, 2));
  console.log("\n── raw match_squad response ──");
  console.log(JSON.stringify(squad, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
