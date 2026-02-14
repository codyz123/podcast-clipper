/**
 * Video processing utilities using ffmpeg/ffprobe
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { cleanupTempFiles } from "./audio-converter.js";

const execAsync = promisify(exec);

export interface VideoMetadata {
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  codec: string;
  sizeBytes?: number;
}

/**
 * Extract video metadata using ffprobe
 */
export async function extractVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name -show_entries format=duration -of json "${inputPath}"`
  );
  const data = JSON.parse(stdout);

  const videoStream = data.streams?.[0];
  const format = data.format;

  if (!videoStream) {
    throw new Error("No video stream found in file");
  }

  // Parse frame rate (ffprobe returns as fraction like "30/1" or "30000/1001")
  const [fpsNum, fpsDen] = (videoStream.r_frame_rate || "30/1").split("/").map(Number);
  const fps = fpsDen ? Math.round((fpsNum / fpsDen) * 100) / 100 : 30;

  // Check for audio stream
  const { stdout: audioCheck } = await execAsync(
    `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "${inputPath}"`
  ).catch(() => ({ stdout: "" }));

  return {
    duration: parseFloat(format?.duration || "0"),
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    fps,
    hasAudio: audioCheck.trim().length > 0,
    codec: videoStream.codec_name || "unknown",
  };
}

/**
 * Extract audio from video file as 16kHz mono WAV (optimal for transcription)
 */
export async function extractAudioFromVideo(inputPath: string): Promise<Buffer> {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}-audio.wav`);

  try {
    await execAsync(
      `ffmpeg -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}" -y`
    );
    return await readFile(outputPath);
  } finally {
    await cleanupTempFiles(outputPath);
  }
}

/**
 * Normalize audio levels using EBU R128 loudnorm filter
 */
export async function normalizeAudio(inputPath: string): Promise<Buffer> {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}-normalized.wav`);

  try {
    await execAsync(
      `ffmpeg -i "${inputPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 16000 -ac 1 "${outputPath}" -y`
    );
    return await readFile(outputPath);
  } finally {
    await cleanupTempFiles(outputPath);
  }
}

/**
 * Generate 480p H.264 proxy video for editing performance
 */
export async function generateProxyVideo(inputPath: string): Promise<Buffer> {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}-proxy.mp4`);

  try {
    await execAsync(
      `ffmpeg -i "${inputPath}" -vf "scale=-2:480" -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`,
      { maxBuffer: 50 * 1024 * 1024 }
    );
    return await readFile(outputPath);
  } finally {
    await cleanupTempFiles(outputPath);
  }
}

/**
 * Generate a JPEG thumbnail at a specific timestamp
 */
export async function generateThumbnail(
  inputPath: string,
  timeSeconds: number = 1
): Promise<Buffer> {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}-thumb.jpg`);

  try {
    await execAsync(
      `ffmpeg -i "${inputPath}" -ss ${timeSeconds} -vframes 1 -vf "scale=320:-2" -q:v 3 "${outputPath}" -y`
    );
    return await readFile(outputPath);
  } finally {
    await cleanupTempFiles(outputPath);
  }
}

/**
 * Generate a horizontal thumbnail strip with one frame every `intervalSec` seconds.
 * Each frame is scaled to 160px wide. Returns a single JPEG buffer.
 */
export async function generateThumbnailStrip(
  inputPath: string,
  durationSeconds: number,
  intervalSec: number = 5
): Promise<Buffer> {
  const id = randomUUID();
  const frameDir = join(tmpdir(), `${id}-frames`);
  const outputPath = join(tmpdir(), `${id}-strip.jpg`);

  try {
    await mkdir(frameDir, { recursive: true });

    const frameCount = Math.max(1, Math.floor(durationSeconds / intervalSec));

    // Extract individual frames
    for (let i = 0; i < frameCount; i++) {
      const time = i * intervalSec;
      await execAsync(
        `ffmpeg -ss ${time} -i "${inputPath}" -vframes 1 -vf "scale=160:-2" -q:v 4 "${join(frameDir, `frame-${String(i).padStart(4, "0")}.jpg`)}" -y`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
    }

    // Stitch frames horizontally using ffmpeg
    await execAsync(
      `ffmpeg -pattern_type glob -i "${join(frameDir, "frame-*.jpg")}" -vf "tile=${frameCount}x1" -q:v 3 "${outputPath}" -y`,
      { maxBuffer: 50 * 1024 * 1024 }
    );

    return await readFile(outputPath);
  } finally {
    // Clean up frame directory and output
    await execAsync(`rm -rf "${frameDir}"`).catch(() => {});
    await cleanupTempFiles(outputPath);
  }
}

/**
 * Mix multiple audio sources into a single normalized output.
 * Each input is normalized before mixing to balance different mic levels.
 */
export async function mixAudioSources(inputPaths: string[]): Promise<Buffer> {
  if (inputPaths.length === 0) {
    throw new Error("No audio sources provided for mixing");
  }

  if (inputPaths.length === 1) {
    return normalizeAudio(inputPaths[0]);
  }

  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}-mixed.wav`);
  const tempNormalized: string[] = [];

  try {
    // First normalize each input independently
    for (let i = 0; i < inputPaths.length; i++) {
      const normPath = join(tmpdir(), `${id}-norm-${i}.wav`);
      await execAsync(
        `ffmpeg -i "${inputPaths[i]}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 16000 -ac 1 "${normPath}" -y`
      );
      tempNormalized.push(normPath);
    }

    // Build amix filter inputs
    const inputs = tempNormalized.map((p) => `-i "${p}"`).join(" ");
    await execAsync(
      `ffmpeg ${inputs} -filter_complex "amix=inputs=${tempNormalized.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 16000 -ac 1 "${outputPath}" -y`
    );

    return await readFile(outputPath);
  } finally {
    await cleanupTempFiles(outputPath, ...tempNormalized);
  }
}

/**
 * Write a buffer to a temporary file and return the path.
 * Caller is responsible for cleanup.
 */
export async function bufferToTempFile(buffer: Buffer, extension: string): Promise<string> {
  const id = randomUUID();
  const path = join(tmpdir(), `${id}.${extension}`);
  await writeFile(path, buffer);
  return path;
}

export { cleanupTempFiles };
