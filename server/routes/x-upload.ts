import { Router, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { renderedClips, xUploads } from "../db/schema.js";
import { getRenderedClipsForClip } from "../lib/media-storage.js";
import { getToken } from "../lib/token-storage.js";
import {
  initMediaUpload,
  streamToX,
  finalizeMediaUpload,
  getMediaStatus,
  createTweet,
} from "../lib/x-upload.js";

const router = Router();

type UploadStatus = "pending" | "uploading" | "processing" | "posting" | "completed" | "failed";

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

function getXConfig() {
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("Missing X_CONSUMER_KEY or X_CONSUMER_SECRET");
  }

  return { consumerKey, consumerSecret };
}

async function processUpload(uploadId: string): Promise<void> {
  const [upload] = await db.select().from(xUploads).where(eq(xUploads.id, uploadId));
  if (!upload) {
    throw new Error("Upload not found");
  }

  if (upload.status === "completed") {
    return;
  }

  const token = await getToken("x");
  if (!token) {
    throw new Error("Not connected to X");
  }

  const { consumerKey, consumerSecret } = getXConfig();

  const totalBytes = await getSourceSize(upload.sourceUrl, upload.sourceSizeBytes ?? undefined);

  let mediaId = upload.xMediaId || undefined;
  if (!mediaId || upload.status === "pending") {
    const init = await initMediaUpload({
      consumerKey,
      consumerSecret,
      token: token.accessToken,
      tokenSecret: token.refreshToken,
      totalBytes,
    });
    mediaId = init.mediaId;

    await db
      .update(xUploads)
      .set({
        xMediaId: mediaId,
        status: "uploading",
        uploadProgress: 0,
        bytesUploaded: 0,
        updatedAt: new Date(),
      })
      .where(eq(xUploads.id, uploadId));
  }

  await streamToX({
    consumerKey,
    consumerSecret,
    token: token.accessToken,
    tokenSecret: token.refreshToken,
    mediaId,
    sourceUrl: upload.sourceUrl,
    totalBytes,
    onProgress: async (bytesUploaded) => {
      await db
        .update(xUploads)
        .set({
          status: "uploading",
          bytesUploaded,
          uploadProgress: Math.round((bytesUploaded / totalBytes) * 100),
          updatedAt: new Date(),
        })
        .where(eq(xUploads.id, uploadId));
    },
  });

  const finalize = await finalizeMediaUpload({
    consumerKey,
    consumerSecret,
    token: token.accessToken,
    tokenSecret: token.refreshToken,
    mediaId,
  });

  if (
    finalize.processingInfo?.state === "pending" ||
    finalize.processingInfo?.state === "in_progress"
  ) {
    while (true) {
      const status = await getMediaStatus({
        consumerKey,
        consumerSecret,
        token: token.accessToken,
        tokenSecret: token.refreshToken,
        mediaId,
      });

      if (status.state === "succeeded") {
        break;
      }

      if (status.state === "failed") {
        throw new Error("X media processing failed");
      }

      await db
        .update(xUploads)
        .set({
          status: "processing",
          processingProgress: 50,
          updatedAt: new Date(),
        })
        .where(eq(xUploads.id, uploadId));

      const delay = (status.checkAfterSeconds ?? 5) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  await db
    .update(xUploads)
    .set({
      status: "posting",
      processingProgress: 80,
      updatedAt: new Date(),
    })
    .where(eq(xUploads.id, uploadId));

  const tweet = await createTweet({
    consumerKey,
    consumerSecret,
    token: token.accessToken,
    tokenSecret: token.refreshToken,
    text: upload.textContent || "",
    mediaId,
  });

  await db
    .update(xUploads)
    .set({
      status: "completed",
      xTweetId: tweet.tweetId,
      processingProgress: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(xUploads.id, uploadId));
}

router.post("/x/upload/init", async (req: Request, res: Response) => {
  try {
    const { postId, clipId, text, format } = req.body as {
      postId?: string;
      clipId?: string;
      text?: string;
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
      .insert(xUploads)
      .values({
        postId,
        clipId,
        textContent: text || "",
        sourceUrl: renderedClip.blobUrl,
        sourceSizeBytes: renderedClip.sizeBytes,
        status: "pending",
        uploadProgress: 0,
        processingProgress: 0,
        createdById: req.user?.userId || null,
      })
      .returning();

    void processUpload(upload.id).catch(async (error) => {
      console.error("X upload failed:", error);
      const [latest] = await db.select().from(xUploads).where(eq(xUploads.id, upload.id));

      const retryCount = (latest?.retryCount || 0) + 1;

      await db
        .update(xUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(xUploads.id, upload.id));
    });

    res.json({ uploadId: upload.id, status: upload.status });
  } catch (error) {
    console.error("Failed to initialize X upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/x/upload/:id/status", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(xUploads).where(eq(xUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    const token = await getToken("x");
    const accountName = token?.accountName;
    const tweetUrl =
      upload.xTweetId && accountName
        ? `https://x.com/${accountName}/status/${upload.xTweetId}`
        : undefined;

    res.json({
      id: upload.id,
      status: upload.status as UploadStatus,
      uploadProgress: upload.uploadProgress || 0,
      processingProgress: upload.processingProgress || 0,
      tweetId: upload.xTweetId || undefined,
      tweetUrl,
      errorMessage: upload.errorMessage || undefined,
    });
  } catch (error) {
    console.error("Failed to fetch X upload status:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/x/upload/:id/retry", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(xUploads).where(eq(xUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    if (upload.status !== "failed") {
      res.status(400).json({ error: `Cannot retry upload in status ${upload.status}` });
      return;
    }

    await db
      .update(xUploads)
      .set({
        status: "pending",
        xMediaId: null,
        xTweetId: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(xUploads.id, uploadId));

    void processUpload(uploadId).catch(async (error) => {
      console.error("X upload retry failed:", error);
      const retryCount = (upload.retryCount || 0) + 1;
      await db
        .update(xUploads)
        .set({
          status: "failed",
          errorMessage: (error as Error).message,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(xUploads.id, uploadId));
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to retry X upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete("/x/upload/:id", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string;
    const [upload] = await db.select().from(xUploads).where(eq(xUploads.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    await db
      .update(xUploads)
      .set({
        status: "failed",
        errorMessage: "Upload canceled",
        updatedAt: new Date(),
      })
      .where(eq(xUploads.id, uploadId));

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel X upload:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const xUploadRouter = router;
