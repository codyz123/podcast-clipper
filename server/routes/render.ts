import { Router, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { desc, eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clips,
  projects,
  renderedClips,
  videoSources,
  transcripts,
  podcastPeople,
  mediaAssets,
  episodeTimelines,
  episodeRenderJobs,
  renderedEpisodes,
  podcastBrandingAssets,
} from "../db/schema.js";
import { uploadMediaFromPath } from "../lib/media-storage.js";
import {
  resolveCaptionStyle,
  toSubtitleConfig,
  toWordTimings,
  type SubtitleConfig,
  type CaptionStyle,
} from "../../shared/clipTransform.js";
import { computeWordGroups, speakerBreakIndicesFromTimes } from "../../shared/computeWordGroups.js";
import {
  computeSwitchingTimeline,
  applyPreRoll,
  toFrameTimeline,
} from "../../shared/multicamTransform.js";

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
  videoStartFrame?: number;
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
  assetSource?:
    | "lottie"
    | "giphy"
    | "tenor"
    | "waveform"
    | "youtube-cta"
    | "apple-podcasts-cta"
    | "branding";
  positionX?: number;
  positionY?: number;
  scale?: number;
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

type EpisodeTrackItem = {
  id: string;
  type: "video" | "audio" | "image" | "text" | "caption" | "transition";
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  mediaSourceId?: string;
  mediaSourceType?: "video-source" | "media-asset" | "episode-audio" | "branding";
  resolvedUrl?: string;
  positionX?: number;
  positionY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  speed?: number;
};

type EpisodeTrack = {
  id: string;
  type: string;
  order: number;
  muted: boolean;
  visible: boolean;
  solo: boolean;
  volume: number;
  opacity: number;
  items: EpisodeTrackItem[];
};

type EpisodeRenderSnapshot = {
  timelineId: string;
  tracks: EpisodeTrack[];
  background: BackgroundConfig;
  fps: number;
  startTime: number;
  endTime: number;
  format: "16:9";
};

function toFiniteNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clipTracksToRange(
  tracks: EpisodeTrack[],
  startTime: number,
  endTime: number
): EpisodeTrack[] {
  return tracks.map((track) => {
    const clippedItems = (track.items || []).flatMap((item) => {
      const itemStart = Math.max(0, toFiniteNumber(item.startTime, 0));
      const itemDuration = Math.max(0, toFiniteNumber(item.duration, 0));
      const itemEnd = itemStart + itemDuration;

      const overlapStart = Math.max(itemStart, startTime);
      const overlapEnd = Math.min(itemEnd, endTime);
      if (overlapEnd <= overlapStart) return [];

      const speed = toFiniteNumber(item.speed, 1);
      const safeSpeed = speed > 0 ? speed : 1;
      const offsetIntoItem = overlapStart - itemStart;
      const sourceIn = toFiniteNumber(item.sourceIn, 0) + offsetIntoItem * safeSpeed;
      const duration = overlapEnd - overlapStart;
      const sourceOut = sourceIn + duration * safeSpeed;

      return [
        {
          ...item,
          startTime: overlapStart - startTime,
          duration,
          sourceIn,
          sourceOut,
          speed: safeSpeed,
        },
      ];
    });

    return {
      ...track,
      items: clippedItems,
    };
  });
}

async function resolveEpisodeMediaMap(
  projectId: string,
  podcastId?: string | null
): Promise<{
  map: Map<string, string>;
  episodeAudioUrl: string;
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error("Episode not found");
  }

  const [sources, assets, brandingAssets] = await Promise.all([
    db
      .select({
        id: videoSources.id,
        videoBlobUrl: videoSources.videoBlobUrl,
        audioBlobUrl: videoSources.audioBlobUrl,
      })
      .from(videoSources)
      .where(eq(videoSources.projectId, projectId)),
    db
      .select({
        id: mediaAssets.id,
        blobUrl: mediaAssets.blobUrl,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, projectId)),
    podcastId
      ? db
          .select({
            id: podcastBrandingAssets.id,
            blobUrl: podcastBrandingAssets.blobUrl,
          })
          .from(podcastBrandingAssets)
          .where(eq(podcastBrandingAssets.podcastId, podcastId))
      : Promise.resolve([] as Array<{ id: string; blobUrl: string }>),
  ]);

  const map = new Map<string, string>();
  for (const source of sources) {
    if (source.videoBlobUrl) map.set(source.id, source.videoBlobUrl);
  }
  for (const asset of assets) {
    if (asset.blobUrl) map.set(asset.id, asset.blobUrl);
  }
  for (const branding of brandingAssets) {
    if (branding.blobUrl) map.set(branding.id, branding.blobUrl);
  }

  const episodeAudioUrl = project.mixedAudioBlobUrl || project.audioBlobUrl || "";
  if (episodeAudioUrl) {
    map.set(projectId, episodeAudioUrl);
  }

  return { map, episodeAudioUrl };
}

