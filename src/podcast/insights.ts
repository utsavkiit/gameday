import { DriverPosition, Driver, Lap, Stint, PitStop, RaceControlMessage, Weather } from "../openf1";
import { DueNotification } from "../db";

export interface StintInfo {
  compound: string;
  lapStart: number;
  lapEnd: number;
  lapCount: number;
  tyreAge: number;
}

export interface DriverStrategy {
  driverName: string;
  acronym: string;
  team: string;
  stints: StintInfo[];
  pitLaps: number[];
  pitDurations: number[];
  scPitTiming: "before_sc" | "during_sc" | "after_sc" | "no_stop" | null;
}

export interface SafetyCarPeriod {
  type: "SC" | "VSC";
  lapStart: number;
  lapEnd: number;
}

export interface FastestLapInfo {
  driverName: string;
  acronym: string;
  lapTime: string;
  lapNumber: number;
  compound: string | null;
}

export interface RaceInsights {
  raceName: string;
  circuit: string;
  sessionType: string;
  raceDate: string;
  totalLaps: number;
  results: Array<{ position: number; driverName: string; acronym: string; team: string }>;
  fastestLap: FastestLapInfo | null;
  safetyCarPeriods: SafetyCarPeriod[];
  strategies: DriverStrategy[];
  keyInsights: string[];
  leaderPaceSamples: Array<{ lap: number; lapTime: string }>;
  weather: { preRace: string; postRace: string; rainfall: boolean } | null;
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${mins}:${secs}`;
}

function formatTemp(air: number, track: number, rainfall: number): string {
  const rain = rainfall > 0 ? ", rain" : ", no rain";
  return `${Math.round(air)}°C air / ${Math.round(track)}°C track${rain}`;
}

function detectSafetyCarPeriods(raceControl: RaceControlMessage[]): SafetyCarPeriod[] {
  const periods: SafetyCarPeriod[] = [];
  let current: SafetyCarPeriod | null = null;

  for (const msg of raceControl) {
    const lap = msg.lap_number ?? 0;
    const text = msg.message.toUpperCase();

    if (msg.category === "SafetyCar") {
      if (text.includes("DEPLOYED") || text.includes("SAFETY CAR IN")) {
        const type = text.includes("VIRTUAL") ? "VSC" : "SC";
        if (!current) current = { type, lapStart: lap, lapEnd: lap };
      } else if (text.includes("IN THIS LAP") || text.includes("WITHDRAWN") || text.includes("ENDING")) {
        if (current) {
          current.lapEnd = lap;
          periods.push(current);
          current = null;
        }
      }
    }
  }
  if (current) periods.push(current);
  return periods;
}

function isScLap(lap: number, periods: SafetyCarPeriod[]): boolean {
  return periods.some((p) => lap >= p.lapStart && lap <= p.lapEnd);
}

function scPitTiming(
  pitLaps: number[],
  periods: SafetyCarPeriod[]
): DriverStrategy["scPitTiming"] {
  if (!pitLaps.length) return "no_stop";
  if (!periods.length) return null;
  const firstSc = periods[0];
  const firstPit = pitLaps[0];
  if (firstPit < firstSc.lapStart) return "before_sc";
  if (firstPit <= firstSc.lapEnd) return "during_sc";
  return "after_sc";
}

export function buildStrategyInsights(
  positions: DriverPosition[],
  drivers: Map<number, Driver>,
  allLaps: Lap[],
  stints: Stint[],
  pitStops: PitStop[],
  raceControl: RaceControlMessage[],
  weather: Weather | null,
  weatherFirst: Weather | null,
  n: DueNotification
): RaceInsights {
  const totalLaps = allLaps.length
    ? Math.max(...allLaps.map((l) => l.lap_number))
    : 0;

  const scPeriods = detectSafetyCarPeriods(raceControl);

  // Top 10 results
  const top10 = positions.slice(0, 10).map((p) => {
    const d = drivers.get(p.driver_number);
    return {
      position: p.position,
      driverName: d?.full_name ?? `Driver #${p.driver_number}`,
      acronym: d?.name_acronym ?? "???",
      team: d?.team_name ?? "Unknown",
    };
  });

  // Fastest lap (excluding pit-out laps)
  const validLaps = allLaps.filter((l) => l.lap_duration !== null && !l.is_pit_out_lap);
  let fastestLap: FastestLapInfo | null = null;
  if (validLaps.length) {
    const fl = validLaps.reduce((best, l) => (l.lap_duration! < best.lap_duration! ? l : best));
    const d = drivers.get(fl.driver_number);
    // Find compound at that lap
    const driverStints = stints
      .filter((s) => s.driver_number === fl.driver_number)
      .sort((a, b) => a.lap_start - b.lap_start);
    const stint = driverStints.find(
      (s) => fl.lap_number >= s.lap_start && fl.lap_number <= (s.lap_end ?? totalLaps)
    );
    fastestLap = {
      driverName: d?.full_name ?? `Driver #${fl.driver_number}`,
      acronym: d?.name_acronym ?? "???",
      lapTime: formatLapTime(fl.lap_duration!),
      lapNumber: fl.lap_number,
      compound: stint?.compound ?? null,
    };
  }

  // Leader pace samples (every 5 laps, exclude SC and pit-out laps)
  const leaderNumber = positions[0]?.driver_number;
  const leaderLaps = allLaps
    .filter(
      (l) =>
        l.driver_number === leaderNumber &&
        l.lap_duration !== null &&
        !l.is_pit_out_lap &&
        !isScLap(l.lap_number, scPeriods) &&
        l.lap_number % 5 === 0
    )
    .sort((a, b) => a.lap_number - b.lap_number);

  const leaderPaceSamples = leaderLaps.map((l) => ({
    lap: l.lap_number,
    lapTime: formatLapTime(l.lap_duration!),
  }));

  // Per-driver strategy (top 10)
  const top10Numbers = new Set(positions.slice(0, 10).map((p) => p.driver_number));
  const pitsByDriver = new Map<number, PitStop[]>();
  for (const pit of pitStops) {
    if (!pitsByDriver.has(pit.driver_number)) pitsByDriver.set(pit.driver_number, []);
    pitsByDriver.get(pit.driver_number)!.push(pit);
  }
  const stintsByDriver = new Map<number, Stint[]>();
  for (const s of stints) {
    if (!stintsByDriver.has(s.driver_number)) stintsByDriver.set(s.driver_number, []);
    stintsByDriver.get(s.driver_number)!.push(s);
  }

  // Average first-stint length across field
  const firstStintLengths = [...stintsByDriver.values()]
    .map((ss) => ss.sort((a, b) => a.lap_start - b.lap_start)[0])
    .filter(Boolean)
    .map((s) => (s.lap_end ?? totalLaps) - s.lap_start + 1);
  const avgFirstStint =
    firstStintLengths.length
      ? Math.round(firstStintLengths.reduce((a, b) => a + b, 0) / firstStintLengths.length)
      : 0;

  const strategies: DriverStrategy[] = [];
  const keyInsights: string[] = [];

  for (const pos of positions.slice(0, 10)) {
    const num = pos.driver_number;
    const d = drivers.get(num);
    const name = d?.full_name ?? `Driver #${num}`;
    const acronym = d?.name_acronym ?? "???";
    const team = d?.team_name ?? "Unknown";

    const driverStints = (stintsByDriver.get(num) ?? [])
      .sort((a, b) => a.lap_start - b.lap_start)
      .map((s) => ({
        compound: s.compound,
        lapStart: s.lap_start,
        lapEnd: s.lap_end ?? totalLaps,
        lapCount: (s.lap_end ?? totalLaps) - s.lap_start + 1,
        tyreAge: s.tyre_age_at_start,
      }));

    const driverPits = (pitsByDriver.get(num) ?? []).sort((a, b) => a.lap_number - b.lap_number);
    const pitLaps = driverPits.map((p) => p.lap_number);
    const pitDurations = driverPits.map((p) => Math.round(p.pit_duration * 10) / 10);

    const timing = scPitTiming(pitLaps, scPeriods);

    strategies.push({ driverName: name, acronym, team, stints: driverStints, pitLaps, pitDurations, scPitTiming: timing });

    // Key insight: SC pit timing
    if (scPeriods.length && timing === "before_sc") {
      keyInsights.push(
        `${name} pitted on lap ${pitLaps[0]} — just before the safety car was called, losing track position`
      );
    } else if (scPeriods.length && timing === "during_sc") {
      keyInsights.push(
        `${name} pitted on lap ${pitLaps[0]} during the safety car, gaining a free pit stop`
      );
    }

    // Key insight: long/short first stint
    if (driverStints.length && avgFirstStint > 0) {
      const firstLen = driverStints[0].lapCount;
      const diff = firstLen - avgFirstStint;
      if (diff >= 4) {
        keyInsights.push(
          `${name} ran ${diff} laps longer than average (${firstLen} vs avg ${avgFirstStint}) before their first stop`
        );
      } else if (diff <= -4) {
        keyInsights.push(
          `${name} pitted ${Math.abs(diff)} laps earlier than average (${firstLen} vs avg ${avgFirstStint})`
        );
      }
    }
  }

  // SC period summary
  for (const sc of scPeriods) {
    const scMsg = raceControl.find(
      (m) => m.category === "SafetyCar" && (m.lap_number ?? 0) === sc.lapStart
    );
    const reason = scMsg?.message ?? "";
    keyInsights.unshift(
      `${sc.type} deployed lap ${sc.lapStart}, withdrawn lap ${sc.lapEnd}${reason ? ` — ${reason}` : ""}`
    );
  }

  // Fastest lap insight
  if (fastestLap) {
    const compoundNote = fastestLap.compound ? ` on ${fastestLap.compound}` : "";
    keyInsights.push(
      `Fastest lap: ${fastestLap.driverName} — ${fastestLap.lapTime} on lap ${fastestLap.lapNumber}${compoundNote}`
    );
  }

  // Weather
  let weatherSummary: RaceInsights["weather"] = null;
  if (weatherFirst && weather) {
    weatherSummary = {
      preRace: formatTemp(weatherFirst.air_temperature, weatherFirst.track_temperature, weatherFirst.rainfall),
      postRace: formatTemp(weather.air_temperature, weather.track_temperature, weather.rainfall),
      rainfall: weather.rainfall > 0 || weatherFirst.rainfall > 0,
    };
  }

  return {
    raceName: `${n.country_name} Grand Prix`,
    circuit: n.circuit_short_name,
    sessionType: n.session_type,
    raceDate: new Date(n.date_start).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    totalLaps,
    results: top10,
    fastestLap,
    safetyCarPeriods: scPeriods,
    strategies,
    keyInsights,
    leaderPaceSamples,
    weather: weatherSummary,
  };
}
