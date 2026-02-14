import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  real,
  jsonb,
  primaryKey,
  index,
  bigint,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============ Users & Auth ============

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("users_email_idx").on(table.email)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

// ============ Podcasts ============

export const podcasts = pgTable("podcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdById: uuid("created_by_id")
    .references(() => users.id)
    .notNull(),
  coverImageUrl: text("cover_image_url"),
  podcastMetadata: jsonb("podcast_metadata").$type<{
    showName?: string;
    author?: string;
    category?: string;
    language?: string;
    explicit?: boolean;
    email?: string;
    website?: string;
  }>(),
  brandColors: jsonb("brand_colors").$type<{
    primary?: string;
    secondary?: string;
    accent?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const podcastMembers = pgTable(
  "podcast_members",
  {
    podcastId: uuid("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).notNull().default("member"), // 'owner' | 'member'
    invitedById: uuid("invited_by_id").references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.podcastId, table.userId] }),
    index("podcast_members_user_id_idx").on(table.userId),
  ]
);

export const podcastInvitations = pgTable(
  "podcast_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podcastId: uuid("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    invitedById: uuid("invited_by_id")
      .references(() => users.id)
      .notNull(),
    token: varchar("token", { length: 64 }).notNull(), // For email invitation links
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("podcast_invitations_email_idx").on(table.email),
    index("podcast_invitations_token_idx").on(table.token),
  ]
);

// ============ Projects (Episodes) ============

export const projects = pgTable(
  "projects_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podcastId: uuid("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    audioBlobUrl: text("audio_blob_url"),
    audioFileName: varchar("audio_file_name", { length: 255 }),
    audioFingerprint: varchar("audio_fingerprint", { length: 64 }),
    audioDuration: real("audio_duration").default(0),
    episodeNumber: real("episode_number"),
    seasonNumber: real("season_number"),
    publishDate: timestamp("publish_date", { withTimezone: true }),
    showNotes: text("show_notes"),
    explicit: boolean("explicit").default(false),
    guests: jsonb("guests").$type<
      Array<{
        id: string;
        name: string;
        bio?: string;
        website?: string;
        twitter?: string;
      }>
    >(),
    // Video support
    mediaType: varchar("media_type", { length: 10 }).default("audio"), // 'audio' | 'video'
    defaultVideoSourceId: uuid("default_video_source_id"),
    primaryAudioSourceId: uuid("primary_audio_source_id"),
    mixedAudioBlobUrl: text("mixed_audio_blob_url"),
    videoSyncStatus: varchar("video_sync_status", { length: 20 }), // 'pending' | 'syncing' | 'synced' | 'failed'

    createdById: uuid("created_by_id").references(() => users.id),
    stageStatus: jsonb("stage_status").$type<{
      // Stage-level status (independent of sub-steps)
      planning?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
      production?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
      "post-production"?: {
        status: "not-started" | "in-progress" | "complete";
        updatedAt?: string;
      };
      distribution?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
      marketing?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
      // Sub-step level status (granular tracking)
      subSteps?: {
        // Planning sub-steps
        guest?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        topic?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        logistics?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        // Production sub-step
        recording?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        // Post-production sub-steps
        mixing?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        editing?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        transcription?: {
          status: "not-started" | "in-progress" | "complete";
          updatedAt?: string;
        };
        // Distribution sub-steps
        rss?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        "youtube-dist"?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        // Marketing sub-steps
        x?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
        "instagram-reel"?: {
          status: "not-started" | "in-progress" | "complete";
          updatedAt?: string;
        };
        "instagram-post"?: {
          status: "not-started" | "in-progress" | "complete";
          updatedAt?: string;
        };
        "youtube-short"?: {
          status: "not-started" | "in-progress" | "complete";
          updatedAt?: string;
        };
        tiktok?: { status: "not-started" | "in-progress" | "complete"; updatedAt?: string };
      };
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("projects_v2_podcast_id_idx").on(table.podcastId)]
);

