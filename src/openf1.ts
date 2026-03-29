import { OPENF1_BASE_URL } from "./config";

export interface OpenF1Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  location: string;
  country_name: string;
  country_code: string;
  circuit_short_name: string;
  year: number;
}

export interface DriverPosition {
  driver_number: number;
  position: number;
  date: string;
}

export interface Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  country_code: string;
}

export interface Lap {
  driver_number: number;
  lap_duration: number | null;
  lap_number: number;
}

export interface Weather {
  air_temperature: number;
  track_temperature: number;
  rainfall: number;
}

async function get<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const url = new URL(`${OPENF1_BASE_URL}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": "F1SlackBot/2.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as T[];
    } catch (err) {
      if (attempt === 2) {
        console.error(`[openf1] Failed after 3 attempts: ${url} — ${err}`);
        return [];
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  return [];
}

export async function getSessions(year: number): Promise<OpenF1Session[]> {
  const data = await get<OpenF1Session>("sessions", { year });
  return data
    .filter((s) => s.date_start)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));
}

export async function getUpcomingSessions(year: number): Promise<OpenF1Session[]> {
  const now = new Date().toISOString();
  const all = await getSessions(year);
  return all.filter((s) => (s.date_end || s.date_start) >= now);
}

export async function getLivePositions(session_key: number): Promise<DriverPosition[]> {
  const data = await get<DriverPosition>("position", { session_key });
  if (!data.length) return [];

  const latest = new Map<number, DriverPosition>();
  for (const entry of data) {
    const existing = latest.get(entry.driver_number);
    if (!existing || entry.date > existing.date) {
      latest.set(entry.driver_number, entry);
    }
  }
  return [...latest.values()].sort((a, b) => a.position - b.position);
}

export async function getDrivers(session_key: number): Promise<Map<number, Driver>> {
  const data = await get<Driver>("drivers", { session_key });
  return new Map(data.map((d) => [d.driver_number, d]));
}

export async function getFastestLap(session_key: number): Promise<Lap | null> {
  const data = await get<Lap>("laps", { session_key });
  const valid = data.filter((l) => l.lap_duration !== null);
  if (!valid.length) return null;
  return valid.reduce((best, l) => (l.lap_duration! < best.lap_duration! ? l : best));
}

export async function getLatestWeather(session_key: number): Promise<Weather | null> {
  const data = await get<Weather>("weather", { session_key });
  return data.length ? data[data.length - 1] : null;
}
