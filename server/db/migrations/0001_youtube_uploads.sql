CREATE TABLE "youtube_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(255) NOT NULL,
	"clip_id" uuid,
	"youtube_upload_uri" text,
	"youtube_video_id" varchar(50),
	"title" varchar(100) NOT NULL,
	"description" text,
	"tags" text[],
	"privacy_status" varchar(20) DEFAULT 'private',
	"category_id" varchar(10) DEFAULT '22',
	"is_short" boolean DEFAULT false,
	"source_url" text NOT NULL,
	"source_size_bytes" bigint,
	"status" varchar(20) DEFAULT 'pending',
	"bytes_uploaded" bigint DEFAULT 0,
	"upload_progress" integer DEFAULT 0,
	"processing_progress" integer DEFAULT 0,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE INDEX "youtube_uploads_post_id_idx" ON "youtube_uploads" USING btree ("post_id");
--> statement-breakpoint
CREATE INDEX "youtube_uploads_clip_id_idx" ON "youtube_uploads" USING btree ("clip_id");
--> statement-breakpoint
CREATE INDEX "youtube_uploads_status_idx" ON "youtube_uploads" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "youtube_uploads" ADD CONSTRAINT "youtube_uploads_clip_id_clips_v2_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips_v2"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_uploads" ADD CONSTRAINT "youtube_uploads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
