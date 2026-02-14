CREATE TABLE "video_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" varchar(255) NOT NULL,
	"person_id" uuid,
	"source_type" varchar(20) DEFAULT 'speaker' NOT NULL,
	"video_blob_url" text NOT NULL,
	"proxy_blob_url" text,
	"audio_blob_url" text,
	"file_name" varchar(500) NOT NULL,
	"content_type" varchar(100),
	"size_bytes" bigint,
	"duration_seconds" real,
	"width" integer,
	"height" integer,
	"fps" real,
	"sync_offset_ms" integer DEFAULT 0 NOT NULL,
	"sync_method" varchar(30),
	"sync_confidence" real,
	"crop_offset_x" real DEFAULT 50 NOT NULL,
	"crop_offset_y" real DEFAULT 50 NOT NULL,
	"audio_fingerprint" varchar(64),
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips_v2" ADD COLUMN "multicam_layout" jsonb;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD COLUMN "media_type" varchar(10) DEFAULT 'audio';--> statement-breakpoint
ALTER TABLE "projects_v2" ADD COLUMN "default_video_source_id" uuid;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD COLUMN "primary_audio_source_id" uuid;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD COLUMN "mixed_audio_blob_url" text;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD COLUMN "video_sync_status" varchar(20);--> statement-breakpoint
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_project_id_projects_v2_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_person_id_podcast_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."podcast_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_sources_project_id_idx" ON "video_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "video_sources_person_id_idx" ON "video_sources" USING btree ("person_id");