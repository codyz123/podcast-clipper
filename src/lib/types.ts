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

  // Episode metadata
  description?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  publishDate?: string;
  showNotes?: string;
  explicit?: boolean;
  guests?: Guest[];

  // Legacy: single transcript (for backward compatibility)
  transcript?: Transcript;
  // New: multiple transcripts per file
  transcripts: Transcript[];
  activeTranscriptId?: string; // Which transcript is currently selected
  clips: Clip[];
  exportHistory: ExportRecord[];
}

export interface Guest {
  id: string;
  name: string;
  bio?: string;
  website?: string;
  twitter?: string;
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

  // Multi-track editor data (added in video editor phase)
  tracks?: Track[];
  captionStyle?: CaptionStyle;
  format?: VideoFormat;
  generatedAssets?: GeneratedAsset[];
  hookAnalysis?: HookAnalysis;
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

  // Pexels API for B-roll search
  pexelsApiKey?: string;

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

// ============ Multi-Track Editor Types ============

export type TrackType =
  | "podcast-audio" // Primary audio (locked, one per clip)
  | "music" // Background music with auto-ducking
  | "sfx" // Sound effects
  | "video-overlay" // B-roll, animations, AI-generated visuals
  | "text-graphics" // Lower thirds, titles, callouts
  | "captions"; // Auto-generated animated captions

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  order: number; // Compositing order (higher = on top)
  locked: boolean;
  muted: boolean;
  volume: number; // 0-1 for audio tracks
  opacity: number; // 0-1 for video tracks
  clips: TrackClip[];
  // For caption tracks
  captionStyle?: CaptionStyle;
  // Fade settings (applied to entire track)
  fadeIn?: number; // Duration in seconds
  fadeOut?: number; // Duration in seconds
}

export interface TrackClip {
  id: string;
  trackId: string;
  startTime: number; // Position on timeline (seconds)
  duration: number;
  sourceStart?: number; // For trimmed clips
  sourceEnd?: number;

  // Type-specific data
  type: "audio" | "video" | "image" | "animation" | "text" | "caption";
  assetId?: string; // Reference to asset in IndexedDB
  assetUrl?: string; // URL for external assets (b-roll, etc.)
  animationConfig?: AnimationConfig;
  textConfig?: TextOverlayConfig;

  // Fade settings (per-clip)
  fadeIn?: number; // Duration in seconds
  fadeOut?: number; // Duration in seconds
}

// Volume automation keyframe for audio ducking
export interface VolumeKeyframe {
  time: number; // Seconds from clip start
  volume: number; // 0-1
}

// Caption styling with viral presets
export type CaptionPreset = "hormozi" | "mrBeast" | "tiktok-default" | "clean-minimal";
export type CaptionAnimation = "word-by-word" | "karaoke" | "bounce" | "typewriter";

export interface CaptionStyle {
  animation: CaptionAnimation;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  primaryColor: string;
  highlightColor: string; // For active word
  backgroundColor?: string; // Caption box background
  position: "bottom" | "center" | "top";
  wordsPerLine: number;
  preset?: CaptionPreset;
}

// Built-in caption presets
export const CAPTION_PRESETS: Record<CaptionPreset, Omit<CaptionStyle, "preset">> = {
  hormozi: {
    animation: "word-by-word",
    fontFamily: "Montserrat",
    fontSize: 48,
    fontWeight: 800,
    primaryColor: "#FFFFFF",
    highlightColor: "#FFD700",
    backgroundColor: "rgba(0,0,0,0.7)",
    position: "center",
    wordsPerLine: 4,
  },
  mrBeast: {
    animation: "bounce",
    fontFamily: "Impact",
    fontSize: 56,
    fontWeight: 700,
    primaryColor: "#FFFFFF",
    highlightColor: "#FF0000",
    backgroundColor: undefined,
    position: "center",
    wordsPerLine: 3,
  },
  "tiktok-default": {
    animation: "karaoke",
    fontFamily: "Arial",
    fontSize: 40,
    fontWeight: 600,
    primaryColor: "#FFFFFF",
    highlightColor: "#00F5FF",
    backgroundColor: "rgba(0,0,0,0.5)",
    position: "bottom",
    wordsPerLine: 5,
  },
  "clean-minimal": {
    animation: "typewriter",
    fontFamily: "Inter",
    fontSize: 36,
    fontWeight: 500,
    primaryColor: "#FFFFFF",
    highlightColor: "#FFFFFF",
    backgroundColor: undefined,
    position: "bottom",
    wordsPerLine: 6,
  },
};

// ============ AI Animation Types ============

export type AnimationType =
  | "motion-graphics" // Animated text, shapes, icons
  | "ai-image" // DALL-E generated illustrations
  | "b-roll" // Stock video from Pexels
  | "ai-video"; // Runway/Pika (future)

export type AnimationStyle = "minimal" | "bold" | "playful" | "professional";
export type AnimationPosition = "fullscreen" | "lower-third" | "corner" | "custom";

export interface AnimationConfig {
  type: AnimationType;
  prompt?: string; // For AI generation
  style?: AnimationStyle;
  keywords?: string[]; // Extracted from transcript
  generatedAssetUrl?: string; // Cached result
  generatedAssetId?: string; // Key in IndexedDB

  // Motion graphics specific
  templateId?: string;
  textContent?: string;
  iconName?: string;

  // Positioning
  position: AnimationPosition;
  customPosition?: { x: number; y: number; width: number; height: number };
}

// Text overlay configuration
export interface TextOverlayConfig {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor?: string;
  position: { x: number; y: number };
  animation: "none" | "fade-in" | "slide-up" | "pop";
}

// Motion graphics template definition
export type MotionTemplateCategory = "text" | "icon" | "stats" | "quote" | "list" | "progress";

export interface MotionTemplate {
  id: string;
  name: string;
  category: MotionTemplateCategory;
  lottieData?: object; // Pre-built Lottie animation
  customizable: {
    text?: boolean;
    colors?: boolean;
    duration?: boolean;
    icon?: boolean;
  };
}

// AI-suggested visual elements
export interface VisualSuggestion {
  id: string;
  timestamp: number; // When to show in clip (seconds)
  duration: number;
  type: AnimationType;
  prompt: string;
  keywords: string[];
  confidence: number; // 0-1, how confident AI is this will help
  applied: boolean; // Has user added this to timeline?
}

// Generated asset reference (stored in IndexedDB)
export interface GeneratedAsset {
  id: string;
  type: "ai-image" | "thumbnail" | "b-roll";
  prompt?: string;
  blobKey: string; // Key in IndexedDB ASSETS_STORE
  thumbnailUrl?: string; // Data URL for preview
  createdAt: string;
}

// Hook analysis result
export interface HookAnalysis {
  score: number; // 1-10
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  predictedRetention: number; // Estimated % who watch past 3s
}