// ============ Upload Sessions (Multipart) ============

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podcastId: uuid("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    episodeId: uuid("episode_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),

    // R2 multipart identifiers (required for uploadPart/complete)
    uploadId: text("upload_id").notNull(),
    blobKey: text("blob_key").notNull(),
    pathname: text("pathname").notNull(),

    // File metadata
    filename: varchar("filename", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    chunkSize: integer("chunk_size").notNull(),
    totalParts: integer("total_parts").notNull(),

    // Progress tracking
    completedParts: jsonb("completed_parts")
      .$type<Array<{ partNumber: number; etag: string }>>()
      .default([]),
    uploadedBytes: bigint("uploaded_bytes", { mode: "number" }).default(0),

    // Status: 'pending' | 'uploading' | 'completing' | 'completed' | 'failed' | 'expired'
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    blobUrl: text("blob_url"), // Set after completion

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    // User tracking
    createdById: uuid("created_by_id")
      .references(() => users.id)
      .notNull(),
  },
  (table) => [
    index("upload_sessions_episode_id_idx").on(table.episodeId),
    index("upload_sessions_status_idx").on(table.status),
    index("upload_sessions_expires_at_idx").on(table.expiresAt),
  ]
);

// ============ Video Sources ============

export const videoSources = pgTable(
  "video_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    personId: uuid("person_id").references(() => podcastPeople.id, {
      onDelete: "set null",
    }),
    sourceType: varchar("source_type", { length: 20 }).notNull().default("speaker"), // 'speaker' | 'wide' | 'broll'

    // File URLs
    videoBlobUrl: text("video_blob_url").notNull(),
    proxyBlobUrl: text("proxy_blob_url"),
    audioBlobUrl: text("audio_blob_url"),
    thumbnailStripUrl: text("thumbnail_strip_url"),

    // File metadata
    fileName: varchar("file_name", { length: 500 }).notNull(),
    contentType: varchar("content_type", { length: 100 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),

    // Video metadata
    durationSeconds: real("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    fps: real("fps"),

    // Sync
    syncOffsetMs: integer("sync_offset_ms").default(0).notNull(),
    syncMethod: varchar("sync_method", { length: 30 }), // 'duration-match' | 'audio-correlation' | 'manual'
    syncConfidence: real("sync_confidence"),

    // Crop
    cropOffsetX: real("crop_offset_x").default(50).notNull(),
    cropOffsetY: real("crop_offset_y").default(50).notNull(),

    // Other
    audioFingerprint: varchar("audio_fingerprint", { length: 64 }),
    contentFingerprint: varchar("content_fingerprint", { length: 64 }), // SHA-256 of size + first 2MB
    displayOrder: integer("display_order").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("video_sources_project_id_idx").on(table.projectId),
    index("video_sources_person_id_idx").on(table.personId),
  ]
);

// ============ Podcast People (Recurring Hosts & Guests) ============

export const podcastPeople = pgTable(
  "podcast_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podcastId: uuid("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("guest"), // 'host' | 'guest'
    photoUrl: text("photo_url"),
    bio: text("bio"),
    website: varchar("website", { length: 500 }),
    twitter: varchar("twitter", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("podcast_people_podcast_id_idx").on(table.podcastId)]
);

// ============ Transcripts ============

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    audioFingerprint: varchar("audio_fingerprint", { length: 64 }),
    text: text("text").notNull(),
    words: jsonb("words").notNull().$type<
      Array<{
        text: string;
        start: number;
        end: number;
        confidence: number;
      }>
    >(),
    language: varchar("language", { length: 10 }).default("en"),
    name: varchar("name", { length: 255 }),
    segments: jsonb("segments").$type<
      Array<{
        speakerLabel: string;
        speakerId?: string;
        startWordIndex: number;
        endWordIndex: number;
        startTime: number;
        endTime: number;
      }>
    >(),
    service: varchar("service", { length: 50 }),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("transcripts_project_id_idx").on(table.projectId)]
);

// ============ Clips ============

export const clips = pgTable(
  "clips_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    transcript: text("transcript"),
    words: jsonb("words").notNull().$type<
      Array<{
        text: string;
        start: number;
        end: number;
        confidence: number;
      }>
    >(),
    clippabilityScore: jsonb("clippability_score").$type<{
      hook: number;
      clarity: number;
      emotion: number;
      quotable: number;
      completeness: number;
      overall: number;
      explanation: string;
    }>(),
    isManual: boolean("is_manual").default(false),
    templateId: varchar("template_id", { length: 255 }),
    background: jsonb("background"),
    subtitle: jsonb("subtitle"),
    tracks: jsonb("tracks"), // Track[] from types.ts
    captionStyle: jsonb("caption_style"), // CaptionStyle from types.ts
    multicamLayout: jsonb("multicam_layout"), // MulticamLayout from types.ts
    segments: jsonb("segments").$type<
      Array<{
        speakerLabel: string;
        speakerId?: string;
        startWordIndex: number;
        endWordIndex: number;
        startTime: number;
        endTime: number;
      }>
    >(),
    format: varchar("format", { length: 10 }),
    generatedAssets: jsonb("generated_assets"),
    hookAnalysis: jsonb("hook_analysis"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("clips_v2_project_id_idx").on(table.projectId)]
);

