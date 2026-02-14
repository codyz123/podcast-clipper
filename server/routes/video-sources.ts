import { Router, Request, Response } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { videoSources, projects } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { getParam, verifyPodcastAccess } from "../middleware/podcast-access.js";
import { uploadToR2, deleteFromR2ByUrl } from "../lib/r2-storage.js";
import {
  extractVideoMetadata,
  extractAudioFromVideo,
  normalizeAudio,
  generateProxyVideo,
  generateThumbnail,
  generateThumbnailStrip,
  bufferToTempFile,
  cleanupTempFiles,
  mixAudioSources,
} from "../lib/video-processing.js";
import { syncVideoSources } from "../lib/audio-sync.js";

const router = Router();

// All routes require JWT auth
router.use(jwtAuthMiddleware);

// ============ CRUD ============

// List video sources for an episode
router.get(
  "/:podcastId/episodes/:episodeId/video-sources",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);

      const sources = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId))
        .orderBy(asc(videoSources.displayOrder));

      res.json({ videoSources: sources });
    } catch (error) {
      console.error("Error listing video sources:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Check for duplicate files by content fingerprint
router.post(
  "/:podcastId/episodes/:episodeId/video-sources/check-duplicates",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const { fingerprints } = req.body as { fingerprints: string[] };

      if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
        res.json({ duplicates: [] });
        return;
      }

      const sources = await db
        .select({ contentFingerprint: videoSources.contentFingerprint })
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId));

      const existing = new Set(sources.map((s) => s.contentFingerprint).filter(Boolean));
      const duplicates = fingerprints.filter((fp) => existing.has(fp));

      res.json({ duplicates });
    } catch (error) {
      console.error("Error checking duplicates:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Create a video source record (after file is uploaded via chunked upload)
router.post(
  "/:podcastId/episodes/:episodeId/video-sources",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const {
        label,
        personId,
        sourceType,
        videoBlobUrl,
        fileName,
        contentType,
        sizeBytes,
        displayOrder,
        contentFingerprint,
      } = req.body;

      if (!videoBlobUrl || !fileName) {
        res.status(400).json({ error: "videoBlobUrl and fileName are required" });
        return;
      }

      // Count existing sources for default displayOrder
      const existing = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId));

      const [source] = await db
        .insert(videoSources)
        .values({
          projectId: episodeId,
          label: label || fileName,
          personId: personId || null,
          sourceType: sourceType || "speaker",
          videoBlobUrl,
          fileName,
          contentType: contentType || null,
          sizeBytes: sizeBytes || null,
          contentFingerprint: contentFingerprint || null,
          displayOrder: typeof displayOrder === "number" ? displayOrder : existing.length,
        })
        .returning();

      // Update project mediaType to 'video'
      await db
        .update(projects)
        .set({ mediaType: "video", updatedAt: new Date() })
        .where(eq(projects.id, episodeId));

      res.status(201).json({ videoSource: source });
    } catch (error) {
      console.error("Error creating video source:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update a video source
router.patch(
  "/:podcastId/episodes/:episodeId/video-sources/:sourceId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const sourceId = getParam(req.params.sourceId);
      const episodeId = getParam(req.params.episodeId);

      // Only allow updating specific fields
      const allowedFields = [
        "label",
        "personId",
        "sourceType",
        "cropOffsetX",
        "cropOffsetY",
        "displayOrder",
        "syncOffsetMs",
        "syncMethod",
      ] as const;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const [updated] = await db
        .update(videoSources)
        .set(updates)
        .where(and(eq(videoSources.id, sourceId), eq(videoSources.projectId, episodeId)))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Video source not found" });
        return;
      }

      res.json({ videoSource: updated });
    } catch (error) {
      console.error("Error updating video source:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete a video source
router.delete(
  "/:podcastId/episodes/:episodeId/video-sources/:sourceId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const sourceId = getParam(req.params.sourceId);
      const episodeId = getParam(req.params.episodeId);

      // Fetch the source to get blob URLs for cleanup
      const [source] = await db
        .select()
        .from(videoSources)
        .where(and(eq(videoSources.id, sourceId), eq(videoSources.projectId, episodeId)));

      if (!source) {
        res.status(404).json({ error: "Video source not found" });
        return;
      }

      // Delete from database
      await db.delete(videoSources).where(eq(videoSources.id, sourceId));

      // Clean up R2 artifacts in background
      const urlsToDelete = [
        source.videoBlobUrl,
        source.proxyBlobUrl,
        source.audioBlobUrl,
        source.thumbnailStripUrl,
      ].filter(Boolean) as string[];

      Promise.all(urlsToDelete.map((url) => deleteFromR2ByUrl(url).catch(() => {}))).catch(
        () => {}
      );

      // Check if any video sources remain; revert to audio if not
      const remaining = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId));

      if (remaining.length === 0) {
        await db
          .update(projects)
          .set({ mediaType: "audio", updatedAt: new Date() })
          .where(eq(projects.id, episodeId));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting video source:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Processing ============

// Trigger background processing for a video source (metadata + proxy + audio extraction)
router.post(
  "/:podcastId/episodes/:episodeId/video-sources/:sourceId/process",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    const sourceId = getParam(req.params.sourceId);
    const episodeId = getParam(req.params.episodeId);

    // Fetch the source
    const [source] = await db
      .select()
      .from(videoSources)
      .where(and(eq(videoSources.id, sourceId), eq(videoSources.projectId, episodeId)));

    if (!source) {
      res.status(404).json({ error: "Video source not found" });
      return;
    }

    // Respond immediately, process in background
    res.json({ status: "processing", sourceId });

    // Background processing
    processVideoSource(source.id, source.videoBlobUrl, source.fileName).catch((error) => {
      console.error(`Background processing failed for video source ${source.id}:`, error);
    });
  }
);

// Get processing status for a video source
router.get(
  "/:podcastId/episodes/:episodeId/video-sources/:sourceId/status",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const sourceId = getParam(req.params.sourceId);
      const episodeId = getParam(req.params.episodeId);

      const [source] = await db
        .select()
        .from(videoSources)
        .where(and(eq(videoSources.id, sourceId), eq(videoSources.projectId, episodeId)));

      if (!source) {
        res.status(404).json({ error: "Video source not found" });
        return;
      }

      res.json({
        sourceId: source.id,
        hasProxy: !!source.proxyBlobUrl,
        hasAudio: !!source.audioBlobUrl,
        hasMetadata: !!source.durationSeconds,
      });
    } catch (error) {
      console.error("Error getting video source status:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Project-level video config ============

// Update project video settings (defaultVideoSourceId, primaryAudioSourceId)
router.patch(
  "/:podcastId/episodes/:episodeId/video-config",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const { defaultVideoSourceId, primaryAudioSourceId } = req.body;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (defaultVideoSourceId !== undefined) updates.defaultVideoSourceId = defaultVideoSourceId;
      if (primaryAudioSourceId !== undefined) updates.primaryAudioSourceId = primaryAudioSourceId;

      const [updated] = await db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, episodeId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating video config:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Sync ============

// Trigger audio-based sync of all video sources for an episode
router.post(
  "/:podcastId/episodes/:episodeId/sync-videos",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);

      // Mark project as syncing
      await db
        .update(projects)
        .set({ videoSyncStatus: "syncing", updatedAt: new Date() })
        .where(eq(projects.id, episodeId));

      // Fetch all sources
      const sources = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId))
        .orderBy(asc(videoSources.displayOrder));

      if (sources.length === 0) {
        await db
          .update(projects)
          .set({ videoSyncStatus: "failed", updatedAt: new Date() })
          .where(eq(projects.id, episodeId));
        res.status(400).json({ error: "No video sources to sync" });
        return;
      }

      // Run sync algorithm
      const results = await syncVideoSources(
        sources.map((s) => ({
          id: s.id,
          audioBlobUrl: s.audioBlobUrl,
          durationSeconds: s.durationSeconds,
          sourceType: s.sourceType,
          displayOrder: s.displayOrder,
        }))
      );

      // Apply results
      for (const result of results) {
        await db
          .update(videoSources)
          .set({
            syncOffsetMs: result.offsetMs,
            syncMethod: result.method,
            syncConfidence: result.confidence,
            updatedAt: new Date(),
          })
          .where(eq(videoSources.id, result.sourceId));
      }

      // Mark project as synced
      await db
        .update(projects)
        .set({ videoSyncStatus: "synced", updatedAt: new Date() })
        .where(eq(projects.id, episodeId));

      res.json({ results });
    } catch (error) {
      console.error("Error syncing videos:", error);

      // Mark as failed
      const episodeId = getParam(req.params.episodeId);
      await db
        .update(projects)
        .set({ videoSyncStatus: "failed", updatedAt: new Date() })
        .where(eq(projects.id, episodeId))
        .catch(() => {});

      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Audio Mixing ============

// Generate mixed audio from all speaker sources
router.post(
  "/:podcastId/episodes/:episodeId/mix-audio",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);

      // Fetch speaker sources with audio
      const sources = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId))
        .orderBy(asc(videoSources.displayOrder));

      const speakerSources = sources.filter((s) => s.sourceType === "speaker" && s.audioBlobUrl);

      if (speakerSources.length === 0) {
        res.status(400).json({ error: "No speaker sources with audio to mix" });
        return;
      }

      // Download all speaker audio to temp files
      const tempPaths: string[] = [];
      try {
        for (const source of speakerSources) {
          const buf = Buffer.from(await (await fetch(source.audioBlobUrl!)).arrayBuffer());
          const path = await bufferToTempFile(buf, "wav");
          tempPaths.push(path);
        }

        // Mix
        const mixedBuffer = await mixAudioSources(tempPaths);

        // Upload to R2
        const mixKey = `audio-mixes/${episodeId}/${Date.now()}-mixed.wav`;
        const { url: mixedAudioBlobUrl } = await uploadToR2(mixKey, mixedBuffer, "audio/wav");

        // Store on project
        await db
          .update(projects)
          .set({ mixedAudioBlobUrl, updatedAt: new Date() })
          .where(eq(projects.id, episodeId));

        res.json({ mixedAudioBlobUrl });
      } finally {
        await cleanupTempFiles(...tempPaths);
      }
    } catch (error) {
      console.error("Error mixing audio:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Background Processing ============

async function processVideoSource(
  sourceId: string,
  videoBlobUrl: string,
  fileName: string
): Promise<void> {
  console.log(`Processing video source ${sourceId}: ${fileName}`);

  // Download the video to a temp file
  const response = await fetch(videoBlobUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }
  const videoBuffer = Buffer.from(await response.arrayBuffer());
  const tempVideoPath = await bufferToTempFile(videoBuffer, "mp4");

  try {
    // Step 1: Extract metadata
    console.log(`  [${sourceId}] Extracting metadata...`);
    const metadata = await extractVideoMetadata(tempVideoPath);

    await db
      .update(videoSources)
      .set({
        durationSeconds: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        updatedAt: new Date(),
      })
      .where(eq(videoSources.id, sourceId));

    // Step 2: Extract and normalize audio (if video has audio)
    if (metadata.hasAudio) {
      console.log(`  [${sourceId}] Extracting audio...`);
      const audioBuffer = await extractAudioFromVideo(tempVideoPath);
      const audioTempPath = await bufferToTempFile(audioBuffer, "wav");

      try {
        console.log(`  [${sourceId}] Normalizing audio...`);
        const normalizedBuffer = await normalizeAudio(audioTempPath);
        const audioKey = `video-audio/${sourceId}/${Date.now()}-audio.wav`;
        const { url: audioBlobUrl } = await uploadToR2(audioKey, normalizedBuffer, "audio/wav");

        await db
          .update(videoSources)
          .set({ audioBlobUrl, updatedAt: new Date() })
          .where(eq(videoSources.id, sourceId));
      } finally {
        await cleanupTempFiles(audioTempPath);
      }
    }

    // Step 3: Generate proxy video
    console.log(`  [${sourceId}] Generating proxy video...`);
    const proxyBuffer = await generateProxyVideo(tempVideoPath);
    const proxyKey = `video-proxies/${sourceId}/${Date.now()}-proxy.mp4`;
    const { url: proxyBlobUrl } = await uploadToR2(proxyKey, proxyBuffer, "video/mp4");

    await db
      .update(videoSources)
      .set({ proxyBlobUrl, updatedAt: new Date() })
      .where(eq(videoSources.id, sourceId));

    // Step 4: Generate thumbnail
    console.log(`  [${sourceId}] Generating thumbnail...`);
    const thumbBuffer = await generateThumbnail(tempVideoPath, Math.min(1, metadata.duration / 2));
    const thumbKey = `video-thumbnails/${sourceId}/${Date.now()}-thumb.jpg`;
    await uploadToR2(thumbKey, thumbBuffer, "image/jpeg");

    // Step 5: Generate thumbnail strip for timeline scrubbing
    if (metadata.duration > 5) {
      console.log(`  [${sourceId}] Generating thumbnail strip...`);
      try {
        const stripBuffer = await generateThumbnailStrip(tempVideoPath, metadata.duration, 5);
        const stripKey = `video-strips/${sourceId}/${Date.now()}-strip.jpg`;
        const { url: thumbnailStripUrl } = await uploadToR2(stripKey, stripBuffer, "image/jpeg");

        await db
          .update(videoSources)
          .set({ thumbnailStripUrl, updatedAt: new Date() })
          .where(eq(videoSources.id, sourceId));
      } catch (stripError) {
        // Non-fatal — timeline scrubbing just won't have thumbnails
        console.warn(`  [${sourceId}] Thumbnail strip generation failed:`, stripError);
      }
    }

    console.log(`  [${sourceId}] Processing complete`);
  } finally {
    await cleanupTempFiles(tempVideoPath);
  }
}

export const videoSourcesRouter = router;
