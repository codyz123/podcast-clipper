import { Router, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clips, projects, renderedClips } from "../db/schema.js";
import { uploadMediaFromPath } from "../lib/media-storage.js";
import {
  resolveCaptionStyle,
  toSubtitleConfig,
  toWordTimings,
  type SubtitleConfig,
  type CaptionStyle,
} from "../../shared/clipTransform.js";

const router = Router();

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  fps: number;
};

const getVideoMetadata = (filePath: string): VideoMetadata | null => {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -of json "${filePath}"`,
      { encoding: "utf-8" }
    );

    const data = JSON.parse(result) as { streams?: Array<Record<string, string>> };
    const stream = data.streams?.[0];
    if (!stream) {
      throw new Error("No video stream found");
    }

    const [num, den] = (stream.r_frame_rate || "30/1").split("/").map((value) => Number(value));

    return {
      duration: Number.parseFloat(stream.duration || "0"),
      width: Number.parseInt(stream.width, 10),
      height: Number.parseInt(stream.height, 10),
      fps: num / (den || 1),
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      console.warn("ffprobe not available; skipping render verification.");
      return null;
    }
    throw error;
  }
};

const verifyRender = (
  outputPath: string,
  expected: { duration: number; width: number; height: number }
) => {
  const actual = getVideoMetadata(outputPath);
  if (!actual) return;

  if (Math.abs(actual.duration - expected.duration) > 0.5) {
    throw new Error(
      `Duration mismatch: expected ${expected.duration.toFixed(1)}s, got ${actual.duration.toFixed(1)}s`
    );
  }

  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Resolution mismatch: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}`
    );
  }
};

const DEFAULT_BACKGROUND = {
  type: "gradient" as const,
  gradientColors: ["#667eea", "#764ba2"],
  gradientDirection: 135,
};

const FPS = 30;

type RenderJobStatus = "pending" | "rendering" | "completed" | "failed";

type BackgroundConfig = {
  type: "solid" | "gradient" | "image" | "video";
  color?: string;
  gradientColors?: string[];
  gradientDirection?: number;
  imagePath?: string;
  videoPath?: string;
};

type RenderJob = {
  id: string;
  clipId: string;
  format: string;
  status: RenderJobStatus;
  progress: number;
  overrides?: RenderOverrides;
  renderedClipUrl?: string;
  sizeBytes?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

type RawWord = {
  text?: string;
  start?: number;
  end?: number;
};

type TrackClipInput = {
  id?: string;
  type?: "audio" | "video" | "image" | "animation" | "text" | "caption";
  startTime?: number;
  duration?: number;
  assetUrl?: string;
  assetSource?: "lottie" | "giphy" | "tenor";
  positionX?: number;
  positionY?: number;
};

type TrackInput = {
  id?: string;
  type?: string;
  order?: number;
  clips?: TrackClipInput[];
  captionStyle?: CaptionStyle;
};

type RenderOverrides = {
  background?: BackgroundConfig;
  subtitle?: SubtitleConfig;
  captionStyle?: CaptionStyle;
  tracks?: TrackInput[];
  startTime?: number;
  endTime?: number;
  words?: RawWord[];
  renderScale?: number;
};

function getCompositionId(format: string): string {
  return `ClipVideo-${format.replace(":", "-")}`;
}

const renderJobs = new Map<string, RenderJob>();

const lottieCache = new Map<string, object>();

async function fetchLottieData(url: string): Promise<object | null> {
  if (lottieCache.has(url)) {
    return lottieCache.get(url) || null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;
    if (!data || !data.v || !data.fr || !data.w || !data.h) {
      console.warn(`Invalid Lottie format from ${url}`);
      return null;
    }

    lottieCache.set(url, data);
    return data;
  } catch (error) {
    console.error(`Failed to fetch Lottie from ${url}:`, error);
    return null;
  }
}

let bundlePromise: Promise<string> | null = null;

async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    const entry = path.join(process.cwd(), "src", "remotion", "index.ts");
    bundlePromise = bundle({
      entryPoint: entry,
      onProgress: () => {},
    });
  }
  return bundlePromise;
}

function setJob(jobId: string, updates: Partial<RenderJob>): RenderJob {
  const existing = renderJobs.get(jobId);
  if (!existing) {
    throw new Error(`Render job ${jobId} not found`);
  }
  const updated: RenderJob = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  renderJobs.set(jobId, updated);
  return updated;
}

