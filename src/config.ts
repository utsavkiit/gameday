import * as fs from "fs";
import * as path from "path";

// Load .env from project root
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

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required env var ${key} is not set. Copy .env.example to .env.`);
  return val;
}

export const SLACK_WEBHOOK_URL = require_env("SLACK_WEBHOOK_URL");
export const TIMEZONE = process.env.TIMEZONE ?? "America/New_York";
export const REMINDER_HOURS_EARLY = parseInt(process.env.REMINDER_HOURS_EARLY ?? "24");
export const REMINDER_MINUTES_FINAL = parseInt(process.env.REMINDER_MINUTES_FINAL ?? "30");
export const RESULTS_DELAY_MINUTES = 45;
export const LIVE_POLL_INTERVAL_MINUTES = 5;
export const GRACE_PERIOD_HOURS = 2;

const raw = process.env.SESSION_FILTER ?? "";
export const SESSION_FILTER: string[] = raw
  ? raw.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

export const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL ?? "";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";
export const TTS_URL = process.env.TTS_URL ?? "http://localhost:8080";
export const TTS_MODEL = process.env.TTS_MODEL ?? "mlx-community/Kokoro-82M-bf16";
export const TTS_VOICE = process.env.TTS_VOICE ?? "af_heart";
export const PODCAST_SERVE_URL = process.env.PODCAST_SERVE_URL ?? "http://100.104.18.70:8888";
export const PODCAST_OUTPUT_DIR = process.env.PODCAST_OUTPUT_DIR ?? "~/VibeBot-Podcasts";
export const PODCAST_DELAY_MINUTES = parseInt(process.env.PODCAST_DELAY_MINUTES ?? "90");

export const OPENF1_BASE_URL = "https://api.openf1.org/v1";
export const DB_PATH = path.resolve(__dirname, "../f1bot.sqlite");

export const SESSION_EMOJI: Record<string, string> = {
  Practice: "🔧",
  Qualifying: "⏱️",
  "Sprint Qualifying": "⚡",
  Sprint: "⚡",
  Race: "🏁",
};

export const SESSION_DISPLAY: Record<string, string> = {
  Practice: "Practice",
  Qualifying: "Qualifying",
  "Sprint Qualifying": "Sprint Qualifying",
  Sprint: "Sprint Race",
  Race: "Grand Prix",
};
