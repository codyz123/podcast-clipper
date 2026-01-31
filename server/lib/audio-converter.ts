/**
 * Audio conversion utilities
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

/**
 * Convert an audio buffer to WAV format using ffmpeg.
 * Converts to 16-bit PCM at 16kHz (optimal for speech recognition).
 *
 * @param buffer - Input audio buffer
 * @param originalName - Original filename (for logging/debugging)
 * @returns WAV audio buffer
 */
export async function convertToWav(buffer: Buffer, _originalName: string): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-input`);
  const outputPath = join(tmpdir(), `${id}-output.wav`);

  try {
    // Write input file
    await writeFile(inputPath, buffer);

    // Convert to WAV using ffmpeg
    // -acodec pcm_s16le: 16-bit PCM little-endian encoding
    // -ar 16000: 16kHz sample rate (optimal for Whisper)
    // -y: Overwrite output file
    await execAsync(`ffmpeg -i "${inputPath}" -acodec pcm_s16le -ar 16000 "${outputPath}" -y`);

    // Read output file
    const wavBuffer = await readFile(outputPath);
    return wavBuffer;
  } finally {
    // Cleanup temp files
    await cleanupTempFiles(inputPath, outputPath);
  }
}

/**
 * Compress audio to MP3 format using ffmpeg.
 * Used to reduce file size for OpenAI Whisper (25MB limit).
 *
 * @param buffer - Input audio buffer
 * @param originalName - Original filename
 * @returns MP3 audio buffer
 */
export async function compressToMp3(buffer: Buffer, _originalName: string): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-input`);
  const outputPath = join(tmpdir(), `${id}-output.mp3`);

  try {
    await writeFile(inputPath, buffer);

    // Convert to MP3 using ffmpeg with high-quality settings for accurate transcription
    // -b:a 128k: 128kbps bitrate (better quality for speech recognition)
    // -ar 16000: 16kHz sample rate (optimal for Whisper - higher rates waste bandwidth)
    // -ac 1: mono audio (speech recognition doesn't benefit from stereo)
    // -af "highpass=f=80,lowpass=f=8000": Filter to speech frequency range
    // -af "afftdn=nf=-25": Light noise reduction
    await execAsync(
      `ffmpeg -i "${inputPath}" -b:a 128k -ar 16000 -ac 1 -af "highpass=f=80,lowpass=f=8000,afftdn=nf=-25" "${outputPath}" -y`
    );

    const mp3Buffer = await readFile(outputPath);
    return mp3Buffer;
  } finally {
    await cleanupTempFiles(inputPath, outputPath);
  }
}

/**
 * Get audio duration in seconds using ffprobe
 */
export async function getAudioDuration(inputPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
  );
  return parseFloat(stdout.trim());
}

/**
 * Split audio into chunks of specified duration.
 * Returns array of chunk file paths.
 *
 * @param inputPath - Path to input audio file
 * @param chunkDuration - Duration of each chunk in seconds (default: 10 minutes)
 * @returns Array of paths to chunk files
 */
export async function splitAudioIntoChunks(
  inputPath: string,
  chunkDuration: number = 600 // 10 minutes
): Promise<string[]> {
  const id = randomUUID();
  const duration = await getAudioDuration(inputPath);
  const numChunks = Math.ceil(duration / chunkDuration);
  const chunkPaths: string[] = [];

  console.log(`Splitting ${(duration / 60).toFixed(1)} minute audio into ${numChunks} chunks...`);

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const outputPath = join(tmpdir(), `${id}-chunk-${i}.mp3`);

    // Extract chunk and compress to MP3 with high-quality settings
    // -ss: start time, -t: duration
    // -b:a 128k: 128kbps (better quality for speech recognition)
    // -ar 16000: 16kHz sample rate (optimal for Whisper)
    // -ac 1: mono
    // -af: Audio filters for speech clarity
    await execAsync(
      `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${chunkDuration} -b:a 128k -ar 16000 -ac 1 -af "highpass=f=80,lowpass=f=8000,afftdn=nf=-25" "${outputPath}" -y`
    );

    chunkPaths.push(outputPath);
    console.log(`  Chunk ${i + 1}/${numChunks} created`);
  }

  return chunkPaths;
}

/**
 * Clean up temporary files, ignoring errors
 */
async function cleanupTempFiles(...paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await unlink(path);
    } catch {
      // Ignore cleanup errors - files may already be deleted
    }
  }
}

export { cleanupTempFiles };
