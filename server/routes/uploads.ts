import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { uploadSessions, projects, podcastMembers } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { createMultipartUpload, uploadPart, completeMultipartUpload } from "../lib/r2-storage.js";

const router = Router();

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

// POST /api/podcasts/:podcastId/episodes/:episodeId/uploads/init
router.post(
  "/:podcastId/episodes/:episodeId/uploads/init",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const podcastId = req.params.podcastId as string;
      const episodeId = req.params.episodeId as string;
      const { filename, contentType, totalBytes } = req.body;
      const userId = req.user!.userId;

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
      const sessionId = req.params.sessionId as string;
      const partNumber = parseInt(req.params.partNumber as string, 10);
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
      if (session.status !== "uploading") {
        res.status(400).json({ error: `Session status is ${session.status}` });
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
    const sessionId = req.params.sessionId as string;
    const episodeId = req.params.episodeId as string;

    try {
      const [session] = await db
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId));

      if (!session) {
        res.status(404).json({ error: "Session not found" });
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

      // Update episode with new audio
      await db
        .update(projects)
        .set({
          audioBlobUrl: result.url,
          audioFileName: session.filename,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, episodeId));

      res.json({
        url: result.url,
        size: session.totalBytes,
      });
    } catch (error) {
      console.error("Complete upload error:", error);

      // Mark as failed
      await db
        .update(uploadSessions)
        .set({
          status: "failed",
          errorMessage: String(error),
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, sessionId));

      res.status(500).json({ error: "Failed to complete upload" });
    }
  }
);

// GET /api/podcasts/:podcastId/episodes/:episodeId/uploads/:sessionId/status
router.get(
  "/:podcastId/episodes/:episodeId/uploads/:sessionId/status",
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId as string;

    const [session] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
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
    const episodeId = req.params.episodeId as string;
    const userId = req.user!.userId;

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
