// Platform configurations and validation for the Publish panel
import type { Clip, VideoFormat } from "./types";

// ============ Platform Types ============

export type PublishDestinationType =
  | "youtube-shorts"
  | "instagram-reels"
  | "instagram-post"
  | "x"
  | "tiktok"
  | "local";

export type SocialPlatform = "youtube" | "instagram" | "tiktok" | "x";

export interface PlatformConfig {
  id: PublishDestinationType;
  name: string;
  shortName: string;
  icon: string; // Lucide icon name
  brandColor: string;
  defaultFormat: VideoFormat;
  supportedFormats: VideoFormat[];
  maxDurationSeconds: number | null;
  maxFileSizeMB: number | null;
  maxCaptionLength: number | null;
  supportsHashtags: boolean;
  hashtagPrefix: string;
  requiresAuth: boolean;
  manualUploadUrl?: string;
  connectionPlatform?: SocialPlatform;
}

// ============ Platform Configurations ============

export const PLATFORM_CONFIGS: Record<PublishDestinationType, PlatformConfig> = {
  "youtube-shorts": {
    id: "youtube-shorts",
    name: "YouTube Shorts",
    shortName: "YT Shorts",
    icon: "youtube",
    brandColor: "#FF0000",
    defaultFormat: "9:16",
    supportedFormats: ["9:16", "1:1"],
    maxDurationSeconds: 60,
    maxFileSizeMB: null,
    maxCaptionLength: 100, // Title limit
    supportsHashtags: true,
    hashtagPrefix: "",
    requiresAuth: true,
    manualUploadUrl: "https://studio.youtube.com/",
    connectionPlatform: "youtube",
  },
  "instagram-reels": {
    id: "instagram-reels",
    name: "Instagram Reels",
    shortName: "IG Reels",
    icon: "instagram",
    brandColor: "#E4405F",
    defaultFormat: "9:16",
    supportedFormats: ["9:16"],
    maxDurationSeconds: 90,
    maxFileSizeMB: 4000,
    maxCaptionLength: 2200,
    supportsHashtags: true,
    hashtagPrefix: "#",
    requiresAuth: true,
    manualUploadUrl: "https://www.instagram.com/",
    connectionPlatform: "instagram",
  },
  "instagram-post": {
    id: "instagram-post",
    name: "Instagram Post",
    shortName: "IG Post",
    icon: "instagram",
    brandColor: "#E4405F",
    defaultFormat: "1:1",
    supportedFormats: ["1:1", "4:5", "16:9"],
    maxDurationSeconds: 60,
    maxFileSizeMB: 4000,
    maxCaptionLength: 2200,
    supportsHashtags: true,
    hashtagPrefix: "#",
    requiresAuth: true,
    manualUploadUrl: "https://www.instagram.com/",
    connectionPlatform: "instagram",
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    shortName: "X",
    icon: "twitter",
    brandColor: "#000000",
    defaultFormat: "16:9",
    supportedFormats: ["16:9", "1:1", "9:16"],
    maxDurationSeconds: 140,
    maxFileSizeMB: 512,
    maxCaptionLength: 280,
    supportsHashtags: true,
    hashtagPrefix: "#",
    requiresAuth: true,
    manualUploadUrl: "https://twitter.com/compose/tweet",
    connectionPlatform: "x",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    shortName: "TikTok",
    icon: "music",
    brandColor: "#000000",
    defaultFormat: "9:16",
    supportedFormats: ["9:16"],
    maxDurationSeconds: 180,
    maxFileSizeMB: 4000,
    maxCaptionLength: 2200,
    supportsHashtags: true,
    hashtagPrefix: "#",
    requiresAuth: true,
    manualUploadUrl: "https://www.tiktok.com/upload",
    connectionPlatform: "tiktok",
  },
  local: {
    id: "local",
    name: "Save to Disk",
    shortName: "Local",
    icon: "hard-drive",
    brandColor: "hsl(var(--cyan))",
    defaultFormat: "9:16",
    supportedFormats: ["9:16", "1:1", "16:9", "4:5"],
    maxDurationSeconds: null,
    maxFileSizeMB: null,
    maxCaptionLength: null,
    supportsHashtags: false,
    hashtagPrefix: "",
    requiresAuth: false,
  },
};

export const DEFAULT_DESTINATIONS: PublishDestinationType[] = [
  "youtube-shorts",
  "instagram-reels",
  "instagram-post",
  "x",
  "tiktok",
];

// ============ Publish Instance Types ============

export type PublishInstanceStatus =
  | { status: "idle" }
  | { status: "queued"; queuePosition: number }
  | { status: "rendering"; progress: number; stage: "encoding" | "processing" }
  | { status: "uploading"; progress: number }
  | { status: "completed"; outputPath: string; uploadedUrl?: string; completedAt: string }
  | { status: "failed"; error: string; failedAt: string; retryCount: number };

