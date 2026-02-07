import { Router, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { renderedClips, youtubeUploads } from "../db/schema.js";
import { getRenderedClipsForClip } from "../lib/media-storage.js";
import { getToken, updateToken } from "../lib/token-storage.js";
import { refreshAccessToken } from "../lib/oauth-providers/youtube.js";
import {
  initializeResumableUpload,
  streamToYouTube,
  getUploadResumePosition,
  checkProcessingStatus,
} from "../lib/youtube-upload.js";
import { recordUploadEvent } from "../lib/upload-events.js";

const router = Router();

type UploadStatus = "pending" | "uploading" | "processing" | "completed" | "failed";

const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function buildYouTubeUrl(videoId: string, isShort: boolean): string {
  return isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

async function getValidAccessToken(forceRefresh: boolean = false): Promise<string> {
  const token = await getToken("youtube");
  if (!token) {
    throw new Error("Not connected to YouTube");
  }

  const expiresIn = token.expiresAt.getTime() - Date.now();
  if (forceRefresh || expiresIn < TOKEN_REFRESH_THRESHOLD_MS) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await updateToken("youtube", refreshed.accessToken, refreshed.expiresAt);
    return refreshed.accessToken;
  }

  return token.accessToken;
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
  await recordUploadEvent({ platform: "youtube", uploadId, event: "process_start" });
  const [upload] = await db.select().from(youtubeUploads).where(eq(youtubeUploads.id, uploadId));

  if (!upload) {
    await recordUploadEvent({
      platform: "youtube",
      uploadId,
      event: "process_error",
      detail: { message: "Upload not found" },
    });
    throw new Error("Upload not found");
  }

  if (upload.status === "completed") {
    return;
  }

  if (upload.status === "processing" && upload.youtubeVideoId) {
    await recordUploadEvent({
      platform: "youtube",
      uploadId,
      event: "processing_resume",
      detail: { videoId: upload.youtubeVideoId },
    });
    await pollProcessing(uploadId, upload.youtubeVideoId);
    return;
  }

  if (!upload.youtubeUploadUri) {
    await recordUploadEvent({
      platform: "youtube",
      uploadId,
      event: "process_error",
      detail: { message: "Missing YouTube upload URI" },
    });
    throw new Error("Missing YouTube upload URI");
  }

  if (!upload.sourceSizeBytes) {
    await recordUploadEvent({
      platform: "youtube",
      uploadId,
      event: "process_error",
      detail: { message: "Missing source size" },
    });
    throw new Error("Missing source size");
  }

  await db
    .update(youtubeUploads)
    .set({ status: "uploading", errorMessage: null, updatedAt: new Date() })
    .where(eq(youtubeUploads.id, uploadId));

  const totalSize = upload.sourceSizeBytes;
  let startByte = upload.bytesUploaded || 0;
  let lastLoggedProgress = Math.floor((startByte / totalSize) * 100);

  if (startByte > 0) {
    const accessToken = await getValidAccessToken();
    const resumeFrom = await getUploadResumePosition(
      upload.youtubeUploadUri,
      accessToken,
      totalSize
    );
    if (resumeFrom !== startByte) {
      startByte = resumeFrom;
      lastLoggedProgress = Math.floor((startByte / totalSize) * 100);
      await db
        .update(youtubeUploads)
        .set({
          bytesUploaded: startByte,
          uploadProgress: Math.round((startByte / totalSize) * 100),
          updatedAt: new Date(),
        })
        .where(eq(youtubeUploads.id, uploadId));
    }
  }

  await recordUploadEvent({
    platform: "youtube",
    uploadId,
    event: "upload_start",
    detail: { totalSize, startByte },
  });

  const videoId = await streamToYouTube(
    upload.youtubeUploadUri,
    upload.sourceUrl,
    getValidAccessToken,
    startByte,
    totalSize,
    async (bytesUploaded) => {
      const progress = Math.round((bytesUploaded / totalSize) * 100);
      await db
        .update(youtubeUploads)
        .set({
          bytesUploaded,
          uploadProgress: progress,
          updatedAt: new Date(),
        })
        .where(eq(youtubeUploads.id, uploadId));

      if (progress >= lastLoggedProgress + 10 || progress === 100) {
        lastLoggedProgress = progress;
        await recordUploadEvent({
          platform: "youtube",
          uploadId,
          event: "upload_progress",
          detail: { bytesUploaded, progress },
        });
      }
    }
  );

  await db
    .update(youtubeUploads)
    .set({
      status: "processing",
      youtubeVideoId: videoId,
      uploadProgress: 100,
      bytesUploaded: totalSize,
      updatedAt: new Date(),
    })
    .where(eq(youtubeUploads.id, uploadId));

  await recordUploadEvent({
    platform: "youtube",
    uploadId,
    event: "upload_complete",
    detail: { videoId },
  });

  await pollProcessing(uploadId, videoId);
}

async function pollProcessing(uploadId: string, videoId: string): Promise<void> {
  while (true) {
    const accessToken = await getValidAccessToken();
    const status = await checkProcessingStatus(videoId, accessToken);

    if (status.status === "processed") {
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "processing_complete",
        detail: { videoId },
      });
      await db
        .update(youtubeUploads)
        .set({
          status: "completed",
          processingProgress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(youtubeUploads.id, uploadId));
      return;
    }

    if (status.status === "failed") {
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "processing_failed",
        detail: { videoId },
      });
      throw new Error("YouTube processing failed");
    }

    if (typeof status.progress === "number") {
      await db
        .update(youtubeUploads)
        .set({
          status: "processing",
          processingProgress: status.progress,
          updatedAt: new Date(),
        })
        .where(eq(youtubeUploads.id, uploadId));

      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "processing_progress",
        detail: { progress: status.progress, videoId },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

router.post("/youtube/upload/init", async (req: Request, res: Response) => {
  try {
    const { postId, clipId, title, description, tags, privacyStatus, categoryId, isShort, format } =
      req.body as {
        postId?: string;
        clipId?: string;
        title?: string;
        description?: string;
        tags?: string[];
        privacyStatus?: "public" | "private" | "unlisted";
        categoryId?: string;
        isShort?: boolean;
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

    const sourceUrl = renderedClip.blobUrl;
    const sourceSizeBytes = await getSourceSize(sourceUrl, renderedClip.sizeBytes);

    const filteredTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0)
      : [];

    if (isShort && !filteredTags.some((tag) => tag.toLowerCase() === "#shorts")) {
      filteredTags.push("#Shorts");
    }

    const accessToken = await getValidAccessToken();
    const uploadUri = await initializeResumableUpload(
      accessToken,
      {
        title: (title || "Untitled").slice(0, 100),
        description: description || "",
        tags: filteredTags,
        privacyStatus: privacyStatus || "public",
        categoryId: categoryId || "22",
      },
      sourceSizeBytes
    );

    const [upload] = await db
      .insert(youtubeUploads)
      .values({
        postId,
        clipId,
        youtubeUploadUri: uploadUri,
        title: (title || "Untitled").slice(0, 100),
        description: description || "",
        tags: filteredTags,
        privacyStatus: privacyStatus || "public",
        categoryId: categoryId || "22",
        isShort: !!isShort,
        sourceUrl,
        sourceSizeBytes,
        status: "pending",
        bytesUploaded: 0,
        uploadProgress: 0,
        processingProgress: 0,
        createdById: req.user?.userId || null,
      })
      .returning();

    await recordUploadEvent({
      platform: "youtube",
      uploadId: upload.id,
      event: "init",
      detail: {
        postId,
        clipId,
        sourceUrl,
        sourceSizeBytes,
        isShort: !!isShort,
      },
    });

    void processUpload(upload.id).catch(async (error) => {
      console.error("YouTube upload failed:", error);
      await recordUploadEvent({
        platform: "youtube",
        uploadId: upload.id,
        event: "upload_failed",
        detail: { message: (error as Error).message },
      });
      const [latest] = await db
        .select()
        .from(youtubeUploads)
        .where(eq(youtubeUploads.id, upload.id));

      const retryCount = (latest?.retryCount || 0) + 1;

      await db
        .update(youtubeUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(youtubeUploads.id, upload.id));
    });

    res.json({ uploadId: upload.id, status: upload.status });
  } catch (error) {
    console.error("Failed to initialize YouTube upload:", error);
    if (req.body?.postId && req.body?.clipId) {
      await recordUploadEvent({
        platform: "youtube",
        uploadId: `${req.body.postId}:${req.body.clipId}`,
        event: "init_error",
        detail: { message: (error as Error).message },
      });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/youtube/upload/:id/status", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(youtubeUploads).where(eq(youtubeUploads.id, uploadId));

    if (!upload) {
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "status_not_found",
      });
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    const videoUrl =
      upload.youtubeVideoId && upload.status === "completed"
        ? buildYouTubeUrl(upload.youtubeVideoId, !!upload.isShort)
        : undefined;

    res.json({
      id: upload.id,
      status: upload.status as UploadStatus,
      uploadProgress: upload.uploadProgress || 0,
      processingProgress: upload.processingProgress || 0,
      videoId: upload.youtubeVideoId || undefined,
      videoUrl,
      errorMessage: upload.errorMessage || undefined,
    });
  } catch (error) {
    console.error("Failed to fetch upload status:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/youtube/upload/:id/retry", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(youtubeUploads).where(eq(youtubeUploads.id, uploadId));

    if (!upload) {
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "retry_not_found",
      });
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    if (upload.status !== "failed") {
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "retry_invalid_status",
        detail: { status: upload.status },
      });
      res.status(400).json({ error: `Cannot retry upload in status ${upload.status}` });
      return;
    }

    await db
      .update(youtubeUploads)
      .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
      .where(eq(youtubeUploads.id, uploadId));

    void processUpload(uploadId).catch(async (error) => {
      console.error("YouTube upload retry failed:", error);
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "retry_failed",
        detail: { message: (error as Error).message },
      });
      const retryCount = (upload.retryCount || 0) + 1;
      await db
        .update(youtubeUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(youtubeUploads.id, uploadId));
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to retry upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete("/youtube/upload/:id", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(youtubeUploads).where(eq(youtubeUploads.id, uploadId));

    if (!upload) {
      await recordUploadEvent({
        platform: "youtube",
        uploadId,
        event: "cancel_not_found",
      });
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    await db
      .update(youtubeUploads)
      .set({
        status: "failed",
        errorMessage: "Upload canceled",
        updatedAt: new Date(),
      })
      .where(eq(youtubeUploads.id, uploadId));

    await recordUploadEvent({
      platform: "youtube",
      uploadId,
      event: "upload_canceled",
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const youtubeUploadRouter = router;
