import { VideoFormat, SubtitleConfig, BackgroundConfig } from "../lib/types";

export interface ClipVideoProps {
  audioUrl: string;
  words: WordTiming[];
  format: VideoFormat;
  background: BackgroundConfig;
  subtitle: SubtitleConfig;
  durationInFrames: number;
  fps: number;
}

export interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface SubtitleGroupProps {
  words: WordTiming[];
  config: SubtitleConfig;
  currentFrame: number;
}
