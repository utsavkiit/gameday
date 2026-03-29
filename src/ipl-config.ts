import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required env var ${key} is not set. Copy .env.example to .env.`);
  return val;
}

export const IPL_SLACK_WEBHOOK_URL =
  process.env.IPL_SLACK_WEBHOOK_URL ?? requireEnv("SLACK_WEBHOOK_URL");
export const IPL_TIMEZONE = process.env.IPL_TIMEZONE ?? process.env.TIMEZONE ?? "America/New_York";
export const CRICKETDATA_API_KEY = requireEnv("CRICKETDATA_API_KEY");
export const CRICKETDATA_BASE_URL = process.env.CRICKETDATA_BASE_URL ?? "https://api.cricapi.com/v1";
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1";
export const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1";
export const IPL_SEASON = parseInt(process.env.IPL_SEASON ?? "2025", 10);
export const IPL_SERIES_ID =
  process.env.IPL_SERIES_ID ?? "d5a498c8-7596-4b93-8ab0-e0efc3345312";
export const PRE_GAME_LOCAL_HOUR = parseInt(process.env.PRE_GAME_LOCAL_HOUR ?? "22", 10);
export const PRE_MATCH_MINUTES = parseInt(process.env.PRE_MATCH_MINUTES ?? "15", 10);
export const MID_INNINGS_OFFSET_MINUTES = parseInt(
  process.env.MID_INNINGS_OFFSET_MINUTES ?? "125",
  10
);
export const POST_MATCH_OFFSET_MINUTES = parseInt(
  process.env.POST_MATCH_OFFSET_MINUTES ?? "250",
  10
);
export const RETRY_INTERVAL_MINUTES = parseInt(process.env.RETRY_INTERVAL_MINUTES ?? "5", 10);
export const IPL_GRACE_PERIOD_HOURS = parseInt(process.env.IPL_GRACE_PERIOD_HOURS ?? "12", 10);
export const FORCE_SYNC_SCHEDULE = process.env.FORCE_SYNC_SCHEDULE === "true";
export const IPL_DB_PATH = path.resolve(__dirname, "../iplbot.sqlite");
