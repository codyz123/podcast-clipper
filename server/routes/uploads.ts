import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "../db/index.js";
import { uploadSessions, projects, podcastMembers, mediaAssets } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { createMultipartUpload, uploadPart, completeMultipartUpload } from "../lib/r2-storage.js";

const router = Router();
const execFileAsync = promisify(execFile);

type UploadTarget = "audio" | "media-asset" | "video-source";

function parseTarget(value: unknown): UploadTarget {
  if (value === "media-asset" || value === "video-source") {
    return value;
  }
  return "audio";
}

async function probeVideoMetadata(
  url: string
): Promise<{ durationSeconds?: number; width?: number; height?: number; fps?: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        url,
      ],
      { timeout: 10_000 }
    );
    const data = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>;
      format?: { duration?: string };
    };
    const stream = data.streams?.[0];
    const [num, den] = (stream?.r_frame_rate || "0/1").split("/").map((part) => Number(part) || 0);
    const fps = den > 0 ? num / den : undefined;
    const duration = data.format?.duration ? Number.parseFloat(data.format.duration) : undefined;
    return {
      durationSeconds: Number.isFinite(duration) ? duration : undefined,
      width: stream?.width,
      height: stream?.height,
      fps: Number.isFinite(fps) ? fps : undefined,
    };
  } catch (error) {
    console.warn("Video metadata probe failed:", error);
    return null;
  }
}

// Chunk size calculation (5MB min, 50MB max, target ~1000 parts)
function calculateChunkSize(totalBytes: number): number {
  const MIN = 5 * 1024 * 1024; // 5MB - Vercel minimum
  const MAX = 50 * 1024 * 1024; // 50MB - reasonable upload size
  const TARGET_PARTS = 1000;
  return Math.min(MAX, Math.max(MIN, Math.ceil(totalBytes / TARGET_PARTS)));
}

// Verify user has access to podcast
async function verifyAccess(userId: string, podcastId: string): Promise<boolean> {
  const [membership] = await db
    .select()
    .from(podcastMembers)
    .where(and(eq(podcastMembers.podcastId, podcastId), eq(podcastMembers.userId, userId)));
  return !!membership;
}

function hasVideoExtension(filename: string): boolean {
  return /\.(mp4|mov|mkv|webm|avi)$/i.test(filename);
}

function isVideoUpload(contentType: string, filename: string): boolean {
  const normalized = (contentType || "").toLowerCase();
  return normalized.startsWith("video/") || hasVideoExtension(filename);
}

function inferAssetTypeFromUpload(contentType: string, filename: string): string {
  if (isVideoUpload(contentType, filename)) return "video";
  const normalized = (contentType || "").toLowerCase();
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("image/")) return "image";
  return "unknown";
}

// POST /api/podcasts/:podcastId/episodes/:episodeId/uploads/init
router.post(
  "/:podcastId/episodes/:episodeId/uploads/init",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const podcastId = req.params.podcastId as string;
      const episodeId = req.params.episodeId as string;
      const { filename, contentType, totalBytes } = req.body;
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const userId = req.user.userId;

      // Validate access
      if (!(await verifyAccess(userId, podcastId))) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Validate size (50GB max)
      if (totalBytes > 50 * 1024 * 1024 * 1024) {
        res.status(400).json({ error: "File exceeds 50GB limit" });
        return;
      }

      // Verify episode exists
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));
      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      const chunkSize = calculateChunkSize(totalBytes);
      const totalParts = Math.ceil(totalBytes / chunkSize);
      const pathname = `podcasts/${podcastId}/episodes/${episodeId}/${Date.now()}-${filename}`;

      // Initialize R2 multipart upload
      const { key, uploadId } = await createMultipartUpload(pathname, contentType);

      // Store session in database
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const [session] = await db
        .insert(uploadSessions)
        .values({
          podcastId,
          episodeId,
          uploadId,
          blobKey: key,
          pathname,
          filename,
          contentType,
          totalBytes,
          chunkSize,
          totalParts,
          expiresAt,
          createdById: userId,
          status: "uploading",
        })
        .returning();

      res.json({
        sessionId: session.id,
        chunkSize,
        totalParts,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Upload init error:", error);
      res.status(500).json({ error: "Failed to initialize upload" });
    }
  }
);

