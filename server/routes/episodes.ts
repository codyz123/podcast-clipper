import { Router, Request, Response } from "express";
import multer from "multer";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, transcripts, clips } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { getParam, verifyPodcastAccess } from "../middleware/podcast-access.js";
import { uploadMediaFromPath, deleteMedia } from "../lib/media-storage.js";
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import { tmpdir } from "os";

const router = Router();

// Configure multer for large file uploads (5GB limit for podcast audio)
// Uses disk storage to avoid memory issues with large files
const upload = multer({
  storage: multer.diskStorage({
    destination: tmpdir(),
    filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
});

// All routes require JWT auth
router.use(jwtAuthMiddleware);

// ============ Episodes (Projects) ============

// List episodes for a podcast
router.get("/:podcastId/episodes", verifyPodcastAccess, async (req: Request, res: Response) => {
  try {
    const podcastId = getParam(req.params.podcastId);

    const episodes = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        audioBlobUrl: projects.audioBlobUrl,
        audioFileName: projects.audioFileName,
        audioDuration: projects.audioDuration,
        episodeNumber: projects.episodeNumber,
        seasonNumber: projects.seasonNumber,
        publishDate: projects.publishDate,
        showNotes: projects.showNotes,
        explicit: projects.explicit,
        guests: projects.guests,
        stageStatus: projects.stageStatus,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.podcastId, podcastId))
      .orderBy(desc(projects.updatedAt));

    res.json({ episodes });
  } catch (error) {
    console.error("Error listing episodes:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get a single episode with its clips
router.get(
  "/:podcastId/episodes/:episodeId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);

      // Run all three queries in parallel to minimize Neon serverless round-trips
      const [episodeResult, episodeTranscripts, episodeClips] = await Promise.all([
        db
          .select()
          .from(projects)
          .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId))),
        db.select().from(transcripts).where(eq(transcripts.projectId, episodeId)),
        db.select().from(clips).where(eq(clips.projectId, episodeId)),
      ]);

      const episode = episodeResult[0];

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      res.json({
        episode,
        transcripts: episodeTranscripts,
        clips: episodeClips,
      });
    } catch (error) {
      console.error("Error getting episode:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Create a new episode
router.post("/:podcastId/episodes", verifyPodcastAccess, async (req: Request, res: Response) => {
  try {
    const podcastId = getParam(req.params.podcastId);
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const userId = req.user.userId;
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const [episode] = await db
      .insert(projects)
      .values({
        podcastId,
        name,
        description,
        createdById: userId,
      })
      .returning();

    res.json({ episode });
  } catch (error) {
    console.error("Error creating episode:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update an episode
router.put(
  "/:podcastId/episodes/:episodeId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      const updates = req.body;

      console.warn("[PUT episode] podcastId:", podcastId, "episodeId:", episodeId);
      console.warn("[PUT episode] updates received:", JSON.stringify(updates));

      // Filter to allowed fields
      const allowedFields = [
        "name",
        "description",
        "episodeNumber",
        "seasonNumber",
        "publishDate",
        "showNotes",
        "explicit",
        "guests",
        "audioDuration",
      ];
      const filteredUpdates: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates && updates[key] !== undefined) {
          const value = updates[key];
          // Skip null values
          if (value === null) continue;
          // Handle date fields - convert empty strings to null, strings to Date objects
          if (key === "publishDate") {
            if (value === "" || value === null) {
              filteredUpdates[key] = null;
            } else if (typeof value === "string") {
              filteredUpdates[key] = new Date(value);
            } else {
              filteredUpdates[key] = value;
            }
          } else {
            filteredUpdates[key] = value;
          }
        }
      }
      filteredUpdates.updatedAt = new Date();

      console.warn("[PUT episode] filteredUpdates:", JSON.stringify(filteredUpdates));

      const [episode] = await db
        .update(projects)
        .set(filteredUpdates)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)))
        .returning();

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      console.warn("[PUT episode] Success, updated episode:", episode.id);
      res.json({ episode });
    } catch (error) {
      console.error("[PUT episode] Error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update stage status for an episode
router.put(
  "/:podcastId/episodes/:episodeId/stage-status",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      const { stage, status } = req.body;

      // Validate inputs (use "complete" to match frontend StageStatus type)
      const validStages = [
        "planning",
        "production",
        "post-production",
        "distribution",
        "marketing",
      ];
      const validStatuses = ["not-started", "in-progress", "complete"];

      if (!validStages.includes(stage) || !validStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid stage or status" });
        return;
      }

      // Verify episode exists and belongs to podcast
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Merge new status into existing stageStatus object
      const currentStatus = (episode.stageStatus as Record<string, unknown>) || {};
      const updatedStatus = {
        ...currentStatus,
        [stage]: { status, updatedAt: new Date().toISOString() },
      };

      const [updated] = await db
        .update(projects)
        .set({ stageStatus: updatedStatus, updatedAt: new Date() })
        .where(eq(projects.id, episodeId))
        .returning();

      res.json({ episode: updated, stageStatus: updatedStatus });
    } catch (error) {
      console.error("Error updating stage status:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update sub-step status for an episode
router.put(
  "/:podcastId/episodes/:episodeId/substep-status",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      const { subStepId, status } = req.body;

      // Validate inputs
      const validSubSteps = [
        "guest",
        "topic",
        "logistics",
        "recording",
        "mixing",
        "editing",
        "transcription",
        "rss",
        "youtube-dist",
        "x",
        "instagram-reel",
        "instagram-post",
        "youtube-short",
        "tiktok",
      ];
      const validStatuses = ["not-started", "in-progress", "complete"];

      if (!validSubSteps.includes(subStepId) || !validStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid sub-step ID or status" });
        return;
      }

      // Verify episode exists and belongs to podcast
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Merge new sub-step status into existing stageStatus.subSteps object
      const currentStatus = (episode.stageStatus as Record<string, unknown>) || {};
      const currentSubSteps = (currentStatus.subSteps as Record<string, unknown>) || {};
      const updatedStatus = {
        ...currentStatus,
        subSteps: {
          ...currentSubSteps,
          [subStepId]: { status, updatedAt: new Date().toISOString() },
        },
      };

      const [updated] = await db
        .update(projects)
        .set({ stageStatus: updatedStatus, updatedAt: new Date() })
        .where(eq(projects.id, episodeId))
        .returning();

      res.json({ episode: updated, stageStatus: updatedStatus });
    } catch (error) {
      console.error("Error updating sub-step status:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete an episode
router.delete(
  "/:podcastId/episodes/:episodeId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);

      // Get episode to delete associated blob
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Delete associated blob if exists
      if (episode.audioBlobUrl) {
        try {
          await deleteMedia(episode.audioBlobUrl);
        } catch (e) {
          console.error("Failed to delete audio blob:", e);
        }
      }

      // Delete episode (cascades to transcripts, clips, etc.)
      await db
        .delete(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting episode:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Upload audio for an episode (supports files up to 5GB via streaming)
router.post(
  "/:podcastId/episodes/:episodeId/audio",
  verifyPodcastAccess,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      // Duration can be sent as form field (calculated client-side)
      const audioDuration = req.body.audioDuration ? parseFloat(req.body.audioDuration) : undefined;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Verify episode exists and belongs to podcast
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Delete old audio if exists
      if (episode.audioBlobUrl) {
        try {
          await deleteMedia(episode.audioBlobUrl);
        } catch (e) {
          console.error("Failed to delete old audio blob:", e);
        }
      }

      // Upload to blob storage (streaming from disk for large files)
      const { url, size } = await uploadMediaFromPath(
        file.path,
        file.originalname,
        file.mimetype,
        `podcasts/${podcastId}/episodes/${episodeId}`
      );

      // Update episode with audio URL and duration
      const [updated] = await db
        .update(projects)
        .set({
          audioBlobUrl: url,
          audioFileName: file.originalname,
          ...(audioDuration !== undefined && { audioDuration }),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, episodeId))
        .returning();

      res.json({ episode: updated, size });
    } catch (error) {
      console.error("Error uploading audio:", error);
      res.status(500).json({ error: (error as Error).message });
    } finally {
      // Clean up temp file
      if (file?.path) {
        unlink(file.path).catch((e) => console.error("Failed to delete temp file:", e));
      }
    }
  }
);

// ============ Transcripts ============

// Save/update transcript for an episode
router.post(
  "/:podcastId/episodes/:episodeId/transcripts",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const userId = req.user.userId;
      const { text, words, segments, language, name, audioFingerprint, service } = req.body;

      // Verify episode exists
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      const [transcript] = await db
        .insert(transcripts)
        .values({
          projectId: episodeId,
          text,
          words,
          segments,
          language,
          name,
          audioFingerprint,
          service,
          createdById: userId,
        })
        .returning();

      res.json({ transcript });
    } catch (error) {
      console.error("Error saving transcript:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update transcript segments (speaker labels)
router.put(
  "/:podcastId/episodes/:episodeId/transcripts/:transcriptId/segments",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const transcriptId = getParam(req.params.transcriptId);
      const { segments } = req.body;

      if (!Array.isArray(segments)) {
        res.status(400).json({ error: "segments must be an array" });
        return;
      }

      for (const seg of segments) {
        if (
          typeof seg.speakerLabel !== "string" ||
          !Number.isFinite(seg.startWordIndex) ||
          !Number.isFinite(seg.endWordIndex)
        ) {
          res.status(400).json({ error: "Invalid segment structure" });
          return;
        }
      }

      const [updated] = await db
        .update(transcripts)
        .set({ segments })
        .where(eq(transcripts.id, transcriptId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Transcript not found" });
        return;
      }

      res.json({ transcript: updated });
    } catch (error) {
      console.error("Error updating transcript segments:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update transcript content (words, text, and optionally segments)
router.put(
  "/:podcastId/episodes/:episodeId/transcripts/:transcriptId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const transcriptId = getParam(req.params.transcriptId);
      const { text, words, segments } = req.body;

      if (typeof text !== "string") {
        res.status(400).json({ error: "text must be a string" });
        return;
      }
      if (!Array.isArray(words)) {
        res.status(400).json({ error: "words must be an array" });
        return;
      }

      const updateData: Record<string, unknown> = { text, words };
      if (segments !== undefined) {
        updateData.segments = segments;
      }

      const [updated] = await db
        .update(transcripts)
        .set(updateData)
        .where(eq(transcripts.id, transcriptId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Transcript not found" });
        return;
      }

      res.json({ transcript: updated });
    } catch (error) {
      console.error("Error updating transcript:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Clips ============

// Save/update clip for an episode
router.post(
  "/:podcastId/episodes/:episodeId/clips",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const userId = req.user.userId;
      const clipData = req.body;

      // Verify episode exists
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      const [clip] = await db
        .insert(clips)
        .values({
          projectId: episodeId,
          name: clipData.name,
          startTime: clipData.startTime,
          endTime: clipData.endTime,
          transcript: clipData.transcript,
          words: clipData.words || [],
          clippabilityScore: clipData.clippabilityScore,
          isManual: clipData.isManual || false,
          templateId: clipData.templateId,
          background: clipData.background,
          subtitle: clipData.subtitle,
          tracks: clipData.tracks,
          captionStyle: clipData.captionStyle,
          segments: clipData.segments,
          format: clipData.format,
          createdById: userId,
        })
        .returning();

      res.json({ clip });
    } catch (error) {
      console.error("Error saving clip:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Bulk sync clips
router.put(
  "/:podcastId/episodes/:episodeId/clips",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const userId = req.user.userId;
      const { clips: clipList } = req.body;

      // Verify episode exists
      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Pre-fetch all existing clip IDs for this episode in one query
      // instead of checking existence per-clip (N+1 → 1 query)
      const existingClips = await db
        .select({ id: clips.id })
        .from(clips)
        .where(eq(clips.projectId, episodeId));
      const existingIds = new Set(existingClips.map((c) => c.id));

      // Partition into inserts vs updates
      const toInsert = clipList.filter(
        (c: Record<string, unknown>) => !c.id || !existingIds.has(c.id as string)
      );
      const toUpdate = clipList.filter(
        (c: Record<string, unknown>) => c.id && existingIds.has(c.id as string)
      );

      const savedClips: unknown[] = [];

      // Batch insert all new clips in a single query
      if (toInsert.length > 0) {
        const inserted = await db
          .insert(clips)
          .values(
            toInsert.map((clipData: Record<string, unknown>) => ({
              projectId: episodeId,
              name: clipData.name as string,
              startTime: clipData.startTime as number,
              endTime: clipData.endTime as number,
              transcript: clipData.transcript as string | undefined,
              words: (clipData.words as unknown[]) || [],
              clippabilityScore: clipData.clippabilityScore,
              isManual: (clipData.isManual as boolean) || false,
              templateId: clipData.templateId as string | undefined,
              background: clipData.background,
              subtitle: clipData.subtitle,
              tracks: clipData.tracks,
              captionStyle: clipData.captionStyle,
              segments: clipData.segments,
              format: clipData.format as string | undefined,
              createdById: userId,
            }))
          )
          .returning();
        savedClips.push(...inserted);
      }

      // Update existing clips (still per-clip due to Drizzle ORM limitations,
      // but we eliminated the per-clip SELECT existence check)
      for (const clipData of toUpdate) {
        const [updated] = await db
          .update(clips)
          .set({
            name: clipData.name,
            startTime: clipData.startTime,
            endTime: clipData.endTime,
            transcript: clipData.transcript,
            words: clipData.words,
            clippabilityScore: clipData.clippabilityScore,
            tracks: clipData.tracks,
            captionStyle: clipData.captionStyle,
            segments: clipData.segments,
            format: clipData.format,
            templateId: clipData.templateId,
            background: clipData.background,
            subtitle: clipData.subtitle,
            updatedAt: new Date(),
          })
          .where(eq(clips.id, clipData.id))
          .returning();
        savedClips.push(updated);
      }

      res.json({ clips: savedClips, count: savedClips.length });
    } catch (error) {
      console.error("Error syncing clips:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete a clip
router.delete(
  "/:podcastId/episodes/:episodeId/clips/:clipId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const clipId = getParam(req.params.clipId);

      await db.delete(clips).where(eq(clips.id, clipId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting clip:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export const episodesRouter = router;
