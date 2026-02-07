import { Router, Request, Response } from "express";
import multer from "multer";
import {
  uploadMedia,
  saveProject,
  getProject,
  listProjects,
  deleteProject,
  saveClip,
  getClipsForProject,
  deleteClip,
  saveMediaAsset,
  getMediaAssetsForProject,
  deleteMediaAsset,
  saveRenderedClip,
  getRenderedClipsForClip,
} from "../lib/media-storage.js";

const router = Router();

// Helper to extract string param (Express params can be string | string[])
function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

// Configure multer for file uploads (50MB limit for audio/video)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// List all projects
router.get("/projects", async (_req: Request, res: Response) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (error) {
    console.error("Error listing projects:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get a single project with its clips
router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const project = await getProject(id);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const clips = await getClipsForProject(id);
    const mediaAssets = await getMediaAssetsForProject(id);

    res.json({ project, clips, mediaAssets });
  } catch (error) {
    console.error("Error getting project:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create or update a project
router.post("/projects", async (req: Request, res: Response) => {
  try {
    const { id, name, sourceUrl, transcript, durationSeconds } = req.body;

    if (!id || !name) {
      res.status(400).json({ error: "id and name are required" });
      return;
    }

    await saveProject({ id, name, sourceUrl, transcript, durationSeconds });
    res.json({ success: true, id });
  } catch (error) {
    console.error("Error saving project:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Upload source media for a project
router.post("/projects/:id/source", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    // Upload to blob storage
    const { url, size } = await uploadMedia(
      file.buffer,
      file.originalname,
      file.mimetype,
      `projects/${id}`
    );

    // Update project with blob URL
    await saveProject({
      id,
      name: file.originalname,
      sourceBlobUrl: url,
    });

    res.json({ success: true, url, size });
  } catch (error) {
    console.error("Error uploading source:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete a project
router.delete("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    await deleteProject(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create or update a clip
router.post("/projects/:projectId/clips", async (req: Request, res: Response) => {
  try {
    const projectId = getParam(req.params.projectId);
    const {
      id,
      name,
      startTime,
      endTime,
      transcriptSegments,
      templateId,
      format,
      background,
      subtitle,
    } = req.body;

    if (!id || !name || startTime === undefined || endTime === undefined) {
      res.status(400).json({ error: "id, name, startTime, and endTime are required" });
      return;
    }

    await saveClip({
      id,
      projectId,
      name,
      startTime,
      endTime,
      transcriptSegments,
      templateId,
      format,
      background,
      subtitle,
    });

    res.json({ success: true, id });
  } catch (error) {
    console.error("Error saving clip:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Bulk sync clips for a project
router.put("/projects/:projectId/clips", async (req: Request, res: Response) => {
  try {
    const projectId = getParam(req.params.projectId);
    const { clips } = req.body;

    if (!Array.isArray(clips)) {
      res.status(400).json({ error: "clips array is required" });
      return;
    }

    for (const clip of clips) {
      await saveClip({
        id: clip.id,
        projectId,
        name: clip.name,
        startTime: clip.startTime,
        endTime: clip.endTime,
        transcriptSegments: clip.transcriptSegments,
        templateId: clip.templateId,
        format: clip.format,
        background: clip.background,
        subtitle: clip.subtitle,
      });
    }

    res.json({ success: true, count: clips.length });
  } catch (error) {
    console.error("Error syncing clips:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete a clip
router.delete("/clips/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    await deleteClip(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting clip:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Upload a media asset
router.post(
  "/projects/:projectId/assets",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req.params.projectId);
      const { id, type, name, durationSeconds, width, height, metadata } = req.body;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      if (!id || !type) {
        res.status(400).json({ error: "id and type are required" });
        return;
      }

      // Upload to blob storage
      const { url, size } = await uploadMedia(
        file.buffer,
        file.originalname,
        file.mimetype,
        `assets/${projectId}`
      );

      // Save asset metadata
      await saveMediaAsset({
        id,
        projectId,
        type,
        name: name || file.originalname,
        blobUrl: url,
        contentType: file.mimetype,
        sizeBytes: size,
        durationSeconds: durationSeconds ? parseFloat(durationSeconds) : undefined,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        metadata: metadata ? JSON.parse(metadata) : undefined,
      });

      res.json({ success: true, id, url, size });
    } catch (error) {
      console.error("Error uploading asset:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Delete a media asset
router.delete("/assets/:id", async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    await deleteMediaAsset(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting asset:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Upload a rendered clip
router.post(
  "/clips/:clipId/rendered",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const clipId = getParam(req.params.clipId);
      const { id, format } = req.body;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      if (!id || !format) {
        res.status(400).json({ error: "id and format are required" });
        return;
      }

      // Upload to blob storage
      const { url, size } = await uploadMedia(
        file.buffer,
        file.originalname,
        file.mimetype,
        `rendered/${clipId}`
      );

      // Save rendered clip metadata
      await saveRenderedClip({
        id,
        clipId,
        format,
        blobUrl: url,
        sizeBytes: size,
      });

      res.json({ success: true, id, url, size });
    } catch (error) {
      console.error("Error uploading rendered clip:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Get rendered clips for a clip
router.get("/clips/:clipId/rendered", async (req: Request, res: Response) => {
  try {
    const clipId = getParam(req.params.clipId);
    const renderedClips = await getRenderedClipsForClip(clipId);
    res.json({ renderedClips });
  } catch (error) {
    console.error("Error getting rendered clips:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const projectsRouter = router;
