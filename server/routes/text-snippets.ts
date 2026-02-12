import { Router, Request, Response } from "express";
import { eq, and, max } from "drizzle-orm";
import { db } from "../db/index.js";
import { textSnippets, podcastMembers } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";

const router = Router();

// Helper to extract string param
function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

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

  req.podcastMembership = membership;
  next();
}

// All routes require JWT auth
router.use(jwtAuthMiddleware);

// ============ Text Snippets ============

// GET - List all snippets for an episode
router.get(
  "/:podcastId/episodes/:episodeId/snippets",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);

      const snippets = await db
        .select()
        .from(textSnippets)
        .where(eq(textSnippets.projectId, episodeId))
        .orderBy(textSnippets.index);

      res.json({ snippets });
    } catch (error) {
      console.error("Error listing snippets:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// POST - Create new snippet
router.post(
  "/:podcastId/episodes/:episodeId/snippets",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const userId = req.user.userId;
      const { content, prompt, focusClipId, isManual, name } = req.body;

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        res.status(400).json({ error: "Content is required" });
        return;
      }

      // Get next index for this project
      const [maxResult] = await db
        .select({ maxIndex: max(textSnippets.index) })
        .from(textSnippets)
        .where(eq(textSnippets.projectId, episodeId));

      const nextIndex = (maxResult?.maxIndex ?? 0) + 1;

      const [snippet] = await db
        .insert(textSnippets)
        .values({
          projectId: episodeId,
          index: nextIndex,
          name: name || `Snippet ${nextIndex}`,
          content: content.trim(),
          prompt: prompt || null,
          focusClipId: focusClipId || null,
          isManual: isManual ?? false,
          createdById: userId,
        })
        .returning();

      res.json({ snippet });
    } catch (error) {
      console.error("Error creating snippet:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// PUT - Update snippet
router.put(
  "/:podcastId/episodes/:episodeId/snippets/:snippetId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const snippetId = getParam(req.params.snippetId);
      const { content, name } = req.body;

      // Verify snippet belongs to episode
      const [existing] = await db
        .select()
        .from(textSnippets)
        .where(and(eq(textSnippets.id, snippetId), eq(textSnippets.projectId, episodeId)));

      if (!existing) {
        res.status(404).json({ error: "Snippet not found" });
        return;
      }

      const [snippet] = await db
        .update(textSnippets)
        .set({
          ...(content !== undefined && { content }),
          ...(name !== undefined && { name }),
          updatedAt: new Date(),
        })
        .where(eq(textSnippets.id, snippetId))
        .returning();

      res.json({ snippet });
    } catch (error) {
      console.error("Error updating snippet:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// DELETE - Remove snippet
router.delete(
  "/:podcastId/episodes/:episodeId/snippets/:snippetId",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const snippetId = getParam(req.params.snippetId);

      // Verify snippet belongs to episode
      const [existing] = await db
        .select()
        .from(textSnippets)
        .where(and(eq(textSnippets.id, snippetId), eq(textSnippets.projectId, episodeId)));

      if (!existing) {
        res.status(404).json({ error: "Snippet not found" });
        return;
      }

      await db.delete(textSnippets).where(eq(textSnippets.id, snippetId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting snippet:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export { router as textSnippetsRouter };
