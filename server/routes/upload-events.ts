import { Router, Request, Response } from "express";
import { asc, eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { uploadEvents } from "../db/schema.js";

const router = Router();

router.get("/uploads/:platform/:id/events", async (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as string;
    const uploadId = req.params.id as string;

    const events = await db
      .select()
      .from(uploadEvents)
      .where(and(eq(uploadEvents.platform, platform), eq(uploadEvents.uploadId, uploadId)))
      .orderBy(asc(uploadEvents.createdAt));

    res.json({ events });
  } catch (error) {
    console.error("Failed to fetch upload events:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const uploadEventsRouter = router;
