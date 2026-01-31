// Core types for the Podcast Clipper app

export interface Project {
  id: string;
  name: string;
  audioPath: string;
  audioFileName?: string; // Original filename with extension (for transcription)
  audioFingerprint?: string; // Hash of file content to identify unique files
  audioDuration: number;
  createdAt: string;
  updatedAt: string;
  // Legacy: single transcript (for backward compatibility)
  transcript?: Transcript;
  // New: multiple transcripts per file
  transcripts: Transcript[];
  activeTranscriptId?: string; // Which transcript is currently selected
  clips: Clip[];
  exportHistory: ExportRecord[];
}

export interface Transcript {
  id: string;
  projectId: string;
  audioFingerprint?: string; // Links transcript to specific audio file
  text: string;
  words: Word[];
  language: string;
  createdAt: string;
  name?: string; // Optional user-given name for this transcript version
}

export interface Word {
  text: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

export interface Clip {
  id: string;
  projectId: string;
  name: string;
  startTime: number; // seconds
  endTime: number; // seconds
  transcript: string;
  words: Word[];
  clippabilityScore?: ClippabilityScore;
  isManual: boolean; // true if user-selected, false if AI-suggested
  createdAt: string;
}

export interface ClippabilityScore {
  hook: number; // 1-10
  clarity: number; // 1-10
  emotion: number; // 1-10
  quotable: number; // 1-10
  completeness: number; // 1-10
  overall: number; // average
  explanation: string;
}

export interface VideoTemplate {
  id: string;
  name: string;
  background: BackgroundConfig;
  subtitle: SubtitleConfig;
  branding?: BrandingConfig;
  isBuiltIn: boolean;
}

export interface BackgroundConfig {
  type: "solid" | "gradient" | "image" | "video";
  color?: string;
  gradientColors?: string[];
  gradientDirection?: number;
  imagePath?: string;
  videoPath?: string;
}

export interface SubtitleConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  position: "center" | "top" | "bottom";
  animation: "fade" | "pop" | "karaoke" | "typewriter";
  wordsPerGroup: number; // how many words to show at once
}

export interface BrandingConfig {
  logoPath?: string;
  logoPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  logoSize: number;
  watermarkText?: string;
}

export type VideoFormat = "9:16" | "1:1" | "16:9" | "4:5";

export interface VideoFormatConfig {
  id: VideoFormat;
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  useCases: string[];
}

export const VIDEO_FORMATS: Record<VideoFormat, VideoFormatConfig> = {
  "9:16": {
    id: "9:16",
    name: "Vertical",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    useCases: ["TikTok", "Instagram Reels", "YouTube Shorts"],
  },
  "1:1": {
    id: "1:1",
    name: "Square",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    useCases: ["Instagram Posts", "Twitter/X"],
  },
  "16:9": {
    id: "16:9",
    name: "Landscape",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    useCases: ["YouTube", "Twitter/X", "LinkedIn"],
  },
  "4:5": {
    id: "4:5",
    name: "Portrait",
    width: 1080,
    height: 1350,
    aspectRatio: "4:5",
    useCases: ["Instagram Feed"],
  },
};

export interface RenderJob {
  id: string;
  clipId: string;
  format: VideoFormat;
  templateId: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number; // 0-100
  outputPath?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ExportRecord {
  id: string;
  clipId: string;
  format: VideoFormat;
  outputPath: string;
  platform?: string; // if uploaded
  uploadedAt?: string;
  exportedAt: string;
}

export type QualityPreset = "draft" | "standard" | "high";

export interface ExportSettings {
  quality: QualityPreset;
  formats: VideoFormat[];
  outputDirectory: string;
  filenameTemplate: string;
}

// Settings
export interface AppSettings {
  // Backend settings (preferred)
  backendUrl?: string; // e.g., "http://localhost:3001" or "https://podcast-clipper.railway.app"
  accessCode?: string; // shared access code for authentication

  // Legacy: direct API key (used when no backend configured)
  openaiApiKey?: string;

  googleClientId?: string;
  googleApiKey?: string;
  youtubeOAuthCredentials?: OAuthCredentials;
  twitterApiKeys?: TwitterApiKeys;
  defaultTemplate: string;
  defaultFormats: VideoFormat[];
  defaultClipDuration: number; // seconds
  autoSaveInterval: number; // seconds
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface TwitterApiKeys {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}