function attachResolvedUrls(
  tracks: EpisodeTrack[],
  mediaUrlMap: Map<string, string>,
  episodeAudioUrl: string
): EpisodeTrack[] {
  return tracks.map((track) => ({
    ...track,
    items: (track.items || []).map((item) => {
      let resolvedUrl = item.resolvedUrl || "";
      if (!resolvedUrl && item.mediaSourceId) {
        resolvedUrl = mediaUrlMap.get(item.mediaSourceId) || "";
      }
      if (!resolvedUrl && item.mediaSourceType === "episode-audio") {
        resolvedUrl = episodeAudioUrl;
      }

      return {
        ...item,
        resolvedUrl: resolvedUrl || undefined,
      };
    }),
  }));
}

async function updateEpisodeJob(
  jobId: string,
  updates: Partial<{
    status: string;
    progress: number;
    currentChunk: number | null;
    totalChunks: number | null;
    errorMessage: string | null;
    blobUrl: string | null;
    sizeBytes: number | null;
    completedAt: Date | null;
  }>
) {
  await db
    .update(episodeRenderJobs)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(episodeRenderJobs.id, jobId));
}

async function runEpisodeRenderJob(jobId: string): Promise<void> {
  try {
    const [job] = await db.select().from(episodeRenderJobs).where(eq(episodeRenderJobs.id, jobId));
    if (!job) return;

    const snapshot = job.timelineSnapshot as EpisodeRenderSnapshot;
    if (!snapshot || !snapshot.tracks || !snapshot.background) {
      throw new Error("Episode render job has invalid timeline snapshot");
    }

    await updateEpisodeJob(jobId, {
      status: "rendering",
      progress: 0,
      errorMessage: null,
    });

    const [project] = await db.select().from(projects).where(eq(projects.id, job.projectId));
    if (!project) {
      throw new Error("Episode not found");
    }

    const { map: mediaUrlMap, episodeAudioUrl } = await resolveEpisodeMediaMap(
      job.projectId,
      project.podcastId
    );
    const hydratedTracks = attachResolvedUrls(snapshot.tracks, mediaUrlMap, episodeAudioUrl);

    const renderDurationSeconds = Math.max(0.1, snapshot.endTime - snapshot.startTime);
    const renderFps = Math.max(1, Math.round(toFiniteNumber(snapshot.fps, FPS)));
    const durationInFrames = Math.max(1, Math.ceil(renderDurationSeconds * renderFps));

    const props = {
      tracks: hydratedTracks,
      background: snapshot.background || DEFAULT_BACKGROUND,
      durationInFrames,
      fps: renderFps,
    };

    const renderDir = path.join(process.cwd(), ".context", "renders");
    fs.mkdirSync(renderDir, { recursive: true });
    const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputName = `episode-${job.projectId}-${safeTimestamp}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(renderDir, outputName);

    const serveUrl = await getBundle();
    const composition = await selectComposition({
      serveUrl,
      id: "EpisodeVideo-16-9",
      inputProps: props,
    });

    let lastProgress = -1;
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: props,
      crf: 18,
      pixelFormat: "yuv420p",
      onProgress: (progress) => {
        const nextProgress = Math.round(progress.progress * 100);
        if (nextProgress === lastProgress) return;
        lastProgress = nextProgress;
        void updateEpisodeJob(jobId, { progress: nextProgress });
      },
    });

    verifyRender(outputPath, {
      duration: renderDurationSeconds,
      width: composition.width,
      height: composition.height,
    });

    const { url, size } = await uploadMediaFromPath(
      outputPath,
      outputName,
      "video/mp4",
      `rendered/episodes/${job.projectId}`
    );

    fs.unlinkSync(outputPath);

    const [renderedEpisode] = await db
      .insert(renderedEpisodes)
      .values({
        projectId: job.projectId,
        timelineId: snapshot.timelineId,
        name: `Episode Export ${new Date().toLocaleString()}`,
        format: snapshot.format,
        blobUrl: url,
        sizeBytes: size,
        durationSeconds: renderDurationSeconds,
      })
      .returning({ id: renderedEpisodes.id });

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        projectId: job.projectId,
        type: "video",
        name: `Episode Export ${new Date().toLocaleString()}`,
        category: "nle-export",
        blobUrl: url,
        contentType: "video/mp4",
        sizeBytes: size,
        durationSeconds: renderDurationSeconds,
        width: composition.width,
        height: composition.height,
        fps: renderFps,
      })
      .returning({ id: mediaAssets.id });

    await updateEpisodeJob(jobId, {
      status: "completed",
      progress: 100,
      blobUrl: url,
      sizeBytes: size,
      completedAt: new Date(),
      errorMessage: null,
    });

    console.warn(
      `[EpisodeRender] Completed job ${jobId} -> renderedEpisode=${renderedEpisode.id} mediaAsset=${asset.id}`
    );
  } catch (error) {
    await updateEpisodeJob(jobId, {
      status: "failed",
      errorMessage: (error as Error).message,
    });
  }
}

function getCompositionId(format: string, isMulticam: boolean = false): string {
  const prefix = isMulticam ? "MulticamClipVideo" : "ClipVideo";
  return `${prefix}-${format.replace(":", "-")}`;
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

async function prefetchImageAsDataUri(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
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
    const isVideoBackground = background.type === "video" && !!background.videoPath;
    const isMulticam = project?.mediaType === "video" && !isVideoBackground;

    const subtitleOverride = overrides?.subtitle as SubtitleConfig | undefined;
    const subtitleConfig = subtitleOverride || toSubtitleConfig(captionStyle);

    // Compute speaker-aware group boundaries when breakOnSpeakerChange is enabled.
    // Mirror the editor's fallback: if clip segments are empty or lack speakerIds,
    // fall back to transcript-level segments (which always have speaker data).
    let effectiveSegments = Array.isArray(clip.segments)
      ? (clip.segments as Array<{ startTime: number; endTime: number; speakerId?: string }>)
      : [];
    if (
      captionStyle.breakOnSpeakerChange &&
      (!effectiveSegments.length || !effectiveSegments.some((s) => s.speakerId))
    ) {
      const [transcript] = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.projectId, clip.projectId))
        .limit(1);
      if (transcript?.segments && Array.isArray(transcript.segments)) {
        effectiveSegments = transcript.segments as typeof effectiveSegments;
      }
    }
    let groupBoundaries: Array<{ start: number; end: number }> | undefined;

    if (
      captionStyle.breakOnSpeakerChange &&
      effectiveSegments.length > 0 &&
      wordTimings.length > 0
    ) {
      const breakIndices = speakerBreakIndicesFromTimes(effectiveSegments, wordTimings, clipStart);
      groupBoundaries = computeWordGroups(
        wordTimings.length,
        subtitleConfig.wordsPerGroup,
        breakIndices
      );
    }

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
            .filter(
              (clip) =>
                (clip.type === "animation" && clip.assetUrl) ||
                (clip.type === "image" && clip.assetSource === "branding" && clip.assetUrl)
            )
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

              // Pre-fetch branding asset images as data URIs so Remotion's
              // headless Chromium can always access them (avoids CORS / localhost issues).
              let resolvedAssetUrl = clip.assetUrl;
              if (clip.assetSource === "branding" && clip.assetUrl) {
                try {
                  resolvedAssetUrl = await prefetchImageAsDataUri(clip.assetUrl);
                } catch (e) {
                  console.warn("Failed to pre-fetch branding asset, using original URL:", e);
                }
              }

              return {
                id: clip.id || crypto.randomUUID(),
                type: clip.type as "animation" | "image",
                startFrame,
                durationFrames: Math.min(durationFrames, availableFrames),
                assetUrl: resolvedAssetUrl,
                assetSource: clip.assetSource,
                positionX: clip.positionX,
                positionY: clip.positionY,
                scale: clip.scale,
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

    // Build speaker overlay data from the speaker track
    const speakerTrack = resolvedTracks.find((t) => t.type === "speaker");
    let speakerConfig:
      | {
          displayMode: "fill" | "circle";
          nameFormat: "off" | "first-name" | "full-name";
          clips: Array<{
            startFrame: number;
            endFrame: number;
            speakerLabel: string;
            personId?: string;
            colorIndex: number;
          }>;
          people: Array<{ id: string; name: string; photoUrl?: string }>;
        }
      | undefined;

    if (speakerTrack && Array.isArray(speakerTrack.clips) && speakerTrack.clips.length > 0) {
      // Query podcast people for this project's podcast
      const people = project?.podcastId
        ? await db
            .select()
            .from(podcastPeople)
            .where(eq(podcastPeople.podcastId, project.podcastId))
        : [];

      // Deduplicate speaker labels in order of first appearance (matches editor)
      const orderedLabels: string[] = [];
      for (const c of speakerTrack.clips as TrackClipInput[]) {
        const label = (c as Record<string, unknown>).assetId as string | undefined;
        if (label && !orderedLabels.includes(label)) {
          orderedLabels.push(label);
        }
      }

      // Build frame-based speaker clips
      const speakerClips = (
        speakerTrack.clips as Array<TrackClipInput & { assetId?: string }>
      ).flatMap((c) => {
        const speakerLabel = c.assetId;
        if (!speakerLabel) return [];

        const startSeconds = Math.max(0, c.startTime ?? 0);
        const durationSec = Math.max(0, c.duration ?? 0);
        return [
          {
            startFrame: Math.floor(startSeconds * FPS),
            endFrame: Math.floor(startSeconds * FPS) + Math.ceil(durationSec * FPS),
            speakerLabel,
            personId: c.assetUrl || undefined,
            colorIndex: orderedLabels.indexOf(speakerLabel),
          },
        ];
      });

      // Collect referenced person IDs
      const referencedPersonIds = new Set(speakerClips.map((c) => c.personId).filter(Boolean));

      // Pre-fetch speaker photos as data URIs for reliable Remotion access
      const speakerPeople = await Promise.all(
        people
          .filter((p) => referencedPersonIds.has(p.id))
          .map(async (p) => {
            let photoUrl = p.photoUrl || undefined;
            if (photoUrl) {
              try {
                photoUrl = await prefetchImageAsDataUri(photoUrl);
              } catch (e) {
                console.warn(`Failed to pre-fetch speaker photo for ${p.name}:`, e);
              }
            }
            return { id: p.id, name: p.name, photoUrl };
          })
      );

      const displayMode =
        ((speakerTrack as Record<string, unknown>).speakerDisplayMode as string) || "fill";
      const nameFormat =
        ((speakerTrack as Record<string, unknown>).speakerNameFormat as string) || "full-name";

      speakerConfig = {
        displayMode: displayMode as "fill" | "circle",
        nameFormat: nameFormat as "off" | "first-name" | "full-name",
        clips: speakerClips,
        people: speakerPeople,
      };
    }

    // Build base props (shared between audio and multicam)
    const baseProps = {
      audioStartFrame: Math.floor(clipStart * FPS),
      audioEndFrame: Math.ceil(clipEnd * FPS),
      words: wordTimings,
      format: job.format,
      background: isVideoBackground
        ? {
            ...background,
            videoStartFrame: Math.floor(clipStart * FPS),
          }
        : background,
      subtitle: subtitleConfig,
      durationInFrames,
      fps: FPS,
      tracks: renderTracks.length > 0 ? renderTracks : undefined,
      groupBoundaries,
      speaker: speakerConfig,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let props: Record<string, any>;

    if (isMulticam) {
      // Fetch video sources and transcript segments for multicam
      const [sources, transcriptRows] = await Promise.all([
        db
          .select()
          .from(videoSources)
          .where(eq(videoSources.projectId, clip.projectId))
          .orderBy(asc(videoSources.displayOrder)),
        db.select().from(transcripts).where(eq(transcripts.projectId, clip.projectId)),
      ]);

      // Resolve audio URL
      let audioUrl = project?.mixedAudioBlobUrl || "";
      if (project?.primaryAudioSourceId) {
        const primarySource = sources.find((s) => s.id === project.primaryAudioSourceId);
        audioUrl = primarySource?.audioBlobUrl || audioUrl;
      }
      if (!audioUrl && sources.length > 0) {
        // Fall back to first speaker source's audio
        const firstSpeaker = sources.find((s) => s.sourceType === "speaker" && s.audioBlobUrl);
        audioUrl = firstSpeaker?.audioBlobUrl || sources[0].audioBlobUrl || "";
      }
      if (!audioUrl) {
        audioUrl = project?.audioBlobUrl || "";
      }

      // Get speaker segments from transcript
      const transcript = transcriptRows[0];
      const segments =
        (transcript?.segments as Array<{
          speakerLabel: string;
          startTime: number;
          endTime: number;
        }>) || [];

      // Get multicam layout from clip
      const multicamLayout = clip.multicamLayout as {
        mode?: string;
        pipEnabled?: boolean;
        pipScale?: number;
        pipPositions?: Array<{ videoSourceId: string; positionX: number; positionY: number }>;
        overrides?: Array<{ startTime: number; endTime: number; activeVideoSourceId: string }>;
        transitionStyle?: string;
        transitionDurationFrames?: number;
        soloSourceId?: string;
      } | null;

      // Build switching timeline
      const layoutSources = sources.map((s) => ({
        id: s.id,
        label: s.label,
        personId: s.personId,
        sourceType: s.sourceType,
        syncOffsetMs: s.syncOffsetMs,
        cropOffsetX: s.cropOffsetX,
        cropOffsetY: s.cropOffsetY,
        width: s.width,
        height: s.height,
        displayOrder: s.displayOrder,
      }));

      const switchingConfig = {
        defaultVideoSourceId: project?.defaultVideoSourceId || undefined,
        holdPreviousMs: 1500,
        minShotDurationMs: 1500,
        overrides: multicamLayout?.overrides,
      };

      let switchTimeline = computeSwitchingTimeline(
        clipStart,
        clipEnd,
        segments,
        layoutSources,
        switchingConfig
      );
      switchTimeline = applyPreRoll(switchTimeline);
      const frameTimeline = toFrameTimeline(switchTimeline, clipStart, FPS);

      props = {
        ...baseProps,
        audioUrl,
        videoSources: sources.map((s) => ({
          id: s.id,
          label: s.label,
          videoUrl: s.videoBlobUrl, // Full-res for rendering
          syncOffsetMs: s.syncOffsetMs,
          sourceType: s.sourceType,
          cropOffsetX: s.cropOffsetX,
          cropOffsetY: s.cropOffsetY,
          width: s.width || 1920,
          height: s.height || 1080,
        })),
        switchingTimeline: frameTimeline,
        layoutMode: multicamLayout?.mode || "active-speaker",
        pipEnabled: multicamLayout?.pipEnabled || false,
        pipPositions: multicamLayout?.pipPositions || [],
        pipScale: multicamLayout?.pipScale || 0.2,
        clipStartTimeSeconds: clipStart,
        transitionStyle: multicamLayout?.transitionStyle || "cut",
        transitionDurationFrames: multicamLayout?.transitionDurationFrames || 3,
      };
    } else {
      // Standard audio-only render, or single-video background mode
      const resolvedAudioUrl =
        (isVideoBackground ? background.videoPath || "" : "") ||
        project?.mixedAudioBlobUrl ||
        project?.audioBlobUrl ||
        "";
      if (!resolvedAudioUrl && !isVideoBackground) {
        throw new Error("Episode audio is missing");
      }
      props = {
        ...baseProps,
        // For single-video clips we still prefer explicit audio track, but allow empty as fallback.
        audioUrl: resolvedAudioUrl,
      };
    }

    const renderDir = path.join(process.cwd(), ".context", "renders");
    fs.mkdirSync(renderDir, { recursive: true });

    const outputPath = path.join(
      renderDir,
      `${job.clipId}-${job.format.replace(":", "-")}-${Date.now()}-${crypto.randomUUID()}.mp4`
    );

    const serveUrl = await getBundle();
    const compositionId = getCompositionId(job.format, isMulticam);
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

router.post("/render/episode", async (req: Request, res: Response) => {
  try {
    const { projectId, startTime, endTime } = req.body as {
      projectId?: string;
      startTime?: number;
      endTime?: number;
    };

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    const [timeline] = await db
      .select()
      .from(episodeTimelines)
      .where(eq(episodeTimelines.projectId, projectId));

    if (!timeline) {
      res.status(404).json({ error: "Episode timeline not found. Initialize timeline first." });
      return;
    }

    const timelineTracks = Array.isArray(timeline.tracks)
      ? (timeline.tracks as EpisodeTrack[])
      : [];
    const derivedDuration = timelineTracks.reduce((maxTrack, track) => {
      const trackMax = (track.items || []).reduce((maxItem, item) => {
        const itemStart = Math.max(0, toFiniteNumber(item.startTime, 0));
        const itemDuration = Math.max(0, toFiniteNumber(item.duration, 0));
        return Math.max(maxItem, itemStart + itemDuration);
      }, 0);
      return Math.max(maxTrack, trackMax);
    }, 0);
    const totalDuration = Math.max(
      0.1,
      toFiniteNumber(timeline.duration, 0) > 0
        ? toFiniteNumber(timeline.duration, 0)
        : derivedDuration
    );

    const safeStart = Math.max(0, Math.min(totalDuration, toFiniteNumber(startTime, 0)));
    const requestedEnd = toFiniteNumber(endTime, totalDuration);
    const safeEnd = Math.max(safeStart + 0.1, Math.min(totalDuration, requestedEnd));

    const existing = await db
      .select()
      .from(episodeRenderJobs)
      .where(eq(episodeRenderJobs.projectId, projectId))
      .orderBy(desc(episodeRenderJobs.createdAt));
    const inflight = existing.find((row) => row.status === "pending" || row.status === "rendering");
    if (inflight) {
      const inflightSnapshot = inflight.timelineSnapshot as EpisodeRenderSnapshot | undefined;
      const sameRange = Boolean(
        inflightSnapshot &&
        Math.abs(toFiniteNumber(inflightSnapshot.startTime, -1) - safeStart) < 0.001 &&
        Math.abs(toFiniteNumber(inflightSnapshot.endTime, -1) - safeEnd) < 0.001
      );

      if (!sameRange) {
        res.status(409).json({
          error: "Another episode export is already in progress. Wait for it to finish.",
          jobId: inflight.id,
          status: inflight.status,
          progress: inflight.progress,
        });
        return;
      }

      res.json({
        jobId: inflight.id,
        status: inflight.status,
        progress: inflight.progress,
        blobUrl: inflight.blobUrl,
        sizeBytes: inflight.sizeBytes,
        reused: true,
      });
      return;
    }

    const clippedTracks = clipTracksToRange(timelineTracks, safeStart, safeEnd);
    const snapshot: EpisodeRenderSnapshot = {
      timelineId: timeline.id,
      tracks: clippedTracks,
      background: (timeline.background as BackgroundConfig | undefined) || DEFAULT_BACKGROUND,
      fps: toFiniteNumber(timeline.fps, FPS),
      startTime: safeStart,
      endTime: safeEnd,
      format: "16:9",
    };

    const [job] = await db
      .insert(episodeRenderJobs)
      .values({
        projectId,
        timelineSnapshot: snapshot,
        status: "pending",
        progress: 0,
      })
      .returning({
        id: episodeRenderJobs.id,
        status: episodeRenderJobs.status,
        progress: episodeRenderJobs.progress,
      });

    void runEpisodeRenderJob(job.id);

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      reused: false,
    });
  } catch (error) {
    console.error("Failed to render episode:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/render/episode/:jobId/status", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const [job] = await db.select().from(episodeRenderJobs).where(eq(episodeRenderJobs.id, jobId));

    if (!job) {
      res.status(404).json({ error: "Episode render job not found" });
      return;
    }

    res.json(job);
  } catch (error) {
    console.error("Failed to fetch episode render job status:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// List rendered clips for a project
router.get("/render/clips/:projectId", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    const results = await db
      .select({
        id: renderedClips.id,
        clipId: renderedClips.clipId,
        clipName: clips.name,
        format: renderedClips.format,
        blobUrl: renderedClips.blobUrl,
        sizeBytes: renderedClips.sizeBytes,
        renderedAt: renderedClips.renderedAt,
      })
      .from(renderedClips)
      .innerJoin(clips, eq(renderedClips.clipId, clips.id))
      .where(eq(clips.projectId, projectId))
      .orderBy(desc(renderedClips.renderedAt));

    res.json({ renderedClips: results });
  } catch (error) {
    console.error("Failed to list rendered clips:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete a rendered clip
router.delete("/render/clips/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    await db.delete(renderedClips).where(eq(renderedClips.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete rendered clip:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const renderRouter = router;
