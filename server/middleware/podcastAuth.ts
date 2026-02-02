import { Request, Response, NextFunction } from "express";
import { db, podcastMembers } from "../db/index.js";
import { eq, and } from "drizzle-orm";

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      podcastMembership?: {
        podcastId: string;
        role: string;
      };
    }
  }
}

// Middleware factory to check podcast membership
export function requirePodcastMembership(options?: { requireOwner?: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const podcastIdParam = req.params.podcastId || req.params.id;
    const podcastId = Array.isArray(podcastIdParam) ? podcastIdParam[0] : podcastIdParam;

    if (!podcastId) {
      res.status(400).json({ error: "Podcast ID required" });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const [membership] = await db
        .select()
        .from(podcastMembers)
        .where(
          and(eq(podcastMembers.podcastId, podcastId), eq(podcastMembers.userId, req.user.userId))
        );

      if (!membership) {
        res.status(403).json({ error: "Not a member of this podcast" });
        return;
      }

      if (options?.requireOwner && membership.role !== "owner") {
        res.status(403).json({ error: "Owner permission required" });
        return;
      }

      req.podcastMembership = {
        podcastId: membership.podcastId,
        role: membership.role,
      };

      next();
    } catch (error) {
      console.error("Podcast auth error:", error);
      res.status(500).json({ error: "Failed to verify podcast membership" });
    }
  };
}