// ============ Text Snippets (Marketing Tidbits) ============

export const textSnippets = pgTable(
  "text_snippets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    index: integer("index").notNull(), // Auto-incremented per project (Snippet 1, 2, etc.)
    name: varchar("name", { length: 500 }).notNull(), // AI-generated description
    content: text("content").notNull(), // The actual snippet text
    prompt: text("prompt"), // Optional: the prompt used to generate
    focusClipId: uuid("focus_clip_id").references(() => clips.id, { onDelete: "set null" }),
    isManual: boolean("is_manual").default(false).notNull(),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("text_snippets_project_id_idx").on(table.projectId),
    index("text_snippets_focus_clip_id_idx").on(table.focusClipId),
  ]
);

// ============ Media Assets ============

export const mediaAssets = pgTable(
  "media_assets_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    type: varchar("type", { length: 50 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    blobUrl: text("blob_url").notNull(),
    contentType: varchar("content_type", { length: 255 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    durationSeconds: real("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("media_assets_v2_project_id_idx").on(table.projectId)]
);

// ============ Rendered Clips ============

export const renderedClips = pgTable(
  "rendered_clips_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clipId: uuid("clip_id")
      .references(() => clips.id, { onDelete: "cascade" })
      .notNull(),
    format: varchar("format", { length: 50 }).notNull(),
    blobUrl: text("blob_url").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    renderedAt: timestamp("rendered_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("rendered_clips_v2_clip_id_idx").on(table.clipId)]
);

// ============ YouTube Uploads ============

export const youtubeUploads = pgTable(
  "youtube_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: varchar("post_id", { length: 255 }).notNull(),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "set null" }),

    // YouTube session
    youtubeUploadUri: text("youtube_upload_uri"),
    youtubeVideoId: varchar("youtube_video_id", { length: 50 }),

    // Metadata
    title: varchar("title", { length: 100 }).notNull(),
    description: text("description"),
    tags: text("tags").array(),
    privacyStatus: varchar("privacy_status", { length: 20 }).default("public"),
    categoryId: varchar("category_id", { length: 10 }).default("22"),
    isShort: boolean("is_short").default(false),

    // Source
    sourceUrl: text("source_url").notNull(),
    sourceSizeBytes: bigint("source_size_bytes", { mode: "number" }),

    // Progress
    status: varchar("status", { length: 20 }).default("pending"),
    bytesUploaded: bigint("bytes_uploaded", { mode: "number" }).default(0),
    uploadProgress: integer("upload_progress").default(0),
    processingProgress: integer("processing_progress").default(0),

    // Error handling
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
  },
  (table) => [
    index("youtube_uploads_post_id_idx").on(table.postId),
    index("youtube_uploads_clip_id_idx").on(table.clipId),
    index("youtube_uploads_status_idx").on(table.status),
  ]
);

// ============ Instagram Uploads ============

export const instagramUploads = pgTable(
  "instagram_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: varchar("post_id", { length: 255 }).notNull(),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "set null" }),

    // Instagram session
    instagramContainerId: text("instagram_container_id"),
    instagramMediaId: text("instagram_media_id"),

    // Metadata
    caption: text("caption"),
    mediaType: varchar("media_type", { length: 20 }).default("REELS"),
    shareToFeed: boolean("share_to_feed").default(false),

    // Source
    sourceUrl: text("source_url").notNull(),
    sourceSizeBytes: bigint("source_size_bytes", { mode: "number" }),

    // Progress
    status: varchar("status", { length: 20 }).default("pending"),
    bytesUploaded: bigint("bytes_uploaded", { mode: "number" }).default(0),
    uploadProgress: integer("upload_progress").default(0),
    processingProgress: integer("processing_progress").default(0),

    // Error handling
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
  },
  (table) => [index("instagram_uploads_post_id_idx").on(table.postId)]
);

// ============ TikTok Uploads ============

export const tiktokUploads = pgTable(
  "tiktok_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: varchar("post_id", { length: 255 }).notNull(),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "set null" }),

    // TikTok session
    tiktokPublishId: text("tiktok_publish_id"),
    tiktokVideoId: text("tiktok_video_id"),

    // Metadata
    caption: text("caption"),
    privacyLevel: varchar("privacy_level", { length: 50 }),

    // Source
    sourceUrl: text("source_url").notNull(),
    sourceSizeBytes: bigint("source_size_bytes", { mode: "number" }),

    // Progress
    status: varchar("status", { length: 20 }).default("pending"),
    uploadProgress: integer("upload_progress").default(0),
    processingProgress: integer("processing_progress").default(0),

    // Error handling
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
  },
  (table) => [index("tiktok_uploads_post_id_idx").on(table.postId)]
);

// ============ X Uploads ============

export const xUploads = pgTable(
  "x_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: varchar("post_id", { length: 255 }).notNull(),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "set null" }),

    // X session
    xMediaId: text("x_media_id"),
    xTweetId: text("x_tweet_id"),

    // Metadata
    textContent: text("text_content"),

    // Source
    sourceUrl: text("source_url").notNull(),
    sourceSizeBytes: bigint("source_size_bytes", { mode: "number" }),

    // Progress
    status: varchar("status", { length: 20 }).default("pending"),
    bytesUploaded: bigint("bytes_uploaded", { mode: "number" }).default(0),
    uploadProgress: integer("upload_progress").default(0),
    processingProgress: integer("processing_progress").default(0),

    // Error handling
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
  },
  (table) => [index("x_uploads_post_id_idx").on(table.postId)]
);

