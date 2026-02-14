/**
 * Audio sync utilities for multi-camera video alignment.
 *
 * Uses FFT cross-correlation to find time offsets between audio tracks
 * recorded at the same event from different cameras/recorders.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { cleanupTempFiles } from "./audio-converter.js";
import { bufferToTempFile } from "./video-processing.js";

const execAsync = promisify(exec);

export interface SyncResult {
  sourceId: string;
  offsetMs: number;
  method: "none" | "duration-match" | "audio-correlation";
  confidence: number;
}

interface SyncableSource {
  id: string;
  audioBlobUrl: string | null;
  durationSeconds: number | null;
  sourceType: string;
  displayOrder: number;
}

// ============ Public API ============

/**
 * Synchronize multiple video sources by analyzing their audio tracks.
 *
 * Strategy:
 * - 1 source: no sync needed
 * - Same duration (±0.5s): assume started together (duration-match)
 * - Different durations: FFT cross-correlation on extracted audio segments
 * - B-roll / no audio: skip (offset stays 0, confidence 0)
 *
 * First source by displayOrder is the reference (offset = 0).
 * Returns offsets in milliseconds relative to the reference.
 */
export async function syncVideoSources(sources: SyncableSource[]): Promise<SyncResult[]> {
  if (sources.length <= 1) {
    return sources.map((s) => ({
      sourceId: s.id,
      offsetMs: 0,
      method: "none" as const,
      confidence: 1,
    }));
  }

  const sorted = [...sources].sort((a, b) => a.displayOrder - b.displayOrder);
  const reference = sorted[0];

  const results: SyncResult[] = [
    { sourceId: reference.id, offsetMs: 0, method: "none", confidence: 1 },
  ];

  for (let i = 1; i < sorted.length; i++) {
    const source = sorted[i];

    // B-roll or no audio: skip
    if (source.sourceType === "broll" || !source.audioBlobUrl) {
      results.push({
        sourceId: source.id,
        offsetMs: 0,
        method: "none",
        confidence: 0,
      });
      continue;
    }

    // No reference audio: can't sync
    if (!reference.audioBlobUrl) {
      results.push({
        sourceId: source.id,
        offsetMs: 0,
        method: "none",
        confidence: 0,
      });
      continue;
    }

    // Duration match: same duration ±0.5s → assume started together
    if (
      reference.durationSeconds &&
      source.durationSeconds &&
      Math.abs(reference.durationSeconds - source.durationSeconds) < 0.5
    ) {
      results.push({
        sourceId: source.id,
        offsetMs: 0,
        method: "duration-match",
        confidence: 1,
      });
      continue;
    }

    // FFT cross-correlation
    try {
      const result = await correlateAudioPair(
        reference.audioBlobUrl,
        reference.durationSeconds || 0,
        source.id,
        source.audioBlobUrl,
        source.durationSeconds || 0
      );
      results.push(result);
    } catch (error) {
      console.error(`[audio-sync] Correlation failed for source ${source.id}:`, error);
      results.push({
        sourceId: source.id,
        offsetMs: 0,
        method: "audio-correlation",
        confidence: 0,
      });
    }
  }

  return results;
}

// ============ Cross-correlation ============

const SAMPLE_RATE = 8000; // 8kHz — sufficient for sync, keeps FFT fast
const SEGMENT_SECONDS = 30;

