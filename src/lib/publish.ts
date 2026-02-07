// Platform configurations and validation for the Publish panel
import type { Clip, VideoFormat } from "./types";

// ============ Platform Types ============

export type PublishDestinationType =
  | "youtube-shorts"
  | "youtube-video"
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
  requiresClip?: boolean;
  supportsDirectUpload: boolean;
  manualUploadUrl?: string;
  connectionPlatform?: SocialPlatform;
  titleMaxLength?: number;
  descriptionMaxLength?: number;
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
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
    supportsHashtags: true,
    hashtagPrefix: "",
    requiresAuth: true,
    requiresClip: true,
    supportsDirectUpload: true,
    manualUploadUrl: "https://studio.youtube.com/",
    connectionPlatform: "youtube",
  },
  "youtube-video": {
    id: "youtube-video",
    name: "YouTube Video",
    shortName: "YouTube",
    icon: "youtube",
    brandColor: "#FF0000",
    defaultFormat: "16:9",
    supportedFormats: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: null,
    maxFileSizeMB: 128000,
    maxCaptionLength: 5000,
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
    supportsHashtags: true,
    hashtagPrefix: "",
    requiresAuth: true,
    requiresClip: true,
    supportsDirectUpload: true,
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
    requiresClip: true,
    supportsDirectUpload: true,
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
    requiresClip: true,
    supportsDirectUpload: true,
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
    requiresClip: false,
    supportsDirectUpload: true,
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
    requiresClip: true,
    supportsDirectUpload: true,
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
    requiresClip: false,
    supportsDirectUpload: false,
  },
};