// ============ Upload Events (Diagnostics) ============

export const uploadEvents = pgTable(
  "upload_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 50 }).notNull(),
    uploadId: varchar("upload_id", { length: 255 }).notNull(),
    event: varchar("event", { length: 100 }).notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("upload_events_platform_upload_idx").on(table.platform, table.uploadId),
    index("upload_events_created_at_idx").on(table.createdAt),
  ]
);

// ============ OAuth Tokens (migrated from legacy) ============

export const oauthTokens = pgTable(
  "oauth_tokens_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podcastId: uuid("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    platform: varchar("platform", { length: 50 }).notNull(), // 'youtube' | 'tiktok' | 'instagram' | 'x'
    accessToken: text("access_token").notNull(), // Encrypted
    refreshToken: text("refresh_token").notNull(), // Encrypted
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountId: varchar("account_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("oauth_tokens_v2_podcast_id_idx").on(table.podcastId),
    index("oauth_tokens_v2_platform_podcast_idx").on(table.platform, table.podcastId),
  ]
);

// ============ Relations ============

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  podcastMemberships: many(podcastMembers),
  createdPodcasts: many(podcasts),
  youtubeUploads: many(youtubeUploads),
  instagramUploads: many(instagramUploads),
  tiktokUploads: many(tiktokUploads),
  xUploads: many(xUploads),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const podcastsRelations = relations(podcasts, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [podcasts.createdById],
    references: [users.id],
  }),
  members: many(podcastMembers),
  projects: many(projects),
  invitations: many(podcastInvitations),
  oauthTokens: many(oauthTokens),
  people: many(podcastPeople),
}));

export const podcastPeopleRelations = relations(podcastPeople, ({ one, many }) => ({
  podcast: one(podcasts, {
    fields: [podcastPeople.podcastId],
    references: [podcasts.id],
  }),
  videoSources: many(videoSources),
}));

export const podcastMembersRelations = relations(podcastMembers, ({ one }) => ({
  podcast: one(podcasts, {
    fields: [podcastMembers.podcastId],
    references: [podcasts.id],
  }),
  user: one(users, {
    fields: [podcastMembers.userId],
    references: [users.id],
  }),
  invitedBy: one(users, {
    fields: [podcastMembers.invitedById],
    references: [users.id],
  }),
}));

