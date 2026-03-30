import { OLLAMA_URL, OLLAMA_MODEL } from "../config";
import { RaceInsights } from "./insights";

function formatInsightsAsText(insights: RaceInsights): string {
  const lines: string[] = [];

  lines.push(`Race: ${insights.raceName} — ${insights.sessionType}, ${insights.raceDate}`);
  lines.push(`Circuit: ${insights.circuit}`);
  lines.push(`Total laps: ${insights.totalLaps}`);
  lines.push("");

  lines.push("RESULT (top 10):");
  for (const r of insights.results) {
    lines.push(`${r.position}. ${r.driverName} (${r.acronym}, ${r.team})`);
  }
  lines.push("");

  if (insights.fastestLap) {
    const fl = insights.fastestLap;
    const comp = fl.compound ? `, ${fl.compound} tyre` : "";
    lines.push(`FASTEST LAP: ${fl.driverName} (${fl.acronym}) — ${fl.lapTime} on lap ${fl.lapNumber}${comp}`);
    lines.push("");
  }

  if (insights.safetyCarPeriods.length) {
    lines.push("SAFETY CAR / VSC:");
    for (const sc of insights.safetyCarPeriods) {
      lines.push(`  ${sc.type}: deployed lap ${sc.lapStart}, withdrawn lap ${sc.lapEnd}`);
    }
    lines.push("");
  }

  if (insights.keyInsights.length) {
    lines.push("KEY STRATEGIC INSIGHTS:");
    for (const ki of insights.keyInsights) {
      lines.push(`  - ${ki}`);
    }
    lines.push("");
  }

  if (insights.strategies.length) {
    lines.push("TYRE STRATEGY (top 10):");
    for (const s of insights.strategies) {
      const stintStr = s.stints
        .map((st) => `${st.compound} laps ${st.lapStart}–${st.lapEnd} (${st.tyreAge > 0 ? `${st.tyreAge} laps old` : "new"})`)
        .join(" → ");
      const stops = s.pitLaps.length;
      lines.push(`  ${s.driverName}: ${stintStr} — ${stops} stop${stops !== 1 ? "s" : ""}`);
    }
    lines.push("");

    lines.push("PIT STOP TIMES:");
    for (const s of insights.strategies) {
      if (!s.pitLaps.length) continue;
      const stops = s.pitLaps.map((lap, i) => `lap ${lap} — ${s.pitDurations[i]}s`).join(", ");
      lines.push(`  ${s.driverName}: ${stops}`);
    }
    lines.push("");
  }

  if (insights.leaderPaceSamples.length) {
    const samples = insights.leaderPaceSamples.map((s) => `Lap ${s.lap}: ${s.lapTime}`).join(" | ");
    lines.push(`LEADER PACE (SC laps excluded):\n  ${samples}`);
    lines.push("");
  }

  if (insights.weather) {
    lines.push(`WEATHER: Pre-race ${insights.weather.preRace} → Post-race ${insights.weather.postRace}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function generateRaceScript(insights: RaceInsights): Promise<string> {
  const systemPrompt = `You are a Formula 1 race analyst and podcast host presenting a post-race strategic deep-dive. Your episode should be engaging, technically informed, and around 5–8 minutes when read aloud at a natural pace (roughly 700–1000 words).

Rules:
- Write entirely in spoken English. No bullet points, no markdown, no emoji.
- Spell out all numbers: "lap twenty-two" not "lap 22", "one minute thirty-three point six seconds" not "1:33.6".
- Spell out abbreviations: "Mercedes" not "MER", "safety car" not "SC".
- Open with a warm 2-sentence welcome naming the race and circuit.
- Cover in this order: (1) race result and podium, (2) key race events such as safety cars or incidents, (3) tyre strategy narrative — who won the strategy game and why, (4) pace analysis using the lap time samples, (5) fastest lap and its context, (6) weather influence if notable, (7) one forward-looking sentence about championship implications.
- Use driver surnames naturally as a commentator would (e.g. "Antonelli", "Russell").
- Never say "according to the data" — present insights as analysis.
- If a section has no data, skip it gracefully without mentioning the omission.
- Close with a warm 2-sentence sign-off.
- Output only the script. No titles, headers, or stage directions.`;

  const userMessage = formatInsightsAsText(insights);

  const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.7, num_predict: 1800 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty response");
  return content.trim();
}
