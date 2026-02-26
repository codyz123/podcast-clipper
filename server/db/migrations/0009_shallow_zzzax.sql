CREATE TABLE "episode_render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"timeline_snapshot" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_chunk" integer DEFAULT 0,
	"total_chunks" integer,
	"error_message" text,
	"blob_url" text,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "episode_timelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration" real DEFAULT 0 NOT NULL,
	"fps" integer DEFAULT 30 NOT NULL,
	"multicam_config" jsonb,
	"caption_style" jsonb,
	"background" jsonb DEFAULT '{"type":"gradient","gradientColors":["#667eea","#764ba2"],"gradientDirection":135}'::jsonb NOT NULL,
	"markers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clip_markers" jsonb DEFAULT '[]'::jsonb,
	"format" varchar(10) DEFAULT '16:9' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_timelines_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "podcast_branding_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(50) DEFAULT 'logo' NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" varchar(100),
	"size_bytes" bigint,
	"width" integer,
	"height" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rendered_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"timeline_id" uuid,
	"name" varchar(255),
	"format" varchar(50) NOT NULL,
	"blob_url" text NOT NULL,
	"size_bytes" bigint,
	"duration_seconds" real,
	"rendered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_sessions" ALTER COLUMN "upload_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ALTER COLUMN "blob_key" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ALTER COLUMN "pathname" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "media_assets_v2" ADD COLUMN "category" varchar(50) DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets_v2" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "media_assets_v2" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets_v2" ADD COLUMN "fps" real;--> statement-breakpoint
ALTER TABLE "video_sources" ADD COLUMN "content_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "episode_render_jobs" ADD CONSTRAINT "episode_render_jobs_project_id_projects_v2_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_timelines" ADD CONSTRAINT "episode_timelines_project_id_projects_v2_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_branding_assets" ADD CONSTRAINT "podcast_branding_assets_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendered_episodes" ADD CONSTRAINT "rendered_episodes_project_id_projects_v2_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendered_episodes" ADD CONSTRAINT "rendered_episodes_timeline_id_episode_timelines_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."episode_timelines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_render_jobs_project_id_idx" ON "episode_render_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "episode_render_jobs_status_idx" ON "episode_render_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "episode_timelines_project_id_idx" ON "episode_timelines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "podcast_branding_assets_podcast_id_idx" ON "podcast_branding_assets" USING btree ("podcast_id");--> statement-breakpoint
CREATE INDEX "rendered_episodes_project_id_idx" ON "rendered_episodes" USING btree ("project_id");