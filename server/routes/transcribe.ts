import { Router, Request, Response } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { AssemblyAI } from "assemblyai";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { eq, asc } from "drizzle-orm";
import { needsConversion } from "../lib/audio-formats.js";
import {
  convertToWav,
  compressToMp3,
  splitAudioIntoChunks,
  getAudioDuration,
  cleanupTempFiles,
} from "../lib/audio-converter.js";
import { bufferToTempFile } from "../lib/video-processing.js";
import { db } from "../db/index.js";
import { videoSources, podcastPeople } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";

const router = Router();

// Use disk storage for large files to avoid memory issues
const storage = multer.diskStorage({
  destination: tmpdir(),
  filename: (_req, _file, cb) => {
    cb(null, `upload-${randomUUID()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB limit
});

// OpenAI Whisper file size limit
const WHISPER_MAX_SIZE = 25 * 1024 * 1024; // 25MB

// Chunk duration in seconds (10 minutes = good balance of size and context)
const CHUNK_DURATION = 600;

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

interface SpeakerSegment {
  speakerLabel: string;
  startWordIndex: number;
  endWordIndex: number;
  startTime: number;
  endTime: number;
}

interface ProgressEvent {
  stage: string;
  progress: number; // 0-100
  message: string;
  detail?: string;
}

/**
 * Send a progress event via SSE
 */
function sendProgress(res: Response, event: ProgressEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ============ AssemblyAI Transcription ============

const ASSEMBLYAI_POLL_INTERVAL = 3000; // 3 seconds

/**
 * Transcribe with AssemblyAI (supports speaker diarization natively)
 */
async function transcribeWithAssemblyAI(
  filePath: string,
  progress: (event: ProgressEvent) => void,
  apiKey?: string
): Promise<{
  text: string;
  words: WordTimestamp[];
  segments: SpeakerSegment[];
  language: string;
  duration: number;
}> {
  const client = new AssemblyAI({ apiKey: apiKey || process.env.ASSEMBLYAI_API_KEY! });

  // Step 1: Upload file to AssemblyAI
  progress({
    stage: "uploading",
    progress: 10,
    message: "Uploading audio to AssemblyAI",
  });

  const uploadUrl = await client.files.upload(filePath);

  progress({
    stage: "uploading",
    progress: 20,
    message: "Audio uploaded",
  });

  // Step 2: Submit transcription with speaker diarization
  progress({
    stage: "queued",
    progress: 25,
    message: "Transcription queued",
    detail: "Waiting for processing to start",
  });

  const transcript = await client.transcripts.submit({
    audio_url: uploadUrl,
    speaker_labels: true,
    speech_models: ["universal-2"],
  });

  // Step 3: Poll for completion with progress updates
  let status = transcript.status;
  let pollCount = 0;
  const maxPolls = 300; // ~15 min max wait

  while (status !== "completed" && status !== "error") {
    if (pollCount >= maxPolls) {
      throw new Error("Transcription timed out after 15 minutes");
    }

    await new Promise((resolve) => setTimeout(resolve, ASSEMBLYAI_POLL_INTERVAL));
    const polled = await client.transcripts.get(transcript.id);
    status = polled.status;
    pollCount++;

    if (status === "processing") {
      // Interpolate progress between 30-90%
      const processingProgress = Math.min(30 + pollCount * 2, 90);
      progress({
        stage: "transcribing",
        progress: processingProgress,
        message: "Transcribing audio",
        detail: "Processing with speaker diarization",
      });
    } else if (status === "queued") {
      progress({
        stage: "queued",
        progress: 25 + Math.min(pollCount, 5),
        message: "Waiting in queue",
      });
    }
  }

  // Step 4: Get completed transcript
  const completed = await client.transcripts.get(transcript.id);

  if (completed.status === "error") {
    throw new Error(`AssemblyAI transcription failed: ${completed.error}`);
  }

  progress({
    stage: "mapping",
    progress: 95,
    message: "Processing results",
    detail: "Mapping speakers and timestamps",
  });

  // Step 5: Map AssemblyAI response to our format
  const words: WordTimestamp[] = (completed.words || []).map((w) => ({
    word: w.text,
    start: w.start / 1000, // ms → seconds
    end: w.end / 1000,
    confidence: w.confidence,
  }));

  // Build segments from utterances
  const segments: SpeakerSegment[] = [];
  let globalWordIdx = 0;

  if (completed.utterances) {
    for (const utterance of completed.utterances) {
      const startWordIndex = globalWordIdx;
      const wordCount = utterance.words.length;
      globalWordIdx += wordCount;

      // Convert speaker letter to number (A→1, B→2, etc.)
      const speakerNum = utterance.speaker.charCodeAt(0) - 64;

      segments.push({
        speakerLabel: `Speaker ${speakerNum}`,
        startWordIndex,
        endWordIndex: globalWordIdx,
        startTime: utterance.start / 1000,
        endTime: utterance.end / 1000,
      });
    }
  }

  const duration = completed.audio_duration || 0;
  const language = completed.language_code || "en";

  return {
    text: completed.text || "",
    words,
    segments,
    language,
    duration,
  };
}

// ============ Whisper Fallback Transcription ============

/**
 * Transcribe a single audio file with Whisper (must be < 25MB)
 */
async function transcribeSingleFileWhisper(
  openai: OpenAI,
  audioPath: string,
  filename: string
): Promise<{ text: string; words: WordTimestamp[]; language: string; duration: number }> {
  const audioBuffer = await readFile(audioPath);
  const file = await toFile(audioBuffer, filename, { type: "audio/mpeg" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    prompt:
      "This is a podcast conversation with natural speech. Transcribe only spoken words; ignore music, singing, and other non-speech audio. Do not include lyrics or music notation.",
  });

  return {
    text: transcription.text || "",
    words: ((transcription as any).words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
    language: (transcription as any).language || "en",
    duration: (transcription as any).duration || 0,
  };
}

/**
 * Merge multiple Whisper transcription results, adjusting timestamps
 */
function mergeTranscriptions(
  results: Array<{ text: string; words: WordTimestamp[]; language: string; duration: number }>,
  chunkDuration: number
): { text: string; words: WordTimestamp[]; language: string; duration: number } {
  const allWords: WordTimestamp[] = [];
  const allText: string[] = [];
  let totalDuration = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const timeOffset = i * chunkDuration;

    allText.push(result.text);

    for (const word of result.words) {
      allWords.push({
        word: word.word,
        start: word.start + timeOffset,
        end: word.end + timeOffset,
      });
    }

    if (i === results.length - 1) {
      totalDuration = timeOffset + result.duration;
    }
  }

  return {
    text: allText.join(" "),
    words: allWords,
    language: results[0]?.language || "en",
    duration: totalDuration,
  };
}

/**
 * Full Whisper transcription flow (fallback when AssemblyAI key is not set)
 */
async function transcribeWithWhisper(
  uploadPath: string,
  originalName: string,
  mimetype: string,
  fileSize: number,
  progress: (event: ProgressEvent) => void
): Promise<{
  text: string;
  words: WordTimestamp[];
  segments: SpeakerSegment[];
  language: string;
  duration: number;
}> {
  const filesToCleanup: string[] = [];

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    let audioBuffer = await readFile(uploadPath);
    let processedPath = uploadPath;

    // Check if format needs conversion
    if (needsConversion(mimetype, originalName, audioBuffer)) {
      progress({
        stage: "converting",
        progress: 10,
        message: "Converting audio format",
        detail: "AIFF → WAV",
      });

      const wavBuffer = await convertToWav(audioBuffer, originalName);
      processedPath = join(tmpdir(), `${randomUUID()}-converted.wav`);
      await writeFile(processedPath, wavBuffer);
      filesToCleanup.push(processedPath);
      audioBuffer = wavBuffer;

      progress({
        stage: "converting",
        progress: 20,
        message: "Audio converted",
        detail: `${(wavBuffer.length / 1024 / 1024).toFixed(1)} MB`,
      });
    }

    // Get audio duration
    progress({ stage: "analyzing", progress: 22, message: "Analyzing audio" });
    const audioDuration = await getAudioDuration(processedPath);

    progress({
      stage: "analyzing",
      progress: 25,
      message: "Audio analyzed",
      detail: `${(audioDuration / 60).toFixed(1)} minutes`,
    });

    // Compress to MP3
    progress({
      stage: "compressing",
      progress: 28,
      message: "Compressing audio",
      detail: "Optimizing for transcription",
    });

    const mp3Buffer = await compressToMp3(audioBuffer, originalName);
    const mp3Path = join(tmpdir(), `${randomUUID()}-compressed.mp3`);
    await writeFile(mp3Path, mp3Buffer);
    filesToCleanup.push(mp3Path);

    progress({
      stage: "compressing",
      progress: 35,
      message: "Audio compressed",
      detail: `${(mp3Buffer.length / 1024 / 1024).toFixed(1)} MB`,
    });

    const openai = new OpenAI({ apiKey, timeout: 10 * 60 * 1000 });

    if (mp3Buffer.length <= WHISPER_MAX_SIZE) {
      progress({
        stage: "transcribing",
        progress: 40,
        message: "Transcribing audio",
        detail: "Sending to OpenAI Whisper",
      });

      const result = await transcribeSingleFileWhisper(openai, mp3Path, "audio.mp3");
      return { ...result, segments: [] }; // Whisper doesn't support diarization
    }

    // File too large — split into chunks
    const numChunks = Math.ceil(audioDuration / CHUNK_DURATION);

    progress({
      stage: "splitting",
      progress: 38,
      message: "Preparing audio chunks",
      detail: `${numChunks} segments of 10 min each`,
    });

    const chunkPaths = await splitAudioIntoChunks(processedPath, CHUNK_DURATION);
    filesToCleanup.push(...chunkPaths);

    progress({
      stage: "splitting",
      progress: 45,
      message: "Audio split complete",
      detail: `${chunkPaths.length} chunks ready`,
    });

    const results: Array<{
      text: string;
      words: WordTimestamp[];
      language: string;
      duration: number;
    }> = [];

    const transcribeStartProgress = 45;
    const transcribeEndProgress = 95;
    const progressPerChunk = (transcribeEndProgress - transcribeStartProgress) / chunkPaths.length;

    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkProgress = transcribeStartProgress + i * progressPerChunk;

      progress({
        stage: "transcribing",
        progress: Math.round(chunkProgress),
        message: `Transcribing chunk ${i + 1} of ${chunkPaths.length}`,
        detail: `${i * 10}:00 - ${(i + 1) * 10}:00`,
      });

      const chunkResult = await transcribeSingleFileWhisper(
        openai,
        chunkPaths[i],
        `chunk-${i}.mp3`
      );
      results.push(chunkResult);

      progress({
        stage: "transcribing",
        progress: Math.round(chunkProgress + progressPerChunk * 0.9),
        message: `Chunk ${i + 1} complete`,
        detail: `${chunkResult.words.length} words`,
      });
    }

    progress({
      stage: "merging",
      progress: 96,
      message: "Merging transcriptions",
      detail: "Aligning timestamps",
    });

    const merged = mergeTranscriptions(results, CHUNK_DURATION);
    return { ...merged, segments: [] }; // Whisper doesn't support diarization
  } finally {
    await cleanupTempFiles(...filesToCleanup);
  }
}

// ============ Main Route ============

router.post("/transcribe", upload.single("file"), async (req: Request, res: Response) => {
  const filesToCleanup: string[] = [];

  const assemblyaiKey =
    (req.headers["x-assemblyai-key"] as string) || process.env.ASSEMBLYAI_API_KEY;
  const useAssemblyAI = !!assemblyaiKey;
  const hasWhisper = !!process.env.OPENAI_API_KEY || !!req.headers["x-openai-key"];

  if (!useAssemblyAI && !hasWhisper) {
    res.status(500).json({
      error: "No transcription API key configured. Set ASSEMBLYAI_API_KEY or OPENAI_API_KEY.",
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }

  // Check if client wants SSE streaming
  const useStreaming = req.headers.accept === "text/event-stream";

  // Set up SSE headers if streaming
  if (useStreaming) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  const progress = (event: ProgressEvent) => {
    console.log(
      `[${event.stage}] ${event.progress}% - ${event.message}${event.detail ? ` (${event.detail})` : ""}`
    );
    if (useStreaming) {
      sendProgress(res, event);
    }
  };

  const uploadPath = req.file.path;
  filesToCleanup.push(uploadPath);

  try {
    const mimetype = req.file.mimetype || "";
    const originalName = req.file.originalname || "audio";
    const fileSizeMB = req.file.size / 1024 / 1024;

    progress({
      stage: "received",
      progress: 5,
      message: "File received",
      detail: `${fileSizeMB.toFixed(1)} MB`,
    });

    let result: {
      text: string;
      words: WordTimestamp[];
      segments: SpeakerSegment[];
      language: string;
      duration: number;
    };

    if (useAssemblyAI) {
      // AssemblyAI handles any format/size natively — no conversion needed
      result = await transcribeWithAssemblyAI(uploadPath, progress, assemblyaiKey);
    } else {
      // Whisper fallback — needs conversion, compression, chunking
      result = await transcribeWithWhisper(
        uploadPath,
        originalName,
        mimetype,
        req.file.size,
        progress
      );
    }

    progress({
      stage: "complete",
      progress: 100,
      message: "Transcription complete",
      detail: `${result.words.length} words${result.segments.length > 0 ? `, ${new Set(result.segments.map((s) => s.speakerLabel)).size} speakers` : ""}`,
    });

    const responseData = {
      task: "transcribe",
      language: result.language,
      duration: result.duration,
      text: result.text,
      words: result.words,
      segments: result.segments,
      service: useAssemblyAI ? "assemblyai" : "openai-whisper",
    };

    if (useStreaming) {
      res.write(`data: ${JSON.stringify({ stage: "result", ...responseData })}\n\n`);
      res.end();
    } else {
      res.json(responseData);
    }
  } catch (error) {
    console.error("Transcription error:", error);

    let errorMessage = "Transcription failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    if (useStreaming) {
      res.write(`data: ${JSON.stringify({ stage: "error", error: errorMessage })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: errorMessage });
    }
  } finally {
    await cleanupTempFiles(...filesToCleanup);
  }
});

