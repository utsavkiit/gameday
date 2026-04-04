import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface TtsConfig {
  ttsUrl: string;
  model: string;
  voice: string;
  outputDir: string;
}

export async function generateAudio(
  script: string,
  filename: string,
  config: TtsConfig
): Promise<string> {
  const outputDir = config.outputDir.startsWith("~")
    ? path.join(os.homedir(), config.outputDir.slice(1))
    : config.outputDir;

  fs.mkdirSync(outputDir, { recursive: true });

  const response = await fetch(`${config.ttsUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      input: script,
      voice: config.voice,
    }),
    signal: AbortSignal.timeout(300_000), // TTS can take a few minutes for long scripts
  });

  if (!response.ok) {
    throw new Error(`TTS server error: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}
