import { Router, Request, Response } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { mediaAssets, videoSources, projects, podcastBrandingAssets } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { getParam, verifyPodcastAccess } from "../middleware/podcast-access.js";
import { deleteFromR2ByUrl } from "../lib/r2-storage.js";

const router = Router();

// All routes require JWT auth
router.use(jwtAuthMiddleware);

// ============ Aggregated Media Query ============

// Get all media for an episode (aggregated from multiple sources)
router.get(
  "/:podcastId/episodes/:episodeId/media-assets",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const episodeId = getParam(req.params.episodeId);
      const categoryFilter = req.query.category as string | undefined;

      // 1. Video sources
      const sources = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId))
        .orderBy(asc(videoSources.displayOrder));

      // 2. Media assets
      const assets = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.projectId, episodeId))
        .orderBy(asc(mediaAssets.displayOrder));

      // 3. Episode audio from project
      const [project] = await db.select().from(projects).where(eq(projects.id, episodeId));

      // 4. Podcast branding assets
      const branding = await db
        .select()
        .from(podcastBrandingAssets)
        .where(eq(podcastBrandingAssets.podcastId, podcastId))
        .orderBy(asc(podcastBrandingAssets.displayOrder));

      // Map to unified MediaItem format
      const items: Array<Record<string, unknown>> = [];

      // Video sources → MediaItem
      for (const s of sources) {
        const category =
          s.sourceType === "speaker" ? "camera" : s.sourceType === "broll" ? "broll" : "camera";

        items.push({
          id: `vs-${s.id}`,
          source: "video-source",
          sourceId: s.id,
          name: s.label || s.fileName,
          category,
          blobUrl: s.videoBlobUrl,
          proxyBlobUrl: s.proxyBlobUrl,
          thumbnailUrl: s.thumbnailStripUrl,
          contentType: s.contentType,
          sizeBytes: s.sizeBytes,
          durationSeconds: s.durationSeconds,
          width: s.width,
          height: s.height,
          fps: s.fps,
          syncOffsetMs: s.syncOffsetMs,
          syncMethod: s.syncMethod,
          syncConfidence: s.syncConfidence,
          processingStatus: s.proxyBlobUrl ? "complete" : "processing",
          displayOrder: s.displayOrder,
          createdAt: s.createdAt?.toISOString(),
        });
      }

      // Media assets → MediaItem
      for (const a of assets) {
        items.push({
          id: `ma-${a.id}`,
          source: "media-asset",
          sourceId: a.id,
          name: a.name,
          category: a.category || "general",
          blobUrl: a.blobUrl,
          thumbnailUrl: a.thumbnailUrl,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          durationSeconds: a.durationSeconds,
          width: a.width,
          height: a.height,
          fps: a.fps,
          displayOrder: a.displayOrder,
          createdAt: a.createdAt?.toISOString(),
        });
      }

      // Episode audio → MediaItem
      if (project?.audioBlobUrl) {
        items.push({
          id: `ea-${episodeId}`,
          source: "episode-audio",
          sourceId: episodeId,
          name: project.audioFileName || "Episode Audio",
          category: "episode-audio",
          blobUrl: project.mixedAudioBlobUrl || project.audioBlobUrl,
          contentType: "audio/wav",
          durationSeconds: project.audioDuration,
          displayOrder: -1, // Always at top
          createdAt: project.createdAt?.toISOString(),
        });
      }

      // Branding assets → MediaItem
      for (const b of branding) {
        items.push({
          id: `ba-${b.id}`,
          source: "branding",
          sourceId: b.id,
          name: b.name,
          category: "graphic",
          blobUrl: b.blobUrl,
          contentType: b.contentType,
          sizeBytes: b.sizeBytes,
          width: b.width,
          height: b.height,
          displayOrder: b.displayOrder,
          createdAt: b.createdAt?.toISOString(),
        });
      }

      // Apply category filter if requested
      const filtered = categoryFilter
        ? items.filter((item) => item.category === categoryFilter)
        : items;

      res.json({ mediaItems: filtered });
    } catch (error) {
      console.error("Error fetching media assets:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ============ Media Asset CRUD ============

// Create a media asset record (after file upload completes)
router.post(
  "/:podcastId/episodes/:episodeId/media-assets",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const {
        blobUrl,
        name,
        contentType,
        sizeBytes,
        category,
        durationSeconds,
        width,
        height,
        fps,
        thumbnailUrl,
      } = req.body;

      if (!blobUrl || !name) {
        res.status(400).json({ error: "blobUrl and name are required" });
        return;
      }

      // Count existing for default displayOrder
      const existing = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.projectId, episodeId));

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          projectId: episodeId,
          type: contentType?.split("/")[0] || "unknown",
          name,
          blobUrl,
          contentType: contentType || null,
          sizeBytes: sizeBytes || null,
          category: category || "general",
          durationSeconds: durationSeconds || null,
          width: width || null,
          height: height || null,
          fps: fps || null,
          thumbnailUrl: thumbnailUrl || null,
          displayOrder: existing.length,
        })
        .returning();

      res.status(201).json({ mediaAsset: asset });
    } catch (error) {
      console.error("Error creating media asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update a media asset
router.patch(
  "/:podcastId/episodes/:episodeId/media-assets/:assetId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = getParam(req.params.assetId);
      const episodeId = getParam(req.params.episodeId);

      const allowedFields = ["name", "category", "displayOrder"] as const;
      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      const [updated] = await db
        .update(mediaAssets)
        .set(updates)
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.projectId, episodeId)))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Media asset not found" });
        return;
      }

      res.json({ mediaAsset: updated });
    } catch (error) {
      console.error("Error updating media asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete a media asset
router.delete(
  "/:podcastId/episodes/:episodeId/media-assets/:assetId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = getParam(req.params.assetId);
      const episodeId = getParam(req.params.episodeId);

      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.projectId, episodeId)));

      if (!asset) {
        res.status(404).json({ error: "Media asset not found" });
        return;
      }

      // Delete from database
      await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));

      // Clean up R2 in background
      const urlsToDelete = [asset.blobUrl, asset.thumbnailUrl].filter(Boolean) as string[];
      Promise.all(urlsToDelete.map((url) => deleteFromR2ByUrl(url).catch(() => {}))).catch(
        () => {}
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting media asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export const mediaAssetsRouter = router;
