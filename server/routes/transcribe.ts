import { Router, Request, Response } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { AssemblyAI } from "assemblyai";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { needsConversion } from "../lib/audio-formats.js";
import {
  convertToWav,
  compressToMp3,
  splitAudioIntoChunks,
  getAudioDuration,
  cleanupTempFiles,
} from "../lib/audio-converter.js";

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
  const resolvedApiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured");
  }
  const client = new AssemblyAI({ apiKey: resolvedApiKey });

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
    words: ((transcription as unknown as { words?: WordTimestamp[] }).words || []).map(
      (w: WordTimestamp) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })
    ),
    language: (transcription as unknown as { language?: string }).language || "en",
    duration: (transcription as unknown as { duration?: number }).duration || 0,
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
    console.warn(
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

export { router as transcribeRouter };
