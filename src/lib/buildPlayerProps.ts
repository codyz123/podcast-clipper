/**
 * Pure functions to convert client-side clip data into Remotion composition props.
 *
 * Used by PlayerPreview to build inputProps for the Remotion <Player>.
 * The server render route (server/routes/render.ts) has its own prop-building
 * logic that pre-fetches assets as data URIs — this module uses getMediaUrl()
 * to proxy URLs through the API for browser access instead.
 */

import type {
  Clip,
  VideoFormat,
  PodcastPerson,
  SpeakerNameFormat,
  BackgroundConfig,
  VideoSource as EpisodeVideoSource,
} from "./types";
import { getMediaUrl } from "./api";
import {
  resolveCaptionStyle,
  toSubtitleConfig,
  toWordTimings,
  type SubtitleConfig,
} from "./clipTransform";
import { computeWordGroups, speakerBreakIndicesFromTimes } from "./computeWordGroups";
import type {
  ClipVideoProps,
  MulticamClipVideoProps,
  TrackData,
  TrackClipData,
  SpeakerOverlayConfig,
  SpeakerClipData,
  SpeakerPerson,
  MulticamVideoSource,
} from "../remotion/types";
import {
  computeSwitchingTimeline,
  applyPreRoll,
  toFrameTimeline,
  type SpeakerSegmentLike,
  type LayoutMode,
  type PipPosition,
  type MulticamOverride,
} from "../../shared/multicamTransform";

const FPS = 30;

// ============ Input types ============

export interface BuildPlayerPropsInput {
  clip: Clip;
  format: VideoFormat;
  audioUrl: string;
  captionSpeakerSegments?: Array<{ startTime: number; endTime: number }>;
  speakerPeople?: PodcastPerson[];
  speakerDisplayMode?: "fill" | "circle";
  speakerNameFormat?: SpeakerNameFormat;
  podcast?: {
    name: string;
    coverImageUrl?: string;
    author?: string;
    category?: string;
  };
}

export interface BuildMulticamPropsInput extends BuildPlayerPropsInput {
  videoSources: EpisodeVideoSource[];
  segments: SpeakerSegmentLike[];
  layoutMode: LayoutMode;
  pipEnabled: boolean;
  pipPositions: PipPosition[];
  pipScale: number;
  defaultVideoSourceId?: string;
  multicamOverrides?: MulticamOverride[];
  transitionStyle: "cut" | "crossfade";
}

export interface BuildPlayerPropsResult {
  props: ClipVideoProps;
  subtitleConfig: SubtitleConfig;
}

export interface BuildMulticamPropsResult {
  props: MulticamClipVideoProps;
  subtitleConfig: SubtitleConfig;
}

// ============ Main functions ============

export function buildPlayerProps(input: BuildPlayerPropsInput): BuildPlayerPropsResult {
  const {
    clip,
    format,
    audioUrl,
    captionSpeakerSegments,
    speakerPeople,
    speakerDisplayMode,
    speakerNameFormat,
    podcast,
  } = input;

  const clipDuration = clip.endTime - clip.startTime;
  const durationInFrames = Math.max(1, Math.ceil(clipDuration * FPS));

  // Caption config
  const captionStyle = resolveCaptionStyle(clip);
  const subtitleConfig = toSubtitleConfig(captionStyle);

  // Word timings
  const words = toWordTimings(clip.words, clip.startTime, clip.endTime, FPS);

  // Group boundaries (for speaker-break-aware caption grouping)
  let groupBoundaries: Array<{ start: number; end: number }> | undefined;
  if (subtitleConfig.breakOnSpeakerChange && captionSpeakerSegments?.length) {
    const breakIndices = speakerBreakIndicesFromTimes(
      captionSpeakerSegments,
      words,
      clip.startTime
    );
    groupBoundaries = computeWordGroups(words.length, subtitleConfig.wordsPerGroup, breakIndices);
  }

  // Background with fallback
  const background: BackgroundConfig = clip.background || {
    type: "solid",
    color: "#000000",
  };

  // Track data conversion (time-based → frame-based)
  const tracks = buildTrackData(clip);

  // Speaker overlay config
  const speaker = buildSpeakerConfig(clip, speakerPeople, speakerDisplayMode, speakerNameFormat);

  // Audio frame boundaries — tells Remotion which slice of the source audio to play.
  // Without these, clips that don't start at 0s would play the wrong audio.
  const audioStartFrame = Math.floor(clip.startTime * FPS);
  const audioEndFrame = Math.ceil(clip.endTime * FPS);

  const props: ClipVideoProps = {
    audioUrl,
    audioStartFrame,
    audioEndFrame,
    words,
    format,
    background,
    subtitle: subtitleConfig,
    durationInFrames,
    fps: FPS,
    tracks: tracks.length > 0 ? tracks : undefined,
    podcast,
    groupBoundaries,
    speaker,
  };

  return { props, subtitleConfig };
}

