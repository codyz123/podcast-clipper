import { Router, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { renderedClips, tiktokUploads } from "../db/schema.js";
import { getRenderedClipsForClip } from "../lib/media-storage.js";
import { getToken, saveToken } from "../lib/token-storage.js";
import { refreshAccessToken } from "../lib/oauth-providers/tiktok.js";
import { queryCreatorInfo, initDirectPost, fetchPublishStatus } from "../lib/tiktok-upload.js";

const router = Router();

type UploadStatus = "pending" | "processing" | "completed" | "failed";

const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

async function getValidAccessToken(forceRefresh: boolean = false): Promise<{
  accessToken: string;
  accountName?: string;
}> {
  const token = await getToken("tiktok");
  if (!token) {
    throw new Error("Not connected to TikTok");
  }

  const expiresIn = token.expiresAt.getTime() - Date.now();
  if (forceRefresh || expiresIn < TOKEN_REFRESH_THRESHOLD_MS) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await saveToken(
      "tiktok",
      refreshed.accessToken,
      refreshed.refreshToken,
      refreshed.expiresAt,
      refreshed.accountName,
      refreshed.accountId
    );

    return { accessToken: refreshed.accessToken, accountName: refreshed.accountName };
  }

  return { accessToken: token.accessToken, accountName: token.accountName };
}

async function loadRenderedClips(clipId: string): Promise<
  Array<{
    format: string;
    blobUrl: string;
    sizeBytes?: number;
  }>
> {
  const v2Clips = await db
    .select({
      format: renderedClips.format,
      blobUrl: renderedClips.blobUrl,
      sizeBytes: renderedClips.sizeBytes,
      renderedAt: renderedClips.renderedAt,
    })
    .from(renderedClips)
    .where(eq(renderedClips.clipId, clipId))
    .orderBy(desc(renderedClips.renderedAt));

  if (v2Clips.length > 0) {
    return v2Clips.map((clip) => ({
      format: clip.format,
      blobUrl: clip.blobUrl,
      sizeBytes: clip.sizeBytes ?? undefined,
    }));
  }

  return getRenderedClipsForClip(clipId);
}

async function processUpload(uploadId: string): Promise<void> {
  const [upload] = await db.select().from(tiktokUploads).where(eq(tiktokUploads.id, uploadId));
  if (!upload) {
    throw new Error("Upload not found");
  }

  if (upload.status === "completed") {
    return;
  }

  const { accessToken } = await getValidAccessToken();

  let publishId = upload.tiktokPublishId || undefined;
  if (!publishId || upload.status === "pending") {
    const creatorInfo = await queryCreatorInfo(accessToken);
    const privacyLevel =
      upload.privacyLevel || creatorInfo.privacyLevels?.[0] || "PUBLIC_TO_EVERYONE";

    const init = await initDirectPost({
      accessToken,
      caption: upload.caption || "",
      videoUrl: upload.sourceUrl,
      privacyLevel,
    });

    publishId = init.publishId;

    await db
      .update(tiktokUploads)
      .set({
        tiktokPublishId: publishId,
        privacyLevel,
        status: "processing",
        uploadProgress: 100,
        processingProgress: 10,
        updatedAt: new Date(),
      })
      .where(eq(tiktokUploads.id, uploadId));
  }

  while (true) {
    const status = await fetchPublishStatus({ accessToken, publishId });

    if (status.status) {
      const normalized = status.status.toUpperCase();
      if (normalized.includes("FAILED")) {
        throw new Error("TikTok publish failed");
      }
      if (normalized.includes("COMPLETE") || normalized.includes("SUCCESS")) {
        await db
          .update(tiktokUploads)
          .set({
            status: "completed",
            tiktokVideoId: status.videoId || status.shareId || upload.tiktokVideoId,
            processingProgress: 100,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tiktokUploads.id, uploadId));
        return;
      }
    }

    await db
      .update(tiktokUploads)
      .set({
        status: "processing",
        processingProgress: 50,
        updatedAt: new Date(),
      })
      .where(eq(tiktokUploads.id, uploadId));

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

router.post("/tiktok/upload/init", async (req: Request, res: Response) => {
  try {
    const { postId, clipId, caption, format } = req.body as {
      postId?: string;
      clipId?: string;
      caption?: string;
      format?: string;
    };

    if (!postId || !clipId) {
      res.status(400).json({ error: "postId and clipId are required" });
      return;
    }

    const renderedClips = await loadRenderedClips(clipId);
    if (!renderedClips.length) {
      res.status(404).json({ error: "No rendered clip found" });
      return;
    }

    const renderedClip =
      (format ? renderedClips.find((clip) => clip.format === format) : undefined) ||
      renderedClips[0];

    const [upload] = await db
      .insert(tiktokUploads)
      .values({
        postId,
        clipId,
        caption: caption || "",
        sourceUrl: renderedClip.blobUrl,
        sourceSizeBytes: renderedClip.sizeBytes,
        status: "pending",
        uploadProgress: 0,
        processingProgress: 0,
        createdById: req.user?.userId || null,
      })
      .returning();

    void processUpload(upload.id).catch(async (error) => {
      console.error("TikTok upload failed:", error);
      const [latest] = await db.select().from(tiktokUploads).where(eq(tiktokUploads.id, upload.id));

      const retryCount = (latest?.retryCount || 0) + 1;

      await db
        .update(tiktokUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(tiktokUploads.id, upload.id));
    });

    res.json({ uploadId: upload.id, status: upload.status });
  } catch (error) {
    console.error("Failed to initialize TikTok upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/tiktok/upload/:id/status", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(tiktokUploads).where(eq(tiktokUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    res.json({
      id: upload.id,
      status: upload.status as UploadStatus,
      uploadProgress: upload.uploadProgress || 0,
      processingProgress: upload.processingProgress || 0,
      videoId: upload.tiktokVideoId || undefined,
      errorMessage: upload.errorMessage || undefined,
    });
  } catch (error) {
    console.error("Failed to fetch TikTok upload status:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/tiktok/upload/:id/retry", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(tiktokUploads).where(eq(tiktokUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    if (upload.status !== "failed") {
      res.status(400).json({ error: `Cannot retry upload in status ${upload.status}` });
      return;
    }

    await db
      .update(tiktokUploads)
      .set({
        status: "pending",
        tiktokPublishId: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(tiktokUploads.id, uploadId));

    void processUpload(uploadId).catch(async (error) => {
      console.error("TikTok upload retry failed:", error);
      const retryCount = (upload.retryCount || 0) + 1;
      await db
        .update(tiktokUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(tiktokUploads.id, uploadId));
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to retry TikTok upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete("/tiktok/upload/:id", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(tiktokUploads).where(eq(tiktokUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    await db
      .update(tiktokUploads)
      .set({
        status: "failed",
        errorMessage: "Upload canceled",
        updatedAt: new Date(),
      })
      .where(eq(tiktokUploads.id, uploadId));

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel TikTok upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const tiktokUploadRouter = router;
