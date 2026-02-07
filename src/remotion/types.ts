import { VideoFormat, SubtitleConfig, BackgroundConfig } from "../lib/types";

// Track clip data for Remotion rendering (frame-based timing)
export interface TrackClipData {
  id: string;
  type: "animation" | "video" | "image" | "audio" | "text" | "caption";
  startFrame: number;
  durationFrames: number;
  assetUrl?: string;
  assetSource?: "lottie" | "giphy" | "tenor";
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
