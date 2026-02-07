import { db } from "../db/index.js";
import { uploadEvents } from "../db/schema.js";

export type UploadEventPlatform = "youtube" | "instagram" | "tiktok" | "x";

export async function recordUploadEvent(params: {
  platform: UploadEventPlatform;
  uploadId: string;
  event: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(uploadEvents).values({
      platform: params.platform,
      uploadId: params.uploadId,
      event: params.event,
      detail: params.detail ?? null,
    });
  } catch (error) {
    console.warn("Failed to record upload event:", error);
  }
}