// POST /api/podcasts/:podcastId/episodes/:episodeId/uploads/:sessionId/part/:partNumber
router.post(
  "/:podcastId/episodes/:episodeId/uploads/:sessionId/part/:partNumber",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const podcastId = req.params.podcastId as string;
      const episodeId = req.params.episodeId as string;
      const sessionId = req.params.sessionId as string;
      const partNumber = parseInt(req.params.partNumber as string, 10);

      if (isNaN(partNumber) || partNumber < 1) {
        res.status(400).json({ error: "Invalid part number" });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!(await verifyAccess(req.user.userId, podcastId))) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const chunk = req.body as Buffer; // From express.raw()

      if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
        res.status(400).json({ error: "No chunk data received" });
        return;
      }

      // Get session
      const [session] = await db
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId));

      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }
      if (session.podcastId !== podcastId || session.episodeId !== episodeId) {
        res.status(403).json({ error: "Upload session does not belong to this episode" });
        return;
      }
      if (session.createdById !== req.user.userId) {
        res.status(403).json({ error: "Upload session does not belong to this user" });
        return;
      }
      if (session.status !== "uploading") {
        res.status(400).json({ error: `Session status is ${session.status}` });
        return;
      }
      if (partNumber > session.totalParts) {
        res.status(400).json({ error: "Part number exceeds expected total parts" });
        return;
      }
      if (new Date() > session.expiresAt) {
        await db
          .update(uploadSessions)
          .set({ status: "expired" })
          .where(eq(uploadSessions.id, sessionId));
        res.status(410).json({ error: "Upload session expired" });
        return;
      }

      // Check if part already uploaded (idempotent)
      const existingPart = session.completedParts?.find((p) => p.partNumber === partNumber);
      if (existingPart) {
        res.json({
          partNumber,
          etag: existingPart.etag,
          skipped: true,
        });
        return;
      }

      // Upload to R2
      const part = await uploadPart(session.blobKey, session.uploadId, partNumber, chunk);

      // Update session
      const updatedParts = [...(session.completedParts || []), { partNumber, etag: part.etag }];
      const uploadedBytes = (session.uploadedBytes || 0) + chunk.length;

      await db
        .update(uploadSessions)
        .set({
          completedParts: updatedParts,
          uploadedBytes,
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, sessionId));

      res.json({
        partNumber,
        etag: part.etag,
        uploadedBytes,
        progress: Math.round((updatedParts.length / session.totalParts) * 100),
      });
    } catch (error) {
      console.error("Part upload error:", error);
      res.status(500).json({ error: "Failed to upload chunk" });
    }
  }
);

// POST /api/podcasts/:podcastId/episodes/:episodeId/uploads/:sessionId/complete
router.post(
  "/:podcastId/episodes/:episodeId/uploads/:sessionId/complete",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    const podcastId = req.params.podcastId as string;
    const sessionId = req.params.sessionId as string;
    const episodeId = req.params.episodeId as string;
    const target = parseTarget((req.body as { target?: string } | undefined)?.target);
    const category =
      typeof (req.body as { category?: unknown } | undefined)?.category === "string"
        ? ((req.body as { category?: string }).category || "").trim() || undefined
        : undefined;
    const customName =
      typeof (req.body as { name?: unknown } | undefined)?.name === "string"
        ? ((req.body as { name?: string }).name || "").trim() || undefined
        : undefined;

    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!(await verifyAccess(req.user.userId, podcastId))) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const [session] = await db
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId));

      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      if (session.podcastId !== podcastId || session.episodeId !== episodeId) {
        res.status(403).json({ error: "Upload session does not belong to this episode" });
        return;
      }
      if (session.createdById !== req.user.userId) {
        res.status(403).json({ error: "Upload session does not belong to this user" });
        return;
      }

      // Idempotent completion
      if (session.status === "completed" && session.blobUrl) {
        let existingAssetId: string | undefined;
        if (target === "audio") {
          await db
            .update(projects)
            .set({
              audioBlobUrl: session.blobUrl,
              audioFileName: session.filename,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, episodeId));
        }

        if (target === "media-asset") {
          const videoUpload = isVideoUpload(session.contentType, session.filename);

          if (videoUpload) {
            await db
              .update(projects)
              .set({
                mediaType: "video",
                updatedAt: new Date(),
              })
              .where(eq(projects.id, episodeId));
          }

          const [asset] = await db
            .select({ id: mediaAssets.id })
            .from(mediaAssets)
            .where(
              and(eq(mediaAssets.projectId, episodeId), eq(mediaAssets.blobUrl, session.blobUrl))
            )
            .limit(1);
          if (asset) {
            existingAssetId = asset.id;
          } else {
            const isVideo = isVideoUpload(session.contentType, session.filename);
            const metadata = isVideo ? await probeVideoMetadata(session.blobUrl) : null;
            const [created] = await db
              .insert(mediaAssets)
              .values({
                projectId: episodeId,
                type: inferAssetTypeFromUpload(session.contentType, session.filename),
                name: customName || session.filename,
                blobUrl: session.blobUrl,
                contentType: session.contentType,
                sizeBytes: session.totalBytes,
                durationSeconds: metadata?.durationSeconds ?? null,
                width: metadata?.width ?? null,
                height: metadata?.height ?? null,
                fps: metadata?.fps ?? null,
                category: category || "general",
              })
              .returning({ id: mediaAssets.id });
            existingAssetId = created.id;
          }
        }

        res.json({
          url: session.blobUrl,
          size: session.totalBytes,
          target,
          mediaAssetId: existingAssetId,
          reused: true,
        });
        return;
      }

      if (session.status !== "uploading" && session.status !== "completing") {
        res.status(400).json({ error: `Session status is ${session.status}` });
        return;
      }

      // Verify all parts uploaded
      const completedCount = session.completedParts?.length || 0;
      if (completedCount < session.totalParts) {
        res.status(400).json({
          error: "Upload incomplete",
          uploaded: completedCount,
          required: session.totalParts,
        });
        return;
      }

      // Mark as completing
      await db
        .update(uploadSessions)
        .set({ status: "completing", updatedAt: new Date() })
        .where(eq(uploadSessions.id, sessionId));

      // Sort parts by partNumber (required by S3/R2)
      const sortedParts = [...(session.completedParts || [])].sort(
        (a, b) => a.partNumber - b.partNumber
      );

      // Complete multipart upload
      const result = await completeMultipartUpload(session.blobKey, session.uploadId, sortedParts);

      // Update session as completed
      await db
        .update(uploadSessions)
        .set({
          status: "completed",
          blobUrl: result.url,
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, sessionId));

      let mediaAssetId: string | undefined;
      if (target === "audio") {
        await db
          .update(projects)
          .set({
            audioBlobUrl: result.url,
            audioFileName: session.filename,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, episodeId));
      } else if (target === "media-asset") {
        const videoUpload = isVideoUpload(session.contentType, session.filename);
        if (videoUpload) {
          await db
            .update(projects)
            .set({
              mediaType: "video",
              updatedAt: new Date(),
            })
            .where(eq(projects.id, episodeId));
        }

        const [existingAsset] = await db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(and(eq(mediaAssets.projectId, episodeId), eq(mediaAssets.blobUrl, result.url)))
          .limit(1);

        if (existingAsset) {
          mediaAssetId = existingAsset.id;
        } else {
          const isVideo = isVideoUpload(session.contentType, session.filename);
          const metadata = isVideo ? await probeVideoMetadata(result.url) : null;
          const [asset] = await db
            .insert(mediaAssets)
            .values({
              projectId: episodeId,
              type: inferAssetTypeFromUpload(session.contentType, session.filename),
              name: customName || session.filename,
              blobUrl: result.url,
              contentType: session.contentType,
              sizeBytes: session.totalBytes,
              durationSeconds: metadata?.durationSeconds ?? null,
              width: metadata?.width ?? null,
              height: metadata?.height ?? null,
              fps: metadata?.fps ?? null,
              category: category || "general",
            })
            .returning({ id: mediaAssets.id });
          mediaAssetId = asset.id;
        }
      }

      res.json({
        url: result.url,
        size: session.totalBytes,
        target,
        mediaAssetId,
      });
    } catch (error) {
      console.error("Complete upload error:", error);
      res.status(500).json({ error: "Failed to complete upload" });
    }
  }
);

