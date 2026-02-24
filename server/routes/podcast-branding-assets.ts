import { Router, Request, Response } from "express";
import multer from "multer";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { podcastBrandingAssets } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { getParam, verifyPodcastAccess } from "../middleware/podcast-access.js";
import { uploadMedia, deleteMedia } from "../lib/media-storage.js";

const router = Router();

const VALID_CATEGORIES = ["logo", "icon", "watermark", "banner", "graphic"];

// Memory storage for asset uploads (10MB limit)
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// All routes require JWT auth
router.use(jwtAuthMiddleware);

// List all branding assets for a podcast
router.get(
  "/:podcastId/branding-assets",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);

      const assets = await db
        .select()
        .from(podcastBrandingAssets)
        .where(eq(podcastBrandingAssets.podcastId, podcastId))
        .orderBy(asc(podcastBrandingAssets.displayOrder), asc(podcastBrandingAssets.createdAt));

      res.json({ assets });
    } catch (error) {
      console.error("Error listing branding assets:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Upload a new branding asset
router.post(
  "/:podcastId/branding-assets",
  verifyPodcastAccess,
  assetUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const file = req.file;
      const { name, category } = req.body;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      if (category && !VALID_CATEGORIES.includes(category)) {
        res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
        return;
      }

      const { url } = await uploadMedia(
        file.buffer,
        file.originalname,
        file.mimetype,
        `podcasts/${podcastId}/branding`
      );

      const [asset] = await db
        .insert(podcastBrandingAssets)
        .values({
          podcastId,
          name: name.trim(),
          category: category || "logo",
          blobUrl: url,
          contentType: file.mimetype,
          sizeBytes: file.size,
        })
        .returning();

      res.json({ asset });
    } catch (error) {
      console.error("Error uploading branding asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Update a branding asset
router.put(
  "/:podcastId/branding-assets/:assetId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const assetId = getParam(req.params.assetId);
      const updates = req.body;

      // Filter to allowed fields
      const allowedFields = ["name", "category", "displayOrder"];
      const filteredUpdates: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates) {
          filteredUpdates[key] = updates[key];
        }
      }

      // Validate category if provided
      if (
        filteredUpdates.category &&
        !VALID_CATEGORIES.includes(filteredUpdates.category as string)
      ) {
        res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
        return;
      }

      // Validate name if provided
      if ("name" in filteredUpdates) {
        const name = filteredUpdates.name as string;
        if (!name || typeof name !== "string" || name.trim().length === 0) {
          res.status(400).json({ error: "Name cannot be empty" });
          return;
        }
        filteredUpdates.name = name.trim();
      }

      filteredUpdates.updatedAt = new Date();

      const [asset] = await db
        .update(podcastBrandingAssets)
        .set(filteredUpdates)
        .where(
          and(eq(podcastBrandingAssets.id, assetId), eq(podcastBrandingAssets.podcastId, podcastId))
        )
        .returning();

      if (!asset) {
        res.status(404).json({ error: "Branding asset not found" });
        return;
      }

      res.json({ asset });
    } catch (error) {
      console.error("Error updating branding asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete a branding asset
router.delete(
  "/:podcastId/branding-assets/:assetId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const assetId = getParam(req.params.assetId);

      // Get asset to find blobUrl for storage cleanup
      const [asset] = await db
        .select()
        .from(podcastBrandingAssets)
        .where(
          and(eq(podcastBrandingAssets.id, assetId), eq(podcastBrandingAssets.podcastId, podcastId))
        );

      if (!asset) {
        res.status(404).json({ error: "Branding asset not found" });
        return;
      }

      // Delete from storage
      if (asset.blobUrl) {
        try {
          await deleteMedia(asset.blobUrl);
        } catch (e) {
          console.error("Failed to delete branding asset file:", e);
        }
      }

      await db
        .delete(podcastBrandingAssets)
        .where(
          and(eq(podcastBrandingAssets.id, assetId), eq(podcastBrandingAssets.podcastId, podcastId))
        );

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting branding asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export const podcastBrandingAssetsRouter = router;
