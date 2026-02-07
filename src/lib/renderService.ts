import { VideoFormat, VideoTemplate, Word } from "./types";
import { WordTiming } from "../remotion/types";
import { toWordTimings } from "./clipTransform";

export interface RenderRequest {
  clipId: string;
  audioUrl: string;
  words: Word[];
  startTime: number;
  endTime: number;
  format: VideoFormat;
  template: VideoTemplate;
  outputDir: string;
  quality: "draft" | "standard" | "high";
}

export interface RenderProgress {
  jobId: string;
  progress: number;
  status: "rendering" | "completed" | "failed";
  outputPath?: string;
  error?: string;
}

// Convert Word (seconds) to WordTiming (frames)
export function wordsToFrameTiming(
  words: Word[],
  clipStartTime: number,
  fps: number = 30,
  clipEndTime: number = Number.POSITIVE_INFINITY
): WordTiming[] {
  return toWordTimings(words, clipStartTime, clipEndTime, fps);
}

// Calculate duration in frames
export function calculateDurationInFrames(
  startTime: number,
  endTime: number,
  fps: number = 30
): number {
  return Math.ceil((endTime - startTime) * fps);
}

// Get Remotion composition ID for format
export function getCompositionId(format: VideoFormat): string {
  return `ClipVideo-${format.replace(":", "-")}`;
}

// Quality settings
export const QUALITY_SETTINGS = {
  draft: {
    crf: 28,
    scale: 0.5,
  },
  standard: {
    crf: 23,
    scale: 1,
  },
  high: {
    crf: 18,
    scale: 1,
  },
};

// Generate render props for Remotion
export function generateRenderProps(request: RenderRequest) {
  const fps = 30;
  const durationInFrames = calculateDurationInFrames(request.startTime, request.endTime, fps);
  const wordTimings = wordsToFrameTiming(request.words, request.startTime, fps, request.endTime);
  const audioStartFrame = Math.floor(request.startTime * fps);
  const audioEndFrame = Math.ceil(request.endTime * fps);

  return {
    compositionId: getCompositionId(request.format),
    inputProps: {
      audioUrl: request.audioUrl,
      audioStartFrame,
      audioEndFrame,
      words: wordTimings,
      format: request.format,
      background: request.template.background,
      subtitle: request.template.subtitle,
      durationInFrames,
      fps,
    },
    codec: "h264" as const,
    ...QUALITY_SETTINGS[request.quality],
  };
}

// Placeholder render function - in production this would call Remotion CLI via Tauri
export async function renderClip(
  request: RenderRequest,
  onProgress?: (progress: number) => void
): Promise<string> {
  // For now, simulate rendering progress
  // In production, this would:
  // 1. Call Tauri backend to spawn Remotion CLI
  // 2. Parse progress from stdout
  // 3. Return the output path

  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    onProgress?.(Math.round((i / steps) * 100));
  }

  // Generate output filename
  const formatStr = request.format.replace(":", "x");
  const outputPath = `${request.outputDir}/clip_${request.clipId}_${formatStr}.mp4`;

  return outputPath;
}

// Batch render multiple clips/formats
export async function batchRender(
  requests: RenderRequest[],
  onJobProgress?: (jobId: string, progress: number) => void,
  onJobComplete?: (jobId: string, outputPath: string) => void,
  onJobError?: (jobId: string, error: string) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const request of requests) {
    try {
      const outputPath = await renderClip(request, (progress) => {
        onJobProgress?.(request.clipId, progress);
      });
      results.set(request.clipId, outputPath);
      onJobComplete?.(request.clipId, outputPath);
    } catch (error) {
      onJobError?.(request.clipId, error instanceof Error ? error.message : "Unknown error");
    }
  }

  return results;
}
