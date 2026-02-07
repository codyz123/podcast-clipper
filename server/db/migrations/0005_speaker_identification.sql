CREATE TABLE IF NOT EXISTS "podcast_people" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "podcast_id" uuid NOT NULL REFERENCES "podcasts"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "role" varchar(50) NOT NULL DEFAULT 'guest',
  "photo_url" text,
  "bio" text,
  "website" varchar(500),
  "twitter" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "podcast_people_podcast_id_idx" ON "podcast_people" ("podcast_id");

ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "segments" jsonb;
ALTER TABLE "clips_v2" ADD COLUMN IF NOT EXISTS "segments" jsonb;
