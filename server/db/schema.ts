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

    // Vercel Blob multipart identifiers (required for uploadPart/complete)
    uploadId: varchar("upload_id", { length: 255 }).notNull(),
    blobKey: varchar("blob_key", { length: 255 }).notNull(),
    pathname: varchar("pathname", { length: 500 }).notNull(),

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
    tracks: jsonb("tracks"), // Track[] from types.ts
    captionStyle: jsonb("caption_style"), // CaptionStyle from types.ts
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
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type NewUploadSession = typeof uploadSessions.$inferInsert;
