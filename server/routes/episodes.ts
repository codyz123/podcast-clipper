import { Router, Request, Response } from "express";
import multer from "multer";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, podcastMembers, transcripts, clips } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { uploadMedia, deleteMedia } from "../lib/media-storage.js";

const router = Router();

// Helper to extract string param
function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

// Configure multer for file uploads (50MB limit for audio/video)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Middleware to verify podcast membership
async function verifyPodcastAccess(req: Request, res: Response, next: () => void) {
  const podcastId = getParam(req.params.podcastId);
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [membership] = await db
    .select()
    .from(podcastMembers)
    .where(and(eq(podcastMembers.podcastId, podcastId), eq(podcastMembers.userId, userId)));

  if (!membership) {
    res.status(403).json({ error: "Access denied to this podcast" });
    return;
  }

  // Attach membership to request for role checks if needed
  req.podcastMembership = membership;
  next();
}

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

      const [episode] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)));

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Get transcripts
      const episodeTranscripts = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.projectId, episodeId));

      // Get clips
      const episodeClips = await db.select().from(clips).where(eq(clips.projectId, episodeId));

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
    const userId = req.user!.userId;
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
      ];
      const filteredUpdates: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates) {
          filteredUpdates[key] = updates[key];
        }
      }
      filteredUpdates.updatedAt = new Date();

      const [episode] = await db
        .update(projects)
        .set(filteredUpdates)
        .where(and(eq(projects.id, episodeId), eq(projects.podcastId, podcastId)))
        .returning();

      if (!episode) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      res.json({ episode });
    } catch (error) {
      console.error("Error updating episode:", error);
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

// Upload audio for an episode
router.post(
  "/:podcastId/episodes/:episodeId/audio",
  verifyPodcastAccess,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      const file = req.file;

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

      // Upload to blob storage
      const { url, size } = await uploadMedia(
        file.buffer,
        file.originalname,
        file.mimetype,
        `podcasts/${podcastId}/episodes/${episodeId}`
      );

      // Update episode with audio URL
      const [updated] = await db
        .update(projects)
        .set({
          audioBlobUrl: url,
          audioFileName: file.originalname,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, episodeId))
        .returning();

      res.json({ episode: updated, size });
    } catch (error) {
      console.error("Error uploading audio:", error);
      res.status(500).json({ error: (error as Error).message });
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
      const userId = req.user!.userId;
      const { text, words, language, name, audioFingerprint } = req.body;

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
          language,
          name,
          audioFingerprint,
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

// ============ Clips ============

// Save/update clip for an episode
router.post(
  "/:podcastId/episodes/:episodeId/clips",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      const userId = req.user!.userId;
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
          tracks: clipData.tracks,
          captionStyle: clipData.captionStyle,
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
      const userId = req.user!.userId;
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

      const savedClips = [];
      for (const clipData of clipList) {
        // Check if clip exists
        const existing = clipData.id
          ? await db.select().from(clips).where(eq(clips.id, clipData.id))
          : [];

        if (existing.length > 0) {
          // Update
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
              format: clipData.format,
              updatedAt: new Date(),
            })
            .where(eq(clips.id, clipData.id))
            .returning();
          savedClips.push(updated);
        } else {
          // Insert
          const [created] = await db
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
              tracks: clipData.tracks,
              captionStyle: clipData.captionStyle,
              format: clipData.format,
              createdById: userId,
            })
            .returning();
          savedClips.push(created);
        }
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
