import { VideoFormat, SubtitleConfig, BackgroundConfig } from "../lib/types";

// Track clip data for Remotion rendering (frame-based timing)
export interface TrackClipData {
  id: string;
  type: "animation" | "video" | "image" | "audio" | "text" | "caption";
  startFrame: number;
  durationFrames: number;
  assetUrl?: string;
  assetSource?: "lottie" | "giphy" | "tenor" | "waveform" | "youtube-cta" | "apple-podcasts-cta";
  positionX?: number; // 0-100, default 50
  positionY?: number; // 0-100, default 50
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lottieData?: Record<string, any>; // Pre-fetched Lottie JSON data
}

export interface TrackData {
  id: string;
  type: "video-overlay" | "captions" | "music" | "sfx" | "podcast-audio" | "text-graphics";
  order?: number;
  clips: TrackClipData[];
}

export interface ClipVideoProps {
  audioUrl: string;
  audioStartFrame?: number;
  audioEndFrame?: number;
  words: WordTiming[];
  format: VideoFormat;
  background: BackgroundConfig;
  subtitle: SubtitleConfig;
  durationInFrames: number;
  fps: number;
  tracks?: TrackData[]; // Animation and overlay tracks
  podcast?: { name: string; coverImageUrl?: string; author?: string; category?: string };
}

export interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
  startTime?: number; // seconds relative to clip start
  endTime?: number; // seconds relative to clip start
}

export interface SubtitleGroupProps {
  words: WordTiming[];
  config: SubtitleConfig;
  currentFrame: number;
}

// ============ Multicam Types ============

export interface MulticamVideoSource {
  id: string;
  label: string;
  videoUrl: string;
  syncOffsetMs: number;
  sourceType: string;
  cropOffsetX: number;
  cropOffsetY: number;
  width: number;
  height: number;
}

export interface MulticamClipVideoProps extends ClipVideoProps {
  videoSources: MulticamVideoSource[];
  switchingTimeline: Array<{
    startFrame: number;
    endFrame: number;
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
  soloSourceId?: string;
  clipStartTimeSeconds: number;
  transitionStyle: "cut" | "crossfade";
  transitionDurationFrames: number;
}