// ============ Multicam Transcription ============

type TranscriptionStrategy = "PER_SPEAKER" | "SINGLE_SPEAKER" | "DIARIZE_WIDE";

interface VideoSourceRow {
  id: string;
  label: string;
  personId: string | null;
  sourceType: string;
  audioBlobUrl: string | null;
  syncOffsetMs: number;
  displayOrder: number;
}

function detectTranscriptionStrategy(sources: VideoSourceRow[]): {
  strategy: TranscriptionStrategy;
  speakerSources: VideoSourceRow[];
} {
  const speakerSources = sources.filter((s) => s.sourceType === "speaker");
  const wideSources = sources.filter((s) => s.sourceType === "wide");

  // Count unique persons among speaker sources
  const uniquePersonIds = new Set(speakerSources.filter((s) => s.personId).map((s) => s.personId));

  if (uniquePersonIds.size > 1) {
    // Multiple speakers — transcribe one source per unique person
    // Pick one source per personId (prefer the first by displayOrder)
    const seen = new Set<string>();
    const perPersonSources: VideoSourceRow[] = [];
    for (const src of speakerSources) {
      if (src.personId && !seen.has(src.personId)) {
        seen.add(src.personId);
        perPersonSources.push(src);
      }
    }
    return { strategy: "PER_SPEAKER", speakerSources: perPersonSources };
  }

  if (uniquePersonIds.size === 1 || (speakerSources.length > 0 && uniquePersonIds.size === 0)) {
    // Single speaker — just transcribe one source
    return { strategy: "SINGLE_SPEAKER", speakerSources: [speakerSources[0]] };
  }

  if (wideSources.length > 0) {
    // No speaker sources — use wide shot with diarization
    return { strategy: "DIARIZE_WIDE", speakerSources: [wideSources[0]] };
  }

  throw new Error("No usable audio sources found for transcription");
}