async function correlateAudioPair(
  refAudioUrl: string,
  refDuration: number,
  srcId: string,
  srcAudioUrl: string,
  srcDuration: number
): Promise<SyncResult> {
  // Download both audio files
  const [refBuf, srcBuf] = await Promise.all([
    fetch(refAudioUrl)
      .then((r) => r.arrayBuffer())
      .then(Buffer.from),
    fetch(srcAudioUrl)
      .then((r) => r.arrayBuffer())
      .then(Buffer.from),
  ]);

  const refPath = await bufferToTempFile(refBuf, "wav");
  const srcPath = await bufferToTempFile(srcBuf, "wav");

  try {
    // Extract 30s segments from the middle of each file
    const refStart = Math.max(0, (refDuration - SEGMENT_SECONDS) / 2);
    const srcStart = Math.max(0, (srcDuration - SEGMENT_SECONDS) / 2);

    const [refSamples, srcSamples] = await Promise.all([
      extractPcmSamples(refPath, refStart, SEGMENT_SECONDS),
      extractPcmSamples(srcPath, srcStart, SEGMENT_SECONDS),
    ]);

    if (refSamples.length === 0 || srcSamples.length === 0) {
      return { sourceId: srcId, offsetMs: 0, method: "audio-correlation", confidence: 0 };
    }

    // FFT cross-correlation
    const correlation = crossCorrelate(refSamples, srcSamples);

    // Find peak
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i < correlation.length; i++) {
      if (correlation[i] > maxVal) {
        maxVal = correlation[i];
        maxIdx = i;
      }
    }

    // Convert circular index to signed lag in samples
    // Positive lag: src is behind ref. Negative: src is ahead.
    const N = correlation.length;
    const lagSamples = maxIdx <= N / 2 ? maxIdx : maxIdx - N;
    const lagMs = Math.round((lagSamples / SAMPLE_RATE) * 1000);

    // Account for different extraction start points
    const startDiffMs = Math.round((refStart - srcStart) * 1000);
    const totalOffsetMs = lagMs + startDiffMs;

    // Normalized confidence (0-1)
    const refEnergy = refSamples.reduce((sum, v) => sum + v * v, 0);
    const srcEnergy = srcSamples.reduce((sum, v) => sum + v * v, 0);
    const normFactor = Math.sqrt(refEnergy * srcEnergy);
    const confidence =
      normFactor > 0 ? Math.min(1, Math.max(0, Math.round((maxVal / normFactor) * 100) / 100)) : 0;

    console.log(
      `[audio-sync] Source ${srcId}: offset=${totalOffsetMs}ms, confidence=${confidence}, lag=${lagSamples} samples`
    );

    return {
      sourceId: srcId,
      offsetMs: totalOffsetMs,
      method: "audio-correlation",
      confidence,
    };
  } finally {
    await cleanupTempFiles(refPath, srcPath);
  }
}

/**
 * Extract raw PCM float32 samples from an audio file using ffmpeg.
 */
async function extractPcmSamples(
  audioPath: string,
  startSec: number,
  durationSec: number
): Promise<Float32Array> {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}-pcm.raw`);

  try {
    await execAsync(
      `ffmpeg -i "${audioPath}" -ss ${startSec} -t ${durationSec} -f f32le -acodec pcm_f32le -ar ${SAMPLE_RATE} -ac 1 "${outputPath}" -y`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const buffer = await readFile(outputPath);
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  } finally {
    await cleanupTempFiles(outputPath);
  }
}

// ============ FFT (Cooley-Tukey radix-2) ============

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (2 * Math.PI) / len;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let cR = 1,
        cI = 0;
      for (let j = 0; j < halfLen; j++) {
        const uR = real[i + j];
        const uI = imag[i + j];
        const vR = real[i + j + halfLen] * cR - imag[i + j + halfLen] * cI;
        const vI = real[i + j + halfLen] * cI + imag[i + j + halfLen] * cR;

        real[i + j] = uR + vR;
        imag[i + j] = uI + vI;
        real[i + j + halfLen] = uR - vR;
        imag[i + j + halfLen] = uI - vI;

        const newCR = cR * wR - cI * wI;
        cI = cR * wI + cI * wR;
        cR = newCR;
      }
    }
  }
}

function ifft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fft(real, imag);
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

/**
 * FFT-based cross-correlation of two signals.
 * Returns R[k] = IFFT(FFT(a) * conj(FFT(b))).
 */
function crossCorrelate(a: Float32Array, b: Float32Array): Float64Array {
  const n = 1 << Math.ceil(Math.log2(a.length + b.length - 1));

  const aR = new Float64Array(n);
  const aI = new Float64Array(n);
  const bR = new Float64Array(n);
  const bI = new Float64Array(n);

  for (let i = 0; i < a.length; i++) aR[i] = a[i];
  for (let i = 0; i < b.length; i++) bR[i] = b[i];

  fft(aR, aI);
  fft(bR, bI);

  // Multiply A * conj(B)
  const cR = new Float64Array(n);
  const cI = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cR[i] = aR[i] * bR[i] + aI[i] * bI[i];
    cI[i] = aI[i] * bR[i] - aR[i] * bI[i];
  }

  ifft(cR, cI);
  return cR;
}