// GET /api/podcasts/:podcastId/episodes/:episodeId/uploads/:sessionId/status
router.get(
  "/:podcastId/episodes/:episodeId/uploads/:sessionId/status",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    const podcastId = req.params.podcastId as string;
    const episodeId = req.params.episodeId as string;
    const sessionId = req.params.sessionId as string;

    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!(await verifyAccess(req.user.userId, podcastId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [session] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.podcastId !== podcastId || session.episodeId !== episodeId) {
      res.status(403).json({ error: "Upload session does not belong to this episode" });
      return;
    }
    if (session.createdById !== req.user.userId) {
      res.status(403).json({ error: "Upload session does not belong to this user" });
      return;
    }

    res.json({
      status: session.status,
      uploadedBytes: session.uploadedBytes,
      totalBytes: session.totalBytes,
      completedParts: session.completedParts?.length || 0,
      totalParts: session.totalParts,
      progress: Math.round(((session.completedParts?.length || 0) / session.totalParts) * 100),
      chunkSize: session.chunkSize,
      expiresAt: session.expiresAt,
    });
  }
);

// GET /api/podcasts/:podcastId/episodes/:episodeId/uploads/resume
// Check for any resumable upload sessions for this episode
router.get(
  "/:podcastId/episodes/:episodeId/uploads/resume",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    const podcastId = req.params.podcastId as string;
    const episodeId = req.params.episodeId as string;
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const userId = req.user.userId;
    if (!(await verifyAccess(userId, podcastId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [session] = await db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.episodeId, episodeId),
          eq(uploadSessions.createdById, userId),
          eq(uploadSessions.status, "uploading")
        )
      );

    if (!session || new Date() > session.expiresAt) {
      res.json({ hasResumable: false });
      return;
    }

    res.json({
      hasResumable: true,
      sessionId: session.id,
      filename: session.filename,
      totalBytes: session.totalBytes,
      uploadedBytes: session.uploadedBytes,
      completedParts: session.completedParts?.length || 0,
      totalParts: session.totalParts,
      chunkSize: session.chunkSize,
      progress: Math.round(((session.completedParts?.length || 0) / session.totalParts) * 100),
      expiresAt: session.expiresAt,
    });
  }
);

export const uploadsRouter = router;