export const podcastInvitationsRelations = relations(podcastInvitations, ({ one }) => ({
  podcast: one(podcasts, {
    fields: [podcastInvitations.podcastId],
    references: [podcasts.id],
  }),
  invitedBy: one(users, {
    fields: [podcastInvitations.invitedById],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  podcast: one(podcasts, {
    fields: [projects.podcastId],
    references: [podcasts.id],
  }),
  createdBy: one(users, {
    fields: [projects.createdById],
    references: [users.id],
  }),
  transcripts: many(transcripts),
  clips: many(clips),
  mediaAssets: many(mediaAssets),
  textSnippets: many(textSnippets),
  uploadSessions: many(uploadSessions),
  videoSources: many(videoSources),
}));

export const uploadSessionsRelations = relations(uploadSessions, ({ one }) => ({
  podcast: one(podcasts, {
    fields: [uploadSessions.podcastId],
    references: [podcasts.id],
  }),
  episode: one(projects, {
    fields: [uploadSessions.episodeId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [uploadSessions.createdById],
    references: [users.id],
  }),
}));

export const videoSourcesRelations = relations(videoSources, ({ one }) => ({
  project: one(projects, {
    fields: [videoSources.projectId],
    references: [projects.id],
  }),
  person: one(podcastPeople, {
    fields: [videoSources.personId],
    references: [podcastPeople.id],
  }),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  project: one(projects, {
    fields: [transcripts.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [transcripts.createdById],
    references: [users.id],
  }),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  project: one(projects, {
    fields: [clips.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [clips.createdById],
    references: [users.id],
  }),
  renderedClips: many(renderedClips),
  textSnippets: many(textSnippets),
  youtubeUploads: many(youtubeUploads),
  instagramUploads: many(instagramUploads),
  tiktokUploads: many(tiktokUploads),
  xUploads: many(xUploads),
}));

export const textSnippetsRelations = relations(textSnippets, ({ one }) => ({
  project: one(projects, {
    fields: [textSnippets.projectId],
    references: [projects.id],
  }),
  focusClip: one(clips, {
    fields: [textSnippets.focusClipId],
    references: [clips.id],
  }),
  createdBy: one(users, {
    fields: [textSnippets.createdById],
    references: [users.id],
  }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  project: one(projects, {
    fields: [mediaAssets.projectId],
    references: [projects.id],
  }),
}));

export const renderedClipsRelations = relations(renderedClips, ({ one }) => ({
  clip: one(clips, {
    fields: [renderedClips.clipId],
    references: [clips.id],
  }),
}));

export const youtubeUploadsRelations = relations(youtubeUploads, ({ one }) => ({
  clip: one(clips, {
    fields: [youtubeUploads.clipId],
    references: [clips.id],
  }),
  createdBy: one(users, {
    fields: [youtubeUploads.createdById],
    references: [users.id],
  }),
}));

export const instagramUploadsRelations = relations(instagramUploads, ({ one }) => ({
  clip: one(clips, {
    fields: [instagramUploads.clipId],
    references: [clips.id],
  }),
  createdBy: one(users, {
    fields: [instagramUploads.createdById],
    references: [users.id],
  }),
}));

export const tiktokUploadsRelations = relations(tiktokUploads, ({ one }) => ({
  clip: one(clips, {
    fields: [tiktokUploads.clipId],
    references: [clips.id],
  }),
  createdBy: one(users, {
    fields: [tiktokUploads.createdById],
    references: [users.id],
  }),
}));

export const xUploadsRelations = relations(xUploads, ({ one }) => ({
  clip: one(clips, {
    fields: [xUploads.clipId],
    references: [clips.id],
  }),
  createdBy: one(users, {
    fields: [xUploads.createdById],
    references: [users.id],
  }),
}));

export const uploadEventsRelations = relations(uploadEvents, () => ({}));

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
  podcast: one(podcasts, {
    fields: [oauthTokens.podcastId],
    references: [podcasts.id],
  }),
}));

// ============ Type Exports ============

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Podcast = typeof podcasts.$inferSelect;
export type NewPodcast = typeof podcasts.$inferInsert;
export type PodcastMember = typeof podcastMembers.$inferSelect;
export type NewPodcastMember = typeof podcastMembers.$inferInsert;
export type PodcastInvitation = typeof podcastInvitations.$inferSelect;
export type NewPodcastInvitation = typeof podcastInvitations.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type TextSnippet = typeof textSnippets.$inferSelect;
export type NewTextSnippet = typeof textSnippets.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type RenderedClip = typeof renderedClips.$inferSelect;
export type NewRenderedClip = typeof renderedClips.$inferInsert;
export type YouTubeUpload = typeof youtubeUploads.$inferSelect;
export type NewYouTubeUpload = typeof youtubeUploads.$inferInsert;
export type InstagramUpload = typeof instagramUploads.$inferSelect;
export type NewInstagramUpload = typeof instagramUploads.$inferInsert;
export type TikTokUpload = typeof tiktokUploads.$inferSelect;
export type NewTikTokUpload = typeof tiktokUploads.$inferInsert;
export type XUpload = typeof xUploads.$inferSelect;
export type NewXUpload = typeof xUploads.$inferInsert;
export type UploadEvent = typeof uploadEvents.$inferSelect;
export type NewUploadEvent = typeof uploadEvents.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type NewUploadSession = typeof uploadSessions.$inferInsert;
export type PodcastPerson = typeof podcastPeople.$inferSelect;
export type NewPodcastPerson = typeof podcastPeople.$inferInsert;
export type VideoSource = typeof videoSources.$inferSelect;
export type NewVideoSource = typeof videoSources.$inferInsert;
