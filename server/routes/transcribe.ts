import { Router, Request, Response } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
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

/**
 * Transcribe a single audio file (must be < 25MB)
 */
async function transcribeSingleFile(
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
    // Prompt helps Whisper understand context and improves accuracy
    prompt:
      "This is a podcast conversation with natural speech, including filler words, pauses, and conversational language.",
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
 * Merge multiple transcription results, adjusting timestamps
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

router.post("/transcribe", upload.single("file"), async (req: Request, res: Response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const filesToCleanup: string[] = [];

  // Check if client wants SSE streaming
  const useStreaming = req.headers.accept === "text/event-stream";

  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable not set");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }

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

  try {
    const mimetype = req.file.mimetype || "";
    const originalName = req.file.originalname || "audio";
    const uploadPath = req.file.path;
    const fileSizeMB = req.file.size / 1024 / 1024;
    filesToCleanup.push(uploadPath);

    progress({
      stage: "received",
      progress: 5,
      message: "File received",
      detail: `${fileSizeMB.toFixed(1)} MB`,
    });

    // Read file from disk
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
    progress({
      stage: "analyzing",
      progress: 22,
      message: "Analyzing audio",
    });

    const audioDuration = await getAudioDuration(processedPath);
    const durationMinutes = audioDuration / 60;

    progress({
      stage: "analyzing",
      progress: 25,
      message: "Audio analyzed",
      detail: `${durationMinutes.toFixed(1)} minutes`,
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

    const compressedSizeMB = mp3Buffer.length / 1024 / 1024;
    progress({
      stage: "compressing",
      progress: 35,
      message: "Audio compressed",
      detail: `${compressedSizeMB.toFixed(1)} MB`,
    });

    const openai = new OpenAI({
      apiKey,
      timeout: 10 * 60 * 1000,
    });

    // Check if file is small enough for direct transcription
    if (mp3Buffer.length <= WHISPER_MAX_SIZE) {
      progress({
        stage: "transcribing",
        progress: 40,
        message: "Transcribing audio",
        detail: "Sending to OpenAI Whisper",
      });

      const result = await transcribeSingleFile(openai, mp3Path, "audio.mp3");

      progress({
        stage: "complete",
        progress: 100,
        message: "Transcription complete",
        detail: `${result.words.length} words`,
      });

      const responseData = {
        task: "transcribe",
        language: result.language,
        duration: result.duration,
        text: result.text,
        words: result.words,
      };

      if (useStreaming) {
        res.write(`data: ${JSON.stringify({ stage: "result", ...responseData })}\n\n`);
        res.end();
      } else {
        res.json(responseData);
      }
      return;
    }

    // File too large - need to split into chunks
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

    // Transcribe each chunk
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
      const timeRange = `${i * 10}:00 - ${(i + 1) * 10}:00`;

      progress({
        stage: "transcribing",
        progress: Math.round(chunkProgress),
        message: `Transcribing chunk ${i + 1} of ${chunkPaths.length}`,
        detail: timeRange,
      });

      const chunkResult = await transcribeSingleFile(openai, chunkPaths[i], `chunk-${i}.mp3`);
      results.push(chunkResult);

      progress({
        stage: "transcribing",
        progress: Math.round(chunkProgress + progressPerChunk * 0.9),
        message: `Chunk ${i + 1} complete`,
        detail: `${chunkResult.words.length} words`,
      });
    }

    // Merge all transcriptions
    progress({
      stage: "merging",
      progress: 96,
      message: "Merging transcriptions",
      detail: "Aligning timestamps",
    });

    const merged = mergeTranscriptions(results, CHUNK_DURATION);

    progress({
      stage: "complete",
      progress: 100,
      message: "Transcription complete",
      detail: `${merged.words.length} words total`,
    });

    const responseData = {
      task: "transcribe",
      language: merged.language,
      duration: merged.duration,
      text: merged.text,
      words: merged.words,
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
    if (error instanceof OpenAI.APIError) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
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