async function runRenderJob(jobId: string): Promise<void> {
  const job = renderJobs.get(jobId);
  if (!job) return;

  try {
    setJob(jobId, { status: "rendering", progress: 0, errorMessage: undefined });

    const [clip] = await db.select().from(clips).where(eq(clips.id, job.clipId));
    if (!clip) {
      throw new Error("Clip not found");
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, clip.projectId));

    if (!project?.audioBlobUrl) {
      throw new Error("Episode audio is missing");
    }

    const overrides = job.overrides;
    const overrideTracks = overrides?.tracks;
    const overrideCaptionStyle = overrides?.captionStyle;
    const overrideBackground = overrides?.background;
    const resolvedTracks = Array.isArray(overrideTracks)
      ? overrideTracks
      : Array.isArray(clip.tracks)
        ? (clip.tracks as TrackInput[])
        : [];

    const clipStart =
      typeof overrides?.startTime === "number" ? overrides.startTime : (clip.startTime ?? 0);
    const clipEnd =
      typeof overrides?.endTime === "number" ? overrides.endTime : (clip.endTime ?? 0);
    const durationSeconds = Math.max(0.1, clipEnd - clipStart);
    const durationInFrames = Math.ceil(durationSeconds * FPS);

    const rawWords = Array.isArray(overrides?.words)
      ? (overrides?.words as RawWord[])
      : Array.isArray(clip.words)
        ? (clip.words as RawWord[])
        : [];
    const wordTimings = toWordTimings(rawWords, clipStart, clipEnd, FPS);

    const resolvedCaptionStyle = resolveCaptionStyle({
      captionStyle: clip.captionStyle as CaptionStyle | undefined,
      tracks: resolvedTracks,
    });
    const captionStyle = overrideCaptionStyle || resolvedCaptionStyle;

    const background =
      overrideBackground || (clip.background as BackgroundConfig | undefined) || DEFAULT_BACKGROUND;

    const subtitleOverride = overrides?.subtitle as SubtitleConfig | undefined;
    const subtitleConfig = subtitleOverride || toSubtitleConfig(captionStyle);

    const renderScale =
      typeof overrides?.renderScale === "number" && Number.isFinite(overrides.renderScale)
        ? Math.min(2, Math.max(0.25, overrides.renderScale))
        : 1;

    const overlayTracks = resolvedTracks
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((track) => track.type === "video-overlay");

    const preparedTracks = await Promise.all(
      overlayTracks.map(async (track) => {
        const rawClips = Array.isArray(track.clips) ? track.clips : [];
        const preparedClips = await Promise.all(
          rawClips
            .filter((clip) => clip.type === "animation" && clip.assetUrl)
            .map(async (clip) => {
              const startSeconds = Math.max(0, clip.startTime ?? 0);
              const durationSeconds = Math.max(0, clip.duration ?? 0);
              const startFrame = Math.floor(startSeconds * FPS);
              const durationFrames = Math.max(1, Math.ceil(durationSeconds * FPS));
              const availableFrames = Math.max(0, durationInFrames - startFrame);
              if (availableFrames <= 0) return null;

              const lottieData =
                clip.assetSource === "lottie" && clip.assetUrl
                  ? await fetchLottieData(clip.assetUrl)
                  : undefined;
              if (clip.assetSource === "lottie" && !lottieData) {
                return null;
              }

              return {
                id: clip.id || crypto.randomUUID(),
                type: "animation" as const,
                startFrame,
                durationFrames: Math.min(durationFrames, availableFrames),
                assetUrl: clip.assetUrl,
                assetSource: clip.assetSource,
                positionX: clip.positionX,
                positionY: clip.positionY,
                lottieData,
              };
            })
        );

        const clips = preparedClips.filter((clip): clip is NonNullable<typeof clip> => !!clip);
        if (clips.length === 0) return null;

        return {
          id: track.id || crypto.randomUUID(),
          type: "video-overlay" as const,
          order: track.order,
          clips,
        };
      })
    );

    const renderTracks = preparedTracks.filter(
      (track): track is NonNullable<typeof track> => !!track
    );

    const props = {
      audioUrl: project.audioBlobUrl,
      audioStartFrame: Math.floor(clipStart * FPS),
      audioEndFrame: Math.ceil(clipEnd * FPS),
      words: wordTimings,
      format: job.format,
      background,
      subtitle: subtitleConfig,
      durationInFrames,
      fps: FPS,
      tracks: renderTracks.length > 0 ? renderTracks : undefined,
    };

    const renderDir = path.join(process.cwd(), ".context", "renders");
    fs.mkdirSync(renderDir, { recursive: true });

    const outputPath = path.join(
      renderDir,
      `${job.clipId}-${job.format.replace(":", "-")}-${Date.now()}-${crypto.randomUUID()}.mp4`
    );

    const serveUrl = await getBundle();
    const compositionId = getCompositionId(job.format);
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: props,
    });

    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: props,
      scale: renderScale,
      crf: 18,
      pixelFormat: "yuv420p",
      onProgress: (progress) => {
        setJob(jobId, { progress: Math.round(progress.progress * 100) });
      },
    });

    verifyRender(outputPath, {
      duration: durationSeconds,
      width: composition.width,
      height: composition.height,
    });

    const { url, size } = await uploadMediaFromPath(
      outputPath,
      path.basename(outputPath),
      "video/mp4",
      `rendered/${job.clipId}`
    );

    fs.unlinkSync(outputPath);

    await db.insert(renderedClips).values({
      clipId: job.clipId,
      format: job.format,
      blobUrl: url,
      sizeBytes: size,
    });

    setJob(jobId, {
      status: "completed",
      progress: 100,
      renderedClipUrl: url,
      sizeBytes: size,
    });
  } catch (error) {
    setJob(jobId, {
      status: "failed",
      errorMessage: (error as Error).message,
    });
  }
}

