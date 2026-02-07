CREATE TABLE "upload_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(50) NOT NULL,
	"upload_id" varchar(255) NOT NULL,
	"event" varchar(100) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "upload_events_platform_upload_idx" ON "upload_events" USING btree ("platform","upload_id");
--> statement-breakpoint
CREATE INDEX "upload_events_created_at_idx" ON "upload_events" USING btree ("created_at");
