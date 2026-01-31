/**
 * Audio Fixture Generator
 *
 * Generates test audio files in various formats and durations using FFmpeg.
 * Run with: npm run test:generate-fixtures
 */

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, "audio");

interface AudioFixture {
  name: string;
  duration: number; // seconds
  format: string;
  codec?: string;
}

// Test fixtures covering all supported formats and various durations
const FIXTURES: AudioFixture[] = [
  // Short files (5 seconds) - all formats
  { name: "short-5s.mp3", duration: 5, format: "mp3" },
  { name: "short-5s.wav", duration: 5, format: "wav" },
  { name: "short-5s.m4a", duration: 5, format: "m4a" },
  { name: "short-5s.aiff", duration: 5, format: "aiff" },
  { name: "short-5s.ogg", duration: 5, format: "ogg" },
  { name: "short-5s.flac", duration: 5, format: "flac" },
  { name: "short-5s.webm", duration: 5, format: "webm", codec: "libopus" },

  // Medium files (30 seconds) - key formats
  { name: "medium-30s.mp3", duration: 30, format: "mp3" },
  { name: "medium-30s.wav", duration: 30, format: "wav" },
  { name: "medium-30s.aiff", duration: 30, format: "aiff" },

  // Long files (2 minutes) - primary formats
  { name: "long-2min.mp3", duration: 120, format: "mp3" },
  { name: "long-2min.aiff", duration: 120, format: "aiff" },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function generateToneAudio(
  outputPath: string,
  duration: number,
  format: string,
  codec?: string
): Promise<void> {
  // Generate a sine wave tone at 440Hz (A4 note)
  // This creates audio that Whisper can process (returns empty/minimal transcription)
  const frequency = 440;

  let codecArg = "";
  if (codec) {
    codecArg = `-c:a ${codec}`;
  } else if (format === "mp3") {
    codecArg = "-c:a libmp3lame -q:a 2";
  } else if (format === "m4a") {
    codecArg = "-c:a aac -b:a 128k";
  } else if (format === "wav") {
    codecArg = "-c:a pcm_s16le";
  } else if (format === "aiff") {
    codecArg = "-c:a pcm_s16be";
  } else if (format === "flac") {
    codecArg = "-c:a flac";
  } else if (format === "ogg") {
    codecArg = "-c:a libopus";
  }

  const cmd = `ffmpeg -f lavfi -i "sine=frequency=${frequency}:duration=${duration}" ${codecArg} -y "${outputPath}" 2>&1`;

  try {
    await execAsync(cmd);
  } catch (error: any) {
    // FFmpeg returns non-zero even on success sometimes, check if file was created
    if (await fileExists(outputPath)) {
      return;
    }
    throw new Error(`Failed to generate ${outputPath}: ${error.message}`);
  }
}

async function main() {
  console.log("Generating audio test fixtures...\n");

  // Ensure audio directory exists
  await mkdir(AUDIO_DIR, { recursive: true });

  // Check ffmpeg is available
  try {
    await execAsync("ffmpeg -version");
  } catch {
    console.error("ERROR: ffmpeg is not installed or not in PATH");
    console.error("Install with: brew install ffmpeg");
    process.exit(1);
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const fixture of FIXTURES) {
    const outputPath = join(AUDIO_DIR, fixture.name);

    // Skip if file already exists
    if (await fileExists(outputPath)) {
      console.log(`  SKIP: ${fixture.name} (already exists)`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`  Generating ${fixture.name}...`);
      await generateToneAudio(outputPath, fixture.duration, fixture.format, fixture.codec);
      console.log(" OK");
      generated++;
    } catch (error: any) {
      console.log(` FAILED: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Fixtures location: ${AUDIO_DIR}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