router.post("/render/clip", async (req: Request, res: Response) => {
  try {
    const { clipId, format, force, overrides } = req.body as {
      clipId?: string;
      format?: string;
      force?: boolean;
      overrides?: RenderOverrides;
    };

    if (!clipId || !format) {
      res.status(400).json({ error: "clipId and format are required" });
      return;
    }

    const existing = await db
      .select()
      .from(renderedClips)
      .where(eq(renderedClips.clipId, clipId))
      .orderBy(desc(renderedClips.renderedAt));

    const match = existing.find((clip) => clip.format === format);
    const [clipMeta] = await db
      .select({ updatedAt: clips.updatedAt })
      .from(clips)
      .where(eq(clips.id, clipId));
    const hasOverrides = !!(
      overrides &&
      (overrides.background ||
        overrides.subtitle ||
        overrides.captionStyle ||
        overrides.tracks ||
        typeof overrides.startTime === "number" ||
        typeof overrides.endTime === "number" ||
        (Array.isArray(overrides.words) && overrides.words.length > 0) ||
        (typeof overrides.renderScale === "number" && overrides.renderScale !== 1))
    );

    const clipUpdatedAt = clipMeta?.updatedAt ? new Date(clipMeta.updatedAt) : null;
    const renderedAt = match?.renderedAt ? new Date(match.renderedAt) : null;
    const isStale = Boolean(clipUpdatedAt && renderedAt && clipUpdatedAt > renderedAt);

    if (match && !force && !hasOverrides && !isStale) {
      res.json({
        status: "completed",
        progress: 100,
        renderedClipUrl: match.blobUrl,
        sizeBytes: match.sizeBytes ?? undefined,
        format: match.format,
        reused: true,
      });
      return;
    }

    const existingJob = Array.from(renderJobs.values()).find(
      (job) =>
        job.clipId === clipId &&
        job.format === format &&
        (job.status === "pending" || job.status === "rendering")
    );

    if (existingJob && !force && !hasOverrides && !isStale) {
      res.json({
        jobId: existingJob.id,
        status: existingJob.status,
        progress: existingJob.progress,
        renderedClipUrl: existingJob.renderedClipUrl,
        sizeBytes: existingJob.sizeBytes,
        errorMessage: existingJob.errorMessage,
        reused: true,
      });
      return;
    }

    const jobId = crypto.randomUUID();
    const job: RenderJob = {
      id: jobId,
      clipId,
      format,
      status: "pending",
      progress: 0,
      overrides: hasOverrides ? overrides : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    renderJobs.set(jobId, job);
    void runRenderJob(jobId);

    res.json({ jobId, status: job.status, progress: job.progress, reused: false });
  } catch (error) {
    console.error("Failed to render clip:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/render/clip/:jobId/status", async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = renderJobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Render job not found" });
    return;
  }

  res.json(job);
});

export const renderRouter = router;