/**
 * Transcribe a single AssemblyAI source without speaker labels.
 * Returns words with timestamps adjusted by syncOffsetMs.
 */
async function transcribeSingleSource(
  source: VideoSourceRow,
  personLabel: string,
  progress: (event: ProgressEvent) => void,
  apiKey?: string
): Promise<{
  words: WordTimestamp[];
  segments: SpeakerSegment[];
  text: string;
  duration: number;
}> {
  if (!source.audioBlobUrl) {
    throw new Error(`Source ${source.label} has no audio`);
  }

  // Download audio to temp file
  const response = await fetch(source.audioBlobUrl);
  if (!response.ok) throw new Error(`Failed to download audio for ${source.label}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = await bufferToTempFile(buffer, "wav");

  try {
    const client = new AssemblyAI({ apiKey: apiKey || process.env.ASSEMBLYAI_API_KEY! });

    progress({
      stage: "uploading",
      progress: 10,
      message: `Uploading audio for ${personLabel}`,
    });

    const uploadUrl = await client.files.upload(tempPath);

    progress({
      stage: "transcribing",
      progress: 30,
      message: `Transcribing ${personLabel}`,
    });

    // No speaker labels — this is a single-person transcription
    const transcript = await client.transcripts.submit({
      audio_url: uploadUrl,
      speaker_labels: false,
      speech_models: ["universal-2"],
    });

    // Poll for completion
    let status = transcript.status;
    let pollCount = 0;
    while (status !== "completed" && status !== "error") {
      if (pollCount >= 300) throw new Error(`Transcription timed out for ${personLabel}`);
      await new Promise((r) => setTimeout(r, 3000));
      const polled = await client.transcripts.get(transcript.id);
      status = polled.status;
      pollCount++;

      if (status === "processing") {
        progress({
          stage: "transcribing",
          progress: Math.min(30 + pollCount * 2, 85),
          message: `Transcribing ${personLabel}`,
        });
      }
    }

    const completed = await client.transcripts.get(transcript.id);
    if (completed.status === "error") {
      throw new Error(`Transcription failed for ${personLabel}: ${completed.error}`);
    }

    // Adjust timestamps by sync offset
    const offsetSec = source.syncOffsetMs / 1000;

    const words: WordTimestamp[] = (completed.words || []).map((w) => ({
      word: w.text,
      start: w.start / 1000 + offsetSec,
      end: w.end / 1000 + offsetSec,
      confidence: w.confidence,
    }));

    // Build a single segment for this entire speaker
    const segments: SpeakerSegment[] =
      words.length > 0 ? buildContiguousSegments(words, personLabel) : [];

    return {
      words,
      segments,
      text: completed.text || "",
      duration: completed.audio_duration || 0,
    };
  } finally {
    await cleanupTempFiles(tempPath);
  }
}

/**
 * Build contiguous speaker segments from words.
 * Groups words that are close together (< 2s gap) into single segments.
 */
function buildContiguousSegments(
  words: WordTimestamp[],
  speakerLabel: string,
  gapThreshold: number = 2.0
): SpeakerSegment[] {
  if (words.length === 0) return [];

  const segments: SpeakerSegment[] = [];
  let segStart = 0;

  for (let i = 1; i < words.length; i++) {
    if (words[i].start - words[i - 1].end > gapThreshold) {
      segments.push({
        speakerLabel,
        startWordIndex: segStart,
        endWordIndex: i,
        startTime: words[segStart].start,
        endTime: words[i - 1].end,
      });
      segStart = i;
    }
  }

  // Final segment
  segments.push({
    speakerLabel,
    startWordIndex: segStart,
    endWordIndex: words.length,
    startTime: words[segStart].start,
    endTime: words[words.length - 1].end,
  });

  return segments;
}

/**
 * Merge per-speaker transcription results into a unified timeline.
 * Words are sorted by start time. Segments are rebuilt from the merged word list.
 */
function mergePerSpeakerResults(
  results: Array<{
    words: WordTimestamp[];
    segments: SpeakerSegment[];
    speakerLabel: string;
  }>
): { words: WordTimestamp[]; segments: SpeakerSegment[] } {
  // Tag each word with its speaker
  const taggedWords: Array<WordTimestamp & { speaker: string }> = [];
  for (const result of results) {
    for (const word of result.words) {
      taggedWords.push({ ...word, speaker: result.speakerLabel });
    }
  }

  // Sort by start time
  taggedWords.sort((a, b) => a.start - b.start);

  // Build unified word list and speaker segments
  const words: WordTimestamp[] = taggedWords.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
    confidence: w.confidence,
  }));

  // Build segments from contiguous speaker runs
  const segments: SpeakerSegment[] = [];
  if (taggedWords.length > 0) {
    let currentSpeaker = taggedWords[0].speaker;
    let segStart = 0;

    for (let i = 1; i < taggedWords.length; i++) {
      if (taggedWords[i].speaker !== currentSpeaker) {
        segments.push({
          speakerLabel: currentSpeaker,
          startWordIndex: segStart,
          endWordIndex: i,
          startTime: taggedWords[segStart].start,
          endTime: taggedWords[i - 1].end,
        });
        currentSpeaker = taggedWords[i].speaker;
        segStart = i;
      }
    }

    // Final segment
    segments.push({
      speakerLabel: currentSpeaker,
      startWordIndex: segStart,
      endWordIndex: taggedWords.length,
      startTime: taggedWords[segStart].start,
      endTime: taggedWords[taggedWords.length - 1].end,
    });
  }

  return { words, segments };
}

/**
 * POST /api/transcribe-multicam
 *
 * Adaptive multicam transcription endpoint.
 * Detects configuration and chooses optimal strategy.
 * SSE progress streaming.
 */
router.post("/transcribe-multicam", jwtAuthMiddleware, async (req: Request, res: Response) => {
  const { episodeId } = req.body;

  if (!episodeId) {
    res.status(400).json({ error: "episodeId is required" });
    return;
  }

  const assemblyaiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!assemblyaiKey) {
    res.status(500).json({ error: "ASSEMBLYAI_API_KEY not configured" });
    return;
  }

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const progress = (event: ProgressEvent) => {
    console.log(
      `[multicam-transcribe] [${event.stage}] ${event.progress}% - ${event.message}${event.detail ? ` (${event.detail})` : ""}`
    );
    sendProgress(res, event);
  };

  try {
    // Fetch video sources
    const sources = await db
      .select()
      .from(videoSources)
      .where(eq(videoSources.projectId, episodeId))
      .orderBy(asc(videoSources.displayOrder));

    if (sources.length === 0) {
      res.write(`data: ${JSON.stringify({ stage: "error", error: "No video sources found" })}\n\n`);
      res.end();
      return;
    }

    // Detect strategy
    const { strategy, speakerSources } = detectTranscriptionStrategy(sources);

    progress({
      stage: "detected",
      progress: 5,
      message: `Strategy: ${strategy}`,
      detail: `${speakerSources.length} source(s) to transcribe`,
    });

    let words: WordTimestamp[] = [];
    let segments: SpeakerSegment[] = [];
    let totalDuration = 0;

    if (strategy === "PER_SPEAKER") {
      // Fetch person names for labels
      const personIds = speakerSources.map((s) => s.personId).filter(Boolean) as string[];

      const people = personIds.length > 0 ? await db.select().from(podcastPeople) : [];

      const personNameMap = new Map(people.map((p) => [p.id, p.name]));

      // Transcribe each speaker independently
      const perSpeakerResults: Array<{
        words: WordTimestamp[];
        segments: SpeakerSegment[];
        speakerLabel: string;
      }> = [];

      for (let i = 0; i < speakerSources.length; i++) {
        const source = speakerSources[i];
        const personLabel = source.personId
          ? personNameMap.get(source.personId) || source.label
          : source.label;

        const baseProgress = 5 + (i / speakerSources.length) * 85;

        const speakerProgress = (event: ProgressEvent) => {
          progress({
            ...event,
            progress: Math.round(
              baseProgress + (event.progress / 100) * (85 / speakerSources.length)
            ),
            message: `[${i + 1}/${speakerSources.length}] ${event.message}`,
          });
        };

        const result = await transcribeSingleSource(
          source,
          personLabel,
          speakerProgress,
          assemblyaiKey
        );

        perSpeakerResults.push({
          words: result.words,
          segments: result.segments,
          speakerLabel: personLabel,
        });

        totalDuration = Math.max(totalDuration, result.duration);
      }

      // Merge all speaker results
      progress({
        stage: "merging",
        progress: 92,
        message: "Merging speaker timelines",
      });

      const merged = mergePerSpeakerResults(perSpeakerResults);
      words = merged.words;
      segments = merged.segments;
    } else if (strategy === "SINGLE_SPEAKER") {
      const source = speakerSources[0];
      const personLabel = source.label;

      const result = await transcribeSingleSource(source, personLabel, progress, assemblyaiKey);

      words = result.words;
      segments = result.segments;
      totalDuration = result.duration;
    } else {
      // DIARIZE_WIDE — use AssemblyAI with speaker diarization
      const source = speakerSources[0];

      if (!source.audioBlobUrl) {
        throw new Error("Wide shot has no audio for transcription");
      }

      const response = await fetch(source.audioBlobUrl);
      if (!response.ok) throw new Error("Failed to download wide shot audio");
      const buffer = Buffer.from(await response.arrayBuffer());
      const tempPath = await bufferToTempFile(buffer, "wav");

      try {
        const result = await transcribeWithAssemblyAI(tempPath, progress, assemblyaiKey);

        // Adjust timestamps by sync offset
        const offsetSec = source.syncOffsetMs / 1000;
        words = result.words.map((w) => ({
          ...w,
          start: w.start + offsetSec,
          end: w.end + offsetSec,
        }));
        segments = result.segments.map((s) => ({
          ...s,
          startTime: s.startTime + offsetSec,
          endTime: s.endTime + offsetSec,
        }));
        totalDuration = result.duration;
      } finally {
        await cleanupTempFiles(tempPath);
      }
    }

    progress({
      stage: "complete",
      progress: 100,
      message: "Multicam transcription complete",
      detail: `${words.length} words, ${new Set(segments.map((s) => s.speakerLabel)).size} speakers`,
    });

    const responseData = {
      stage: "result",
      task: "transcribe",
      language: "en",
      duration: totalDuration,
      text: words.map((w) => w.word).join(" "),
      words,
      segments,
      service: "assemblyai",
      strategy,
    };

    res.write(`data: ${JSON.stringify(responseData)}\n\n`);
    res.end();
  } catch (error) {
    console.error("Multicam transcription error:", error);
    res.write(`data: ${JSON.stringify({ stage: "error", error: (error as Error).message })}\n\n`);
    res.end();
  }
});

export { router as transcribeRouter };
