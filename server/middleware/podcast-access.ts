import { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { podcastMembers } from "../db/schema.js";

// Helper to extract string param
export function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

// Middleware to verify podcast membership
export async function verifyPodcastAccess(req: Request, res: Response, next: () => void) {
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
