CREATE TABLE "instagram_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(255) NOT NULL,
	"clip_id" uuid,
	"instagram_container_id" text,
	"instagram_media_id" text,
	"caption" text,
	"media_type" varchar(20) DEFAULT 'REELS',
	"share_to_feed" boolean DEFAULT false,
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
CREATE INDEX "instagram_uploads_post_id_idx" ON "instagram_uploads" USING btree ("post_id");
--> statement-breakpoint
ALTER TABLE "instagram_uploads" ADD CONSTRAINT "instagram_uploads_clip_id_clips_v2_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips_v2"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instagram_uploads" ADD CONSTRAINT "instagram_uploads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE TABLE "tiktok_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(255) NOT NULL,
	"clip_id" uuid,
	"tiktok_publish_id" text,
	"tiktok_video_id" text,
	"caption" text,
	"privacy_level" varchar(50),
	"source_url" text NOT NULL,
	"source_size_bytes" bigint,
	"status" varchar(20) DEFAULT 'pending',
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
CREATE INDEX "tiktok_uploads_post_id_idx" ON "tiktok_uploads" USING btree ("post_id");
--> statement-breakpoint
ALTER TABLE "tiktok_uploads" ADD CONSTRAINT "tiktok_uploads_clip_id_clips_v2_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips_v2"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tiktok_uploads" ADD CONSTRAINT "tiktok_uploads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE TABLE "x_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(255) NOT NULL,
	"clip_id" uuid,
	"x_media_id" text,
	"x_tweet_id" text,
	"text_content" text,
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
CREATE INDEX "x_uploads_post_id_idx" ON "x_uploads" USING btree ("post_id");
--> statement-breakpoint
ALTER TABLE "x_uploads" ADD CONSTRAINT "x_uploads_clip_id_clips_v2_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips_v2"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "x_uploads" ADD CONSTRAINT "x_uploads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
