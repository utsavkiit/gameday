import { OPEN_METEO_BASE_URL, OPEN_METEO_GEOCODING_URL } from "./config";

interface GeoResult {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "GameDayBot/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[weather] Request failed: ${url} — ${error}`);
    return null;
  }
}

async function geocode(query: string): Promise<GeoResult | null> {
  const url = new URL(`${OPEN_METEO_GEOCODING_URL}/search`);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await getJson<Record<string, unknown>>(url.toString());
  const result = asArray<Record<string, unknown>>(response?.results)[0];
  if (!result) return null;

  return {
    latitude: typeof result.latitude === "number" ? result.latitude : 0,
    longitude: typeof result.longitude === "number" ? result.longitude : 0,
    name: typeof result.name === "string" ? result.name : query,
    country: typeof result.country === "string" ? result.country : undefined,
  };
}

function nearestIndex(targetIso: string, timestamps: string[]): number {
  const target = new Date(targetIso).getTime();
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  timestamps.forEach((timestamp, index) => {
    const delta = Math.abs(new Date(timestamp).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export async function getForecastSummary(location: string, isoStart: string): Promise<string | null> {
  const searchTerms = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  let geo: GeoResult | null = null;
  for (const term of searchTerms) {
    geo = await geocode(term);
    if (geo) break;
  }

  if (!geo) return null;

  const url = new URL(`${OPEN_METEO_BASE_URL}/forecast`);
  url.searchParams.set("latitude", String(geo.latitude));
  url.searchParams.set("longitude", String(geo.longitude));
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_days", "7");

  const response = await getJson<Record<string, unknown>>(url.toString());
  const hourly = asObject(response?.hourly);
  const times = asArray<string>(hourly.time);
  const temps = asArray<number>(hourly.temperature_2m);
  const rain = asArray<number>(hourly.precipitation_probability);
  if (!times.length || !temps.length) return null;

  const index = nearestIndex(isoStart, times);
  const temp = temps[index];
  const rainChance = rain[index];
  const rainText =
    typeof rainChance === "number" ? `, ${Math.round(rainChance)}% rain chance` : "";

  return `${Math.round(temp)}C${rainText}`;
}
