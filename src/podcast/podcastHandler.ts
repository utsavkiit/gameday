import {
  getLivePositions,
  getDrivers,
  getAllLaps,
  getStints,
  getPitStops,
  getRaceControl,
  getLatestWeather,
} from "../openf1";
import { DueNotification } from "../db";
import {
  TTS_URL,
  TTS_MODEL,
  TTS_VOICE,
  PODCAST_OUTPUT_DIR,
  PODCAST_SERVE_URL,
} from "../config";
import { buildStrategyInsights } from "./insights";
import { generateRaceScript } from "./scriptWriter";
import { generateAudio } from "./ttsClient";
import { sendPodcastReady, sendPodcastScriptOnly } from "../slack";

export async function handlePodcast(n: DueNotification): Promise<boolean> {
  if (!["Race", "Sprint"].includes(n.session_type)) {
    console.log(`[podcast] Skipping non-race session type: ${n.session_type}`);
    return true; // mark sent, don't retry
  }

  console.log(`[podcast] Fetching race data for session ${n.session_key}…`);

  const [positions, drivers, allLaps, stints, pitStops, raceControl, weatherAll] =
    await Promise.all([
      getLivePositions(n.session_key),
      getDrivers(n.session_key),
      getAllLaps(n.session_key),
      getStints(n.session_key),
      getPitStops(n.session_key),
      getRaceControl(n.session_key),
      // Fetch raw weather array separately so we can get first + last entries
      (async () => {
        const { OPENF1_BASE_URL } = await import("../config");
        const resp = await fetch(`${OPENF1_BASE_URL}/weather?session_key=${n.session_key}`);
        if (!resp.ok) return [] as Awaited<ReturnType<typeof getLatestWeather>>[];
        return (await resp.json()) as Awaited<ReturnType<typeof getLatestWeather>>[];
      })(),
    ]);

  if (!positions.length) {
    console.warn(`[podcast] No position data for session ${n.session_key} — will retry`);
    return false;
  }

  const weatherFirst = Array.isArray(weatherAll) && weatherAll.length ? weatherAll[0] : null;
  const weatherLast = Array.isArray(weatherAll) && weatherAll.length ? weatherAll[weatherAll.length - 1] : null;

  console.log(`[podcast] Building strategy insights…`);
  const insights = buildStrategyInsights(
    positions,
    drivers,
    allLaps,
    stints,
    pitStops,
    raceControl,
    weatherLast,
    weatherFirst,
    n
  );

  console.log(`[podcast] Generating script via Ollama…`);
  const script = await generateRaceScript(insights);

  const raceDate = new Date(n.date_start).toISOString().slice(0, 10);
  const filename = `${raceDate}-f1-${n.circuit_short_name.toLowerCase().replace(/\s+/g, "-")}.mp3`;

  let audioUrl: string | null = null;
  try {
    console.log(`[podcast] Generating audio: ${filename}…`);
    const audioPath = await generateAudio(script, filename, {
      ttsUrl: TTS_URL,
      model: TTS_MODEL,
      voice: TTS_VOICE,
      outputDir: PODCAST_OUTPUT_DIR,
    });
    const fileSlug = audioPath.split("/").pop()!;
    audioUrl = `${PODCAST_SERVE_URL}/${fileSlug}`;
    console.log(`[podcast] Audio ready: ${audioUrl}`);
  } catch (err) {
    console.warn(`[podcast] TTS failed — posting script only. ${(err as Error).message}`);
  }

  return audioUrl
    ? sendPodcastReady(n, audioUrl)
    : sendPodcastScriptOnly(n, script);
}