export const DEFAULT_DESTINATIONS: PublishDestinationType[] = [
  "youtube-shorts",
  "youtube-video",
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
  | {
      status: "uploading";
      progress: number;
      stage?: "uploading" | "processing" | "publishing" | "posting";
    }
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
): i is PublishInstance & {
  statusData: {
    status: "uploading";
    progress: number;
    stage?: "uploading" | "processing" | "publishing" | "posting";
  };
} => i.statusData.status === "uploading";

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
  if (config.requiresAuth && !isConnected && config.supportsDirectUpload) {
    warnings.push("Not connected - will need manual upload");
  }

  if (!config.supportsDirectUpload && config.manualUploadUrl) {
    warnings.push("Manual upload only");
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

// ============ Post Types (Post-Centric Model) ============

/**
 * Post represents a single piece of content destined for one platform.
 * This is the new post-centric model replacing the clip-centric PublishInstance.
 */
export interface Post {
  id: string;
  destination: PublishDestinationType;

  // Format only required when clip is present
  format?: VideoFormat;
  renderScale?: number;

  // Content (both optional - at least one for meaningful post)
  clipId?: string;
  textContent?: string;
  title?: string;
  description?: string;
  sourceSnippetId?: string | null; // null = was from snippet but edited

  hashtags: string[];
  statusData: PostStatus;
  enabled: boolean;
  createdAt: string;
}

// Discriminated union for post status
export type PostStatus =
  | { status: "idle" }
  | { status: "queued" }
  | { status: "rendering"; progress: number; stage: "encoding" | "processing" }
  | {
      status: "uploading";
      progress: number;
      stage?: "uploading" | "processing" | "publishing" | "posting";
    }
  | { status: "completed"; outputPath?: string; uploadedUrl?: string; completedAt: string }
  | { status: "failed"; error: string; failedAt: string; retryCount: number };

// ============ Platform Capabilities (Derived from Config) ============

/**
 * Derive platform capabilities from PlatformConfig to avoid duplication.
 */
export function getPlatformCapabilities(config: PlatformConfig) {
  return {
    supportsVideo: true, // All platforms support video
    supportsText: config.maxCaptionLength !== null,
    maxTextLength: config.maxCaptionLength,
  };
}

// ============ Post Type Guards ============

export const isPostIdle = (p: Post): p is Post & { statusData: { status: "idle" } } =>
  p.statusData.status === "idle";

export const isPostQueued = (p: Post): p is Post & { statusData: { status: "queued" } } =>
  p.statusData.status === "queued";

export const isPostRendering = (
  p: Post
): p is Post & {
  statusData: { status: "rendering"; progress: number; stage: "encoding" | "processing" };
} => p.statusData.status === "rendering";

export const isPostUploading = (
  p: Post
): p is Post & {
  statusData: {
    status: "uploading";
    progress: number;
    stage?: "uploading" | "processing" | "publishing" | "posting";
  };
} => p.statusData.status === "uploading";

export const isPostComplete = (
  p: Post
): p is Post & {
  statusData: {
    status: "completed";
    outputPath?: string;
    uploadedUrl?: string;
    completedAt: string;
  };
} => p.statusData.status === "completed";

export const isPostFailed = (
  p: Post
): p is Post & {
  statusData: { status: "failed"; error: string; failedAt: string; retryCount: number };
} => p.statusData.status === "failed";

export const isPostInProgress = (p: Post): boolean =>
  p.statusData.status === "rendering" || p.statusData.status === "uploading";

// Retry capped at 3 attempts
export const canRetryPost = (p: Post): boolean =>
  p.statusData.status === "failed" && p.statusData.retryCount < 3;

// ============ Post Status State Machine ============

/**
 * Valid status transitions - enforced in updatePostStatus.
 * Prevents invalid state jumps and makes retry behavior deterministic.
 */
const VALID_POST_TRANSITIONS: Record<PostStatus["status"], PostStatus["status"][]> = {
  idle: ["queued"],
  queued: ["rendering", "idle"], // idle for cancel
  rendering: ["uploading", "failed", "completed"], // completed if no upload needed (local)
  uploading: ["completed", "failed"],
  completed: ["idle"], // reset for re-publish
  failed: ["queued", "idle"], // queued for retry, idle for reset
};

export function isValidPostTransition(
  from: PostStatus["status"],
  to: PostStatus["status"]
): boolean {
  // Allow same-status transitions for progress updates (rendering→rendering, uploading→uploading)
  if (from === to) return true;
  return VALID_POST_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============ Post Validation ============

export interface PostValidation {
  valid: boolean;
  canPublish: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Build the full text for a post including hashtags.
 */
export function buildPostText(post: Post, config: PlatformConfig): string {
  const parts: string[] = [];

  if (post.textContent) {
    parts.push(post.textContent);
  }

  if (post.hashtags.length > 0 && config.supportsHashtags) {
    const formattedHashtags = post.hashtags.map((tag) => `${config.hashtagPrefix}${tag}`).join(" ");
    parts.push(formattedHashtags);
  }

  return parts.join("\n\n");
}

/**
 * Validate a post before publishing.
 * Checks content requirements, clip validity, text length, format, and connection status.
 */
export function validatePost(
  post: Post,
  clip: Clip | undefined,
  config: PlatformConfig,
  isConnected: boolean
): PostValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  const capabilities = getPlatformCapabilities(config);
  const isYouTube = config.id === "youtube-shorts" || config.id === "youtube-video";
  const hasTextContent = isYouTube
    ? Boolean(post.title?.trim() || post.description?.trim())
    : Boolean(post.textContent?.trim());

  // Must have at least clip or text
  if (!post.clipId && !hasTextContent) {
    errors.push("Post must have a clip or text content");
  }

  if (config.requiresClip && !post.clipId) {
    errors.push(`${config.shortName} requires a clip`);
  }

  // CRITICAL: Clip reference validation - catch deleted/missing clips
  if (post.clipId && !clip) {
    errors.push("Selected clip no longer exists");
  }

  // Clip validation (if present and exists)
  if (post.clipId && clip) {
    const clipDuration = clip.endTime - clip.startTime;

    if (config.maxDurationSeconds && clipDuration > config.maxDurationSeconds) {
      errors.push(`Clip is ${Math.round(clipDuration)}s, max is ${config.maxDurationSeconds}s`);
    } else if (config.maxDurationSeconds && clipDuration > config.maxDurationSeconds * 0.9) {
      warnings.push(`Close to ${config.maxDurationSeconds}s limit`);
    }

    // Format required when clip present
    if (!post.format) {
      errors.push("Video format required for clip");
    } else if (!config.supportedFormats.includes(post.format)) {
      errors.push(`${post.format} format not supported by ${config.shortName}`);
    }
  }

  if (isYouTube) {
    const title = post.title?.trim() || "";
    if (!title) {
      errors.push("YouTube requires a title");
    } else if (config.titleMaxLength && title.length > config.titleMaxLength) {
      errors.push(`Title is ${title.length}/${config.titleMaxLength} chars`);
    } else if (config.titleMaxLength && title.length > config.titleMaxLength * 0.9) {
      warnings.push(`Title approaching ${config.titleMaxLength} char limit`);
    }

    if (post.description && config.descriptionMaxLength) {
      if (post.description.length > config.descriptionMaxLength) {
        errors.push(
          `Description is ${post.description.length}/${config.descriptionMaxLength} chars`
        );
      } else if (post.description.length > config.descriptionMaxLength * 0.9) {
        warnings.push(`Description approaching ${config.descriptionMaxLength} char limit`);
      }
    }
  } else {
    // Text validation (if present)
    if (post.textContent && capabilities.maxTextLength) {
      const textWithHashtags = buildPostText(post, config);
      if (textWithHashtags.length > capabilities.maxTextLength) {
        errors.push(`Text is ${textWithHashtags.length}/${capabilities.maxTextLength} chars`);
      } else if (textWithHashtags.length > capabilities.maxTextLength * 0.9) {
        warnings.push(`Text approaching ${capabilities.maxTextLength} char limit`);
      }
    }
  }

  // Text-only post on video-only platform (local export)
  if (!post.clipId && hasTextContent && !capabilities.supportsText) {
    errors.push(`${config.shortName} requires video content`);
  }

  // Connection warning (not error - can still export locally)
  if (config.requiresAuth && !isConnected) {
    warnings.push("Not connected - will export locally");
  }

  return {
    valid: errors.length === 0,
    canPublish: errors.length === 0,
    warnings,
    errors,
  };
}