export interface PublishInstance {
  id: string;
  clipId: string;
  destination: PublishDestinationType;
  format: VideoFormat;
  enabled: boolean;
  createdAt: string;
  caption: string;
  hashtags: string[];
  statusData: PublishInstanceStatus;
}

// ============ Type Guards ============

export const isPublishIdle = (
  i: PublishInstance
): i is PublishInstance & { statusData: { status: "idle" } } => i.statusData.status === "idle";

export const isPublishQueued = (
  i: PublishInstance
): i is PublishInstance & { statusData: { status: "queued"; queuePosition: number } } =>
  i.statusData.status === "queued";

export const isPublishRendering = (
  i: PublishInstance
): i is PublishInstance & {
  statusData: { status: "rendering"; progress: number; stage: "encoding" | "processing" };
} => i.statusData.status === "rendering";

export const isPublishUploading = (
  i: PublishInstance
): i is PublishInstance & { statusData: { status: "uploading"; progress: number } } =>
  i.statusData.status === "uploading";

export const isPublishComplete = (
  i: PublishInstance
): i is PublishInstance & {
  statusData: {
    status: "completed";
    outputPath: string;
    uploadedUrl?: string;
    completedAt: string;
  };
} => i.statusData.status === "completed";

export const isPublishFailed = (
  i: PublishInstance
): i is PublishInstance & {
  statusData: { status: "failed"; error: string; failedAt: string; retryCount: number };
} => i.statusData.status === "failed";

export const isPublishInProgress = (i: PublishInstance): boolean =>
  i.statusData.status === "rendering" || i.statusData.status === "uploading";

export const canRetryPublish = (i: PublishInstance): boolean =>
  i.statusData.status === "failed" && i.statusData.retryCount < 3;

// ============ Validation ============

export interface PublishValidation {
  valid: boolean;
  canPublish: boolean; // false if not connected and no manual fallback
  warnings: string[];
  errors: string[];
}

export function validatePublishInstance(
  instance: PublishInstance,
  clip: Clip,
  config: PlatformConfig,
  isConnected: boolean
): PublishValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  const clipDuration = clip.endTime - clip.startTime;

  // Duration validation
  if (config.maxDurationSeconds && clipDuration > config.maxDurationSeconds) {
    errors.push(`Clip is ${Math.round(clipDuration)}s, max is ${config.maxDurationSeconds}s`);
  } else if (config.maxDurationSeconds && clipDuration > config.maxDurationSeconds * 0.9) {
    warnings.push(`Close to ${config.maxDurationSeconds}s limit`);
  }

  // Format validation
  if (!config.supportedFormats.includes(instance.format)) {
    errors.push(`${instance.format} not supported`);
  }

  // Caption length validation
  const fullCaption = buildFullCaption(instance, config);
  if (config.maxCaptionLength && fullCaption.length > config.maxCaptionLength) {
    errors.push(`Caption is ${fullCaption.length}/${config.maxCaptionLength} chars`);
  } else if (config.maxCaptionLength && fullCaption.length > config.maxCaptionLength * 0.9) {
    warnings.push(
      `Caption at ${Math.round((fullCaption.length / config.maxCaptionLength) * 100)}% of limit`
    );
  }

  // Connection validation (warning, not error - can still do manual upload)
  const canPublish = !config.requiresAuth || isConnected || !!config.manualUploadUrl;
  if (config.requiresAuth && !isConnected) {
    warnings.push("Not connected - will need manual upload");
  }

  return {
    valid: errors.length === 0,
    canPublish,
    warnings,
    errors,
  };
}

// ============ Caption Helpers ============

export function buildFullCaption(instance: PublishInstance, config: PlatformConfig): string {
  const parts: string[] = [];

  if (instance.caption) {
    parts.push(instance.caption);
  }

  if (instance.hashtags.length > 0 && config.supportsHashtags) {
    const formattedHashtags = instance.hashtags
      .map((tag) => `${config.hashtagPrefix}${tag}`)
      .join(" ");
    parts.push(formattedHashtags);
  }

  return parts.join("\n\n");
}

export function getCaptionCharacterCount(
  instance: PublishInstance,
  config: PlatformConfig
): number {
  return buildFullCaption(instance, config).length;
}

// ============ Utility Functions ============

export function getDefaultInstancesForClip(
  clipId: string,
  defaultCaption: string = ""
): Omit<PublishInstance, "id" | "createdAt">[] {
  return DEFAULT_DESTINATIONS.map((destination) => {
    const config = PLATFORM_CONFIGS[destination];
    return {
      clipId,
      destination,
      format: config.defaultFormat,
      enabled: true,
      caption: defaultCaption,
      hashtags: [],
      statusData: { status: "idle" as const },
    };
  });
}

export function getPlatformIcon(destination: PublishDestinationType): string {
  return PLATFORM_CONFIGS[destination].icon;
}

export function getPlatformColor(destination: PublishDestinationType): string {
  return PLATFORM_CONFIGS[destination].brandColor;
}
