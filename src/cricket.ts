import { CRICKETDATA_API_KEY, CRICKETDATA_BASE_URL, IPL_SEASON } from "./ipl-config";

export interface CricketScheduleMatch {
  id: string;
  title: string;
  team1: string;
  team2: string;
  dateTimeGmt: string;
  dateEndGmt: string;
  venue: string;
  city: string;
  country: string;
  status: string;
}

export interface TeamLineup {
  name: string;
  players: string[];
}

export interface InningsScore {
  team: string;
  score: string;
  overs: string;
}

export interface StandingRow {
  team: string;
  played: number | null;
  points: number | null;
  netRunRate: string | null;
}

export interface MatchSnapshot {
  matchStarted: boolean;
  matchEnded: boolean;
  status: string;
  tossWinner: string | null;
  tossDecision: string | null;
  tossSummary: string | null;
  venue: string | null;
  lineups: TeamLineup[];
  innings: InningsScore[];
  playerOfTheMatch: string | null;
  result: string | null;
  standings: StandingRow[];
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? (value as JsonObject) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function get<T = unknown>(endpoint: string, params: Record<string, string | number>): Promise<T | null> {
  const url = new URL(`${CRICKETDATA_BASE_URL}/${endpoint}`);
  url.searchParams.set("apikey", CRICKETDATA_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const safeUrl = new URL(url.toString());
  safeUrl.searchParams.set("apikey", "[redacted]");
  console.log(`[cricket] Requesting ${endpoint}: ${safeUrl.toString()}`);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": "GameDayBot/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = (await response.json()) as { status?: string; reason?: string } & T;
      if (json.status === "failure") {
        console.error(`[cricket] API failure on ${endpoint}: ${json.reason ?? "unknown reason"}`);
        return null;
      }
      console.log(`[cricket] Success on ${endpoint}`);
      return json as T;
    } catch (error) {
      console.error(`[cricket] Attempt ${attempt + 1} failed on ${endpoint}: ${error}`);
      if (attempt === 2) {
        console.error(`[cricket] Failed after 3 attempts: ${url.toString()} — ${error}`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }

  return null;
}

function parseTeams(match: JsonObject): [string, string] {
  const teams = asArray<string>(match.teams);
  const fallbackTeams = asArray<JsonObject>(match.teamInfo).map((team) => asString(team.name));
  const values = teams.length ? teams : fallbackTeams;
  return [values[0] ?? "TBD", values[1] ?? "TBD"];
}

function parseVenue(match: JsonObject): { venue: string; city: string; country: string } {
  const venue = asString(match.venue);
  const venueInfo = asObject(match.venueInfo);
  const city = asString(match.city) || asString(venueInfo.city);
  const country = asString(match.country) || asString(venueInfo.country);
  return { venue: venue || asString(venueInfo.name) || "Venue TBD", city, country };
}

function guessMatchEnd(dateStart: string): string {
  return new Date(new Date(dateStart).getTime() + 4 * 60 * 60 * 1000).toISOString();
}

function parseScheduleMatch(match: unknown): CricketScheduleMatch | null {
  const source = asObject(match);
  const id = asString(source.id);
  const dateTimeGmt = asString(source.dateTimeGMT) || asString(source.date);
  if (!id || !dateTimeGmt) return null;

  const [team1, team2] = parseTeams(source);
  const { venue, city, country } = parseVenue(source);
  const title =
    asString(source.name) ||
    asString(source.matchTitle) ||
    `${team1} vs ${team2}`;

  return {
    id,
    title,
    team1,
    team2,
    dateTimeGmt,
    dateEndGmt: asString(source.dateEndGMT) || guessMatchEnd(dateTimeGmt),
    venue,
    city,
    country,
    status: asString(source.status) || "scheduled",
  };
}

function extractSeriesData(response: unknown): JsonObject {
  const root = asObject(response);
  return asObject(root.data);
}

export async function getIplSchedule(seriesId: string): Promise<CricketScheduleMatch[]> {
  const response = await get("series_info", { id: seriesId });
  const data = extractSeriesData(response);
  const matchList = asArray(data.matchList);
  const matches = asArray(data.matches);
  const rawMatches = matchList.length ? matchList : matches;

  return rawMatches
    .map(parseScheduleMatch)
    .filter((match): match is CricketScheduleMatch => Boolean(match))
    .filter((match) => new Date(match.dateTimeGmt).getUTCFullYear() === IPL_SEASON)
    .sort((a, b) => a.dateTimeGmt.localeCompare(b.dateTimeGmt));
}

function parseLineups(raw: unknown): TeamLineup[] {
  return asArray<JsonObject>(raw).map((team) => {
    const players = asArray<unknown>(team.players)
      .map((player) => {
        const playerObj = asObject(player);
        return (
          asString(playerObj.name) ||
          asString(playerObj.fullName) ||
          asString(playerObj.playerName) ||
          asString(player)
        );
      })
      .filter(Boolean);

    return {
      name: asString(team.name) || "Team",
      players,
    };
  }).filter((team) => team.players.length > 0);
}

function parseInnings(raw: unknown): InningsScore[] {
  return asArray<JsonObject>(raw).map((innings) => {
    const runs = asString(innings.r) || asString(innings.runs);
    const wickets = asString(innings.w) || asString(innings.wickets);
    const overs = asString(innings.o) || asString(innings.overs);
    return {
      team: asString(innings.battingTeam) || asString(innings.name) || "Innings",
      score: wickets ? `${runs}/${wickets}` : runs || "n/a",
      overs: overs || "n/a",
    };
  }).filter((innings) => innings.score !== "n/a");
}

function parseStandings(raw: unknown): StandingRow[] {
  return asArray<JsonObject>(raw).map((row) => ({
    team: asString(row.teamName) || asString(row.team) || asString(row.name),
    played: asNumber(row.matches) ?? asNumber(row.played),
    points: asNumber(row.points),
    netRunRate: asString(row.nrr) || asString(row.netRunRate) || null,
  })).filter((row) => row.team);
}

function combineSnapshot(
  infoResponse: unknown,
  scorecardResponse: unknown,
  squadResponse: unknown,
  standings: StandingRow[]
): MatchSnapshot {
  const infoRoot = asObject(infoResponse);
  const scorecardRoot = asObject(scorecardResponse);
  const squadRoot = asObject(squadResponse);

  const info = asObject(infoRoot.data);
  const scorecard = asObject(scorecardRoot.data);
  const squadData = squadRoot.data;

  const score = asArray<JsonObject>(info.score).length
    ? asArray<JsonObject>(info.score)
    : asArray<JsonObject>(scorecard.score);
  const innings = parseInnings(score.length ? score : scorecard.scorecard);
  const lineups = parseLineups(
    asArray(squadData).length
      ? squadData
      : asArray(asObject(squadData).squads).length
        ? asObject(squadData).squads
      : asArray(scorecard.teamInfo).map((team) => ({
          name: asString(asObject(team).name),
          players: asArray(asObject(team).players),
        }))
  );

  const tossWinner =
    asString(info.tossWinner) ||
    asString(scorecard.tossWinner);
  const tossDecision =
    asString(info.tossChoice) ||
    asString(info.tossDecision) ||
    asString(scorecard.tossChoice);
  const tossSummary =
    asString(info.tossString) ||
    asString(scorecard.tossString) ||
    (tossWinner ? `${tossWinner} won the toss${tossDecision ? ` and chose to ${tossDecision}` : ""}.` : null);

  const result =
    asString(info.status) ||
    asString(scorecard.status) ||
    asString(info.matchStatus) ||
    null;

  return {
    matchStarted: asBoolean(info.matchStarted) || /innings|break|result|won|need/i.test(result ?? ""),
    matchEnded: asBoolean(info.matchEnded) || /won|match tied|no result|abandoned/i.test(result ?? ""),
    status: result ?? "Status unavailable",
    tossWinner: tossWinner || null,
    tossDecision: tossDecision || null,
    tossSummary,
    venue: asString(info.venue) || asString(scorecard.venue) || null,
    lineups,
    innings,
    playerOfTheMatch:
      asString(info.playerOfTheMatch) ||
      asString(scorecard.playerOfTheMatch) ||
      asString(scorecard.player_of_the_match) ||
      null,
    result,
    standings,
  };
}

export interface SnapshotOptions {
  squad?: boolean;
  series?: boolean;
  scorecard?: boolean;
}

export async function getMatchSnapshot(
  matchId: string,
  seriesId: string,
  options: SnapshotOptions = {}
): Promise<MatchSnapshot | null> {
  const {
    squad: needSquad = true,
    series: needSeries = true,
    scorecard: needScorecard = false,
  } = options;

  const [info, scorecard, squad, standingsResponse] = await Promise.all([
    get("match_info", { id: matchId }),
    needScorecard ? get("match_scorecard", { id: matchId }) : Promise.resolve(null),
    needSquad ? get("match_squad", { id: matchId }) : Promise.resolve(null),
    needSeries ? get("series_info", { id: seriesId }) : Promise.resolve(null),
  ]);

  if (!info) {
    return null;
  }

  const seriesData = needSeries ? extractSeriesData(standingsResponse) : {};
  const standings = parseStandings(
    seriesData.pointsTable ??
      seriesData.points_table ??
      seriesData.standings ??
      seriesData.table
  );

  return combineSnapshot(info, scorecard, squad, standings);
}
