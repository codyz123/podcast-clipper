// Episode-level NLE timeline types (distinct from clip-level Track/TrackClip in types.ts)

import type { BackgroundConfig, CaptionStyle, VideoFormat } from "./types";

// ============ Timeline Items ============

export interface NleTimelineItem {
  id: string;
  trackId: string;

  // Position on timeline (seconds, absolute to episode start)
  startTime: number;
  duration: number;

  // Source range — for trimmed media. Invariant: sourceOut - sourceIn >= duration / speed
  sourceIn: number;
  sourceOut: number;

  // What this item is
  type: "video" | "audio" | "image" | "text" | "caption" | "transition";

  // Source reference (exactly one should be set for media items)
  mediaSourceId?: string;
  mediaSourceType?: "video-source" | "media-asset" | "episode-audio" | "branding";
  resolvedUrl?: string; // Cached URL for playback (proxy for preview, full for render)

  // Transform (video/image items, percentage 0-100)
  positionX: number; // default 50 (center)
  positionY: number; // default 50 (center)
  scale: number; // default 1.0
  rotation: number; // default 0 degrees
  opacity: number; // default 1.0

  // Audio (audio/video items)
  volume: number; // default 1.0
  fadeIn: number; // seconds, default 0
  fadeOut: number; // seconds, default 0

  // Speed
  speed: number; // default 1.0 — affects playback rate and effective duration

  // Transitions (applied at item boundaries)
  transitionIn?: {
    type: "crossfade" | "dip-to-black" | "dip-to-white";
    duration: number;
  };
  transitionOut?: {
    type: "crossfade" | "dip-to-black" | "dip-to-white";
    duration: number;
  };

  // Text overlay (for type: 'text')
  textConfig?: {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    backgroundColor?: string;
    animation: "none" | "fade-in" | "slide-up" | "pop";
  };
}

// ============ Tracks ============

export type NleTrackType =
  | "video-main" // Primary video (multicam switching or single camera)
  | "video-overlay" // B-roll, picture-in-picture, overlays
  | "audio-main" // Primary episode audio (mixed or single source)
  | "audio-music" // Background music
  | "audio-sfx" // Sound effects
  | "captions" // Episode-level captions (auto-generated from transcript)
  | "text-graphics"; // Lower thirds, titles, callouts
// Note: markers are stored on EpisodeTimeline.markers[], NOT as a track type.

export interface NleTrack {
  id: string;
  type: NleTrackType;
  name: string;
  order: number; // Visual stacking order (higher = on top in compositing)
  locked: boolean;
  muted: boolean;
  visible: boolean;
  solo: boolean; // Solo this track's audio (mutes all others)
  volume: number; // Track-level volume multiplier (0-1)
  opacity: number; // Track-level opacity multiplier (0-1)
  height: number; // Track row height in pixels (user-resizable, min 32, max 200)
  color?: string; // User-assigned track color (HSL string)
  items: NleTimelineItem[];
}

// ============ Markers ============

export interface TimelineMarker {
  id: string;
  time: number; // Position in seconds
  label: string;
  color: string; // Hex color
  type: "chapter" | "note" | "clip-start" | "clip-end";
}

// ============ Clip Markers ============

export interface ClipMarker {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  format?: VideoFormat; // Target social format for extracted clip
}

// ============ Multicam Configuration ============

export interface MulticamConfig {
  switchingTimeline: Array<{
    startTime: number; // seconds, absolute
    endTime: number;
    videoSourceId: string;
  }>;
  layoutMode: "active-speaker" | "side-by-side" | "grid" | "solo";
  pipEnabled: boolean;
  pipPositions: Array<{
    videoSourceId: string;
    positionX: number;
    positionY: number;
  }>;
  pipScale: number;
  transitionStyle: "cut" | "crossfade";
  transitionDurationFrames: number;
  soloSourceId?: string;
}

// ============ Episode Timeline ============

export interface EpisodeTimeline {
  id: string;
  projectId: string;

  tracks: NleTrack[];
  duration: number; // Total timeline duration (seconds), auto-computed from content
  fps: number; // Always 30 (matching existing FPS constant)

  // Multicam configuration (episode-level)
  multicamConfig?: MulticamConfig;

  // Caption styling (episode-level default)
  captionStyle?: CaptionStyle;

  // Background (for audio-only episodes or as base layer behind video)
  background: BackgroundConfig;

  // Always 16:9 for full episodes (social formats are for clips only)
  format: "16:9";

  // Timeline markers (chapter marks, notes — non-renderable navigation aids)
  markers: TimelineMarker[];

  // Clip markers — segments the user has marked for extraction to Marketing clips
  clipMarkers: ClipMarker[];

  // Metadata
  version: number; // Schema version for future migrations
  createdAt: string;
  updatedAt: string;
}

// ============ NLE Tool Types ============

export type NleTool =
  | "select"
  | "razor"
  | "ripple"
  | "roll"
  | "slip"
  | "slide"
  | "hand"
  | "zoom"
  | "marker";

// ============ Default Factories ============

export function createDefaultTimelineItem(
  overrides: Partial<NleTimelineItem> & Pick<NleTimelineItem, "id" | "trackId" | "type">
): NleTimelineItem {
  return {
    startTime: 0,
    duration: 0,
    sourceIn: 0,
    sourceOut: 0,
    positionX: 50,
    positionY: 50,
    scale: 1,
    rotation: 0,
    opacity: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    speed: 1,
    ...overrides,
  };
}

export function createDefaultTrack(
  overrides: Partial<NleTrack> & Pick<NleTrack, "id" | "type" | "name">
): NleTrack {
  return {
    order: 0,
    locked: false,
    muted: false,
    visible: true,
    solo: false,
    volume: 1,
    opacity: 1,
    height: 72,
    items: [],
    ...overrides,
  };
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  type: "gradient",
  gradientColors: ["#667eea", "#764ba2"],
  gradientDirection: 135,
};

export function createDefaultTimeline(projectId: string): EpisodeTimeline {
  return {
    id: "", // Set by DB
    projectId,
    tracks: [],
    duration: 0,
    fps: 30,
    background: DEFAULT_BACKGROUND,
    format: "16:9",
    markers: [],
    clipMarkers: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
