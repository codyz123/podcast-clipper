import { Router, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { renderedClips, instagramUploads } from "../db/schema.js";
import { getRenderedClipsForClip } from "../lib/media-storage.js";
import { getToken, saveToken } from "../lib/token-storage.js";
import { refreshAccessToken } from "../lib/oauth-providers/instagram.js";
import {
  createMediaContainer,
  getContainerStatus,
  publishContainer,
} from "../lib/instagram-upload.js";

const router = Router();

type UploadStatus = "pending" | "processing" | "publishing" | "completed" | "failed";

const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

async function getValidAccessToken(forceRefresh: boolean = false): Promise<{
  accessToken: string;
  accountId: string;
  accountName?: string;
}> {
  const token = await getToken("instagram");
  if (!token) {
    throw new Error("Not connected to Instagram");
  }

  const expiresIn = token.expiresAt.getTime() - Date.now();
  if (forceRefresh || expiresIn < TOKEN_REFRESH_THRESHOLD_MS) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await saveToken(
      "instagram",
      refreshed.accessToken,
      refreshed.refreshToken,
      refreshed.expiresAt,
      refreshed.accountName,
      refreshed.accountId
    );

    return {
      accessToken: refreshed.accessToken,
      accountId: refreshed.accountId,
      accountName: refreshed.accountName,
    };
  }

  if (!token.accountId) {
    throw new Error("Instagram account is missing an account ID");
  }

  return {
    accessToken: token.accessToken,
    accountId: token.accountId,
    accountName: token.accountName,
  };
}

async function getSourceSize(url: string, fallback?: number): Promise<number> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      const length = head.headers.get("content-length");
      if (length) {
        const size = Number(length);
        if (Number.isFinite(size)) return size;
      }
    }
  } catch (error) {
    console.warn("Failed to HEAD source URL:", error);
  }

  try {
    const range = await fetch(url, { headers: { Range: "bytes=0-0" } });
    if (range.ok) {
      const contentRange = range.headers.get("content-range");
      const match = contentRange?.match(/\/(\d+)$/);
      if (match) {
        const size = Number(match[1]);
        if (Number.isFinite(size)) return size;
      }
    }
  } catch (error) {
    console.warn("Failed to range-fetch source URL:", error);
  }

  if (fallback && Number.isFinite(fallback)) {
    return fallback;
  }

  throw new Error("Unable to determine source file size");
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
  const [upload] = await db
    .select()
    .from(instagramUploads)
    .where(eq(instagramUploads.id, uploadId));

  if (!upload) {
    throw new Error("Upload not found");
  }

  if (upload.status === "completed") {
    return;
  }

  if (!upload.sourceUrl) {
    throw new Error("Missing source URL");
  }

  const { accessToken, accountId } = await getValidAccessToken();

  let containerId = upload.instagramContainerId || undefined;

  if (!containerId || upload.status === "pending") {
    containerId = await createMediaContainer({
      igUserId: accountId,
      accessToken,
      videoUrl: upload.sourceUrl,
      caption: upload.caption || undefined,
      mediaType: (upload.mediaType || "REELS") as "REELS" | "VIDEO",
      shareToFeed: upload.shareToFeed ?? false,
    });

    await db
      .update(instagramUploads)
      .set({
        instagramContainerId: containerId,
        status: "processing",
        uploadProgress: 100,
        updatedAt: new Date(),
      })
      .where(eq(instagramUploads.id, uploadId));
  }

  while (true) {
    const status = await getContainerStatus({ containerId, accessToken });
    if (status.statusCode === "FINISHED") {
      break;
    }

    if (status.statusCode === "ERROR") {
      throw new Error("Instagram processing failed");
    }

    await db
      .update(instagramUploads)
      .set({
        status: "processing",
        processingProgress: 50,
        updatedAt: new Date(),
      })
      .where(eq(instagramUploads.id, uploadId));

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  await db
    .update(instagramUploads)
    .set({
      status: "publishing",
      processingProgress: 80,
      updatedAt: new Date(),
    })
    .where(eq(instagramUploads.id, uploadId));

  const mediaId = await publishContainer({
    igUserId: accountId,
    accessToken,
    containerId,
  });

  await db
    .update(instagramUploads)
    .set({
      status: "completed",
      instagramMediaId: mediaId,
      processingProgress: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(instagramUploads.id, uploadId));
}

router.post("/instagram/upload/init", async (req: Request, res: Response) => {
  try {
    const { postId, clipId, caption, format, mediaType, shareToFeed } = req.body as {
      postId?: string;
      clipId?: string;
      caption?: string;
      format?: string;
      mediaType?: "REELS" | "VIDEO";
      shareToFeed?: boolean;
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

    const sourceUrl = renderedClip.blobUrl;
    const sourceSizeBytes = await getSourceSize(sourceUrl, renderedClip.sizeBytes);

    const [upload] = await db
      .insert(instagramUploads)
      .values({
        postId,
        clipId,
        caption: caption || "",
        mediaType: mediaType || "REELS",
        shareToFeed: shareToFeed ?? false,
        sourceUrl,
        sourceSizeBytes,
        status: "pending",
        uploadProgress: 0,
        processingProgress: 0,
        createdById: req.user?.userId || null,
      })
      .returning();

    void processUpload(upload.id).catch(async (error) => {
      console.error("Instagram upload failed:", error);
      const [latest] = await db
        .select()
        .from(instagramUploads)
        .where(eq(instagramUploads.id, upload.id));

      const retryCount = (latest?.retryCount || 0) + 1;

      await db
        .update(instagramUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(instagramUploads.id, upload.id));
    });

    res.json({ uploadId: upload.id, status: upload.status });
  } catch (error) {
    console.error("Failed to initialize Instagram upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/instagram/upload/:id/status", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db
      .select()
      .from(instagramUploads)
      .where(eq(instagramUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    res.json({
      id: upload.id,
      status: upload.status as UploadStatus,
      uploadProgress: upload.uploadProgress || 0,
      processingProgress: upload.processingProgress || 0,
      mediaId: upload.instagramMediaId || undefined,
      errorMessage: upload.errorMessage || undefined,
    });
  } catch (error) {
    console.error("Failed to fetch Instagram upload status:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/instagram/upload/:id/retry", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db
      .select()
      .from(instagramUploads)
      .where(eq(instagramUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    if (upload.status !== "failed") {
      res.status(400).json({ error: `Cannot retry upload in status ${upload.status}` });
      return;
    }

    await db
      .update(instagramUploads)
      .set({
        status: "pending",
        instagramContainerId: null,
        instagramMediaId: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(instagramUploads.id, uploadId));

    void processUpload(uploadId).catch(async (error) => {
      console.error("Instagram upload retry failed:", error);
      const retryCount = (upload.retryCount || 0) + 1;
      await db
        .update(instagramUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(instagramUploads.id, uploadId));
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to retry Instagram upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete("/instagram/upload/:id", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db
      .select()
      .from(instagramUploads)
      .where(eq(instagramUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    await db
      .update(instagramUploads)
      .set({
        status: "failed",
        errorMessage: "Upload canceled",
        updatedAt: new Date(),
      })
      .where(eq(instagramUploads.id, uploadId));

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel Instagram upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const instagramUploadRouter = router;
