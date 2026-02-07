import { Router, Request, Response } from "express";
import multer from "multer";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { podcastPeople } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { getParam, verifyPodcastAccess } from "../middleware/podcast-access.js";
import { uploadMedia, deleteMedia } from "../lib/media-storage.js";

const router = Router();

// Memory storage for photo uploads (5MB limit)
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

// List all people for a podcast
router.get("/:podcastId/people", verifyPodcastAccess, async (req: Request, res: Response) => {
  try {
    const podcastId = getParam(req.params.podcastId);

    const people = await db
      .select()
      .from(podcastPeople)
      .where(eq(podcastPeople.podcastId, podcastId))
      .orderBy(asc(podcastPeople.name));

    res.json({ people });
  } catch (error) {
    console.error("Error listing podcast people:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create a new person
router.post("/:podcastId/people", verifyPodcastAccess, async (req: Request, res: Response) => {
  try {
    const podcastId = getParam(req.params.podcastId);
    const { name, role, bio, website, twitter } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    if (role && !["host", "guest"].includes(role)) {
      res.status(400).json({ error: "Role must be 'host' or 'guest'" });
      return;
    }

    const [person] = await db
      .insert(podcastPeople)
      .values({
        podcastId,
        name: name.trim(),
        role: role || "guest",
        bio,
        website,
        twitter,
      })
      .returning();

    res.json({ person });
  } catch (error) {
    console.error("Error creating podcast person:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update a person
router.put(
  "/:podcastId/people/:personId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const personId = getParam(req.params.personId);
      const updates = req.body;

      // Filter to allowed fields
      const allowedFields = ["name", "role", "bio", "website", "twitter"];
      const filteredUpdates: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates) {
          filteredUpdates[key] = updates[key];
        }
      }

      // Validate role if provided
      if (filteredUpdates.role && !["host", "guest"].includes(filteredUpdates.role as string)) {
        res.status(400).json({ error: "Role must be 'host' or 'guest'" });
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

      const [person] = await db
        .update(podcastPeople)
        .set(filteredUpdates)
        .where(and(eq(podcastPeople.id, personId), eq(podcastPeople.podcastId, podcastId)))
        .returning();

      if (!person) {
        res.status(404).json({ error: "Person not found" });
        return;
      }

      res.json({ person });
    } catch (error) {
      console.error("Error updating podcast person:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete a person
router.delete(
  "/:podcastId/people/:personId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const personId = getParam(req.params.personId);

      // Get person to check for photo to delete
      const [person] = await db
        .select()
        .from(podcastPeople)
        .where(and(eq(podcastPeople.id, personId), eq(podcastPeople.podcastId, podcastId)));

      if (!person) {
        res.status(404).json({ error: "Person not found" });
        return;
      }

      // Delete photo from storage if exists
      if (person.photoUrl) {
        try {
          await deleteMedia(person.photoUrl);
        } catch (e) {
          console.error("Failed to delete person photo:", e);
        }
      }

      await db
        .delete(podcastPeople)
        .where(and(eq(podcastPeople.id, personId), eq(podcastPeople.podcastId, podcastId)));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting podcast person:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Upload photo for a person
router.post(
  "/:podcastId/people/:personId/photo",
  verifyPodcastAccess,
  photoUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const podcastId = getParam(req.params.podcastId);
      const personId = getParam(req.params.personId);
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Verify person exists and belongs to podcast
      const [person] = await db
        .select()
        .from(podcastPeople)
        .where(and(eq(podcastPeople.id, personId), eq(podcastPeople.podcastId, podcastId)));

      if (!person) {
        res.status(404).json({ error: "Person not found" });
        return;
      }

      // Delete old photo if exists
      if (person.photoUrl) {
        try {
          await deleteMedia(person.photoUrl);
        } catch (e) {
          console.error("Failed to delete old person photo:", e);
        }
      }

      // Upload new photo
      const { url } = await uploadMedia(
        file.buffer,
        file.originalname,
        file.mimetype,
        `podcasts/${podcastId}/people/${personId}`
      );

      // Update person with new photo URL
      const [updated] = await db
        .update(podcastPeople)
        .set({ photoUrl: url, updatedAt: new Date() })
        .where(eq(podcastPeople.id, personId))
        .returning();

      res.json({ person: updated, photoUrl: url });
    } catch (error) {
      console.error("Error uploading person photo:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export const podcastPeopleRouter = router;