export function buildMulticamPlayerProps(input: BuildMulticamPropsInput): BuildMulticamPropsResult {
  const {
    videoSources,
    segments,
    layoutMode,
    pipEnabled,
    pipPositions,
    pipScale,
    defaultVideoSourceId,
    multicamOverrides,
    transitionStyle,
    clip,
  } = input;

  // Build base props
  const { props: baseProps, subtitleConfig } = buildPlayerProps(input);

  // Convert video sources with proxied URLs
  const multicamSources: MulticamVideoSource[] = videoSources.map((s) => ({
    id: s.id,
    label: s.label,
    videoUrl: getMediaUrl(s.proxyBlobUrl || s.videoBlobUrl) || "",
    syncOffsetMs: s.syncOffsetMs,
    sourceType: s.sourceType,
    cropOffsetX: s.cropOffsetX,
    cropOffsetY: s.cropOffsetY,
    width: s.width || 1920,
    height: s.height || 1080,
  }));

  // Compute switching timeline
  const layoutSources = videoSources.map((s) => ({
    id: s.id,
    label: s.label,
    personId: s.personId,
    sourceType: s.sourceType,
    syncOffsetMs: s.syncOffsetMs,
    cropOffsetX: s.cropOffsetX,
    cropOffsetY: s.cropOffsetY,
    width: s.width,
    height: s.height,
    displayOrder: 0,
  }));

  const rawTimeline = computeSwitchingTimeline(
    clip.startTime,
    clip.endTime,
    segments,
    layoutSources,
    {
      defaultVideoSourceId,
      holdPreviousMs: 1500,
      minShotDurationMs: 1500,
      overrides: multicamOverrides,
    }
  );
  const switchingTimeline = toFrameTimeline(applyPreRoll(rawTimeline), clip.startTime, FPS);

  const props: MulticamClipVideoProps = {
    ...baseProps,
    videoSources: multicamSources,
    switchingTimeline,
    layoutMode,
    pipEnabled,
    pipPositions,
    pipScale,
    clipStartTimeSeconds: clip.startTime,
    transitionStyle,
    transitionDurationFrames: transitionStyle === "crossfade" ? 3 : 0,
  };

  return { props, subtitleConfig };
}

// ============ Helpers ============

function buildTrackData(clip: Clip): TrackData[] {
  if (!clip.tracks) return [];

  return clip.tracks
    .filter((t) => t.type === "video-overlay")
    .map((track) => ({
      id: track.id,
      type: track.type as TrackData["type"],
      order: track.order,
      clips: track.clips.map(
        (c): TrackClipData => ({
          id: c.id,
          type: c.type as TrackClipData["type"],
          startFrame: Math.floor(c.startTime * FPS),
          durationFrames: Math.max(1, Math.round(c.duration * FPS)),
          assetUrl: c.assetUrl ? getMediaUrl(c.assetUrl) : undefined,
          assetSource: c.assetSource as TrackClipData["assetSource"],
          positionX: c.positionX,
          positionY: c.positionY,
          scale: c.scale,
          // lottieData not available client-side — fetched server-side during render
        })
      ),
    }));
}

function buildSpeakerConfig(
  clip: Clip,
  speakerPeople?: PodcastPerson[],
  speakerDisplayMode?: "fill" | "circle",
  speakerNameFormat?: SpeakerNameFormat
): SpeakerOverlayConfig | undefined {
  const speakerTrack = clip.tracks?.find((t) => t.type === "speaker");
  if (!speakerTrack?.clips.length) return undefined;

  // Deduplicate labels in order of first appearance
  const labels: string[] = [];
  for (const c of speakerTrack.clips) {
    if (c.assetId && !labels.includes(c.assetId)) labels.push(c.assetId);
  }

  const speakerClips: SpeakerClipData[] = speakerTrack.clips
    .filter((c) => c.assetId)
    .map((c) => ({
      startFrame: Math.floor(c.startTime * FPS),
      endFrame: Math.ceil((c.startTime + c.duration) * FPS),
      speakerLabel: c.assetId!,
      personId: c.assetUrl || undefined, // assetUrl stores personId
      colorIndex: labels.indexOf(c.assetId!),
    }));

  const people: SpeakerPerson[] = (speakerPeople || [])
    .filter((p) => speakerClips.some((c) => c.personId === p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      photoUrl: p.photoUrl ? getMediaUrl(p.photoUrl) : undefined,
    }));

  return {
    displayMode: speakerDisplayMode || "fill",
    nameFormat: speakerNameFormat || "full-name",
    clips: speakerClips,
    people,
  };
}
