ALTER TABLE "transcripts" ADD COLUMN "source_blob_url" text;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "source_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "source_media_asset_id" uuid;
--> statement-breakpoint
CREATE INDEX "transcripts_source_type_idx" ON "transcripts" USING btree ("source_type");
--> statement-breakpoint
CREATE INDEX "transcripts_source_media_asset_id_idx" ON "transcripts" USING btree ("source_media_asset_id");
