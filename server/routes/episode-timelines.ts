import { Router, Request, Response } from "express";
import express from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { episodeTimelines, videoSources, projects } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";
import { getParam, verifyPodcastAccess } from "../middleware/podcast-access.js";

const router = Router();

// All routes require JWT auth
router.use(jwtAuthMiddleware);

// ============ Timeline CRUD ============

// Get timeline for an episode
router.get(
  "/:podcastId/episodes/:episodeId/timeline",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);

      const [timeline] = await db
        .select()
        .from(episodeTimelines)
        .where(eq(episodeTimelines.projectId, episodeId));

      res.json({ timeline: timeline || null });
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Upsert timeline for an episode
// Route-specific 50MB limit for large timelines (2hr episodes with many tracks)
router.put(
  "/:podcastId/episodes/:episodeId/timeline",
  verifyPodcastAccess,
  express.json({ limit: "50mb" }),
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);
      const {
        tracks,
        duration,
        fps,
        multicamConfig,
        captionStyle,
        background,
        markers,
        clipMarkers,
        format,
        version,
        updatedAt: clientUpdatedAt,
      } = req.body;

      // Validate required fields
      if (!Array.isArray(tracks)) {
        res.status(400).json({ error: "tracks must be an array" });
        return;
      }

      // Check for existing timeline
      const [existing] = await db
        .select()
        .from(episodeTimelines)
        .where(eq(episodeTimelines.projectId, episodeId));

      // Optimistic locking: if client provides updatedAt, compare with server
      if (existing && clientUpdatedAt) {
        const serverUpdatedAt = existing.updatedAt?.toISOString();
        if (serverUpdatedAt && clientUpdatedAt !== serverUpdatedAt) {
          res.status(409).json({
            error: "Timeline has been modified since your last load. Please refresh.",
            serverUpdatedAt,
          });
          return;
        }
      }

      const now = new Date();
      const values = {
        projectId: episodeId,
        tracks,
        duration: duration ?? 0,
        fps: fps ?? 30,
        multicamConfig: multicamConfig ?? null,
        captionStyle: captionStyle ?? null,
        background: background ?? {
          type: "gradient",
          gradientColors: ["#667eea", "#764ba2"],
          gradientDirection: 135,
        },
        markers: markers ?? [],
        clipMarkers: clipMarkers ?? [],
        format: format ?? "16:9",
        version: version ?? 1,
        updatedAt: now,
      };

      let timeline;
      if (existing) {
        [timeline] = await db
          .update(episodeTimelines)
          .set(values)
          .where(eq(episodeTimelines.id, existing.id))
          .returning();
      } else {
        [timeline] = await db
          .insert(episodeTimelines)
          .values({ ...values, createdAt: now })
          .returning();
      }

      res.json({ timeline });
    } catch (error) {
      console.error("Error saving timeline:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// Initialize timeline from episode sources
router.post(
  "/:podcastId/episodes/:episodeId/timeline/init",
  verifyPodcastAccess,
  async (req: Request, res: Response) => {
    try {
      const episodeId = getParam(req.params.episodeId);

      // Check if timeline already exists
      const [existing] = await db
        .select()
        .from(episodeTimelines)
        .where(eq(episodeTimelines.projectId, episodeId));

      if (existing) {
        res.json({ timeline: existing, created: false });
        return;
      }

      // Fetch episode data
      const [project] = await db.select().from(projects).where(eq(projects.id, episodeId));

      if (!project) {
        res.status(404).json({ error: "Episode not found" });
        return;
      }

      // Fetch video sources
      const sources = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.projectId, episodeId))
        .orderBy(asc(videoSources.displayOrder));

      // Build initial tracks
      const tracks: Array<Record<string, unknown>> = [];
      let timelineDuration = 0;

      // Determine duration from audio or video
      const audioDuration = project.audioDuration ?? 0;
      const maxVideoDuration = sources.reduce((max, s) => Math.max(max, s.durationSeconds ?? 0), 0);
      timelineDuration = Math.max(audioDuration, maxVideoDuration);

      if (timelineDuration === 0) {
        res.status(400).json({
          error: "Episode has no media. Upload audio or video first.",
        });
        return;
      }

      // Video-main track (multicam or single camera)
      if (sources.length > 0) {
        const speakerSources = sources.filter((s) => s.sourceType === "speaker");
        const videoItems = speakerSources.map((source, i) => ({
          id: crypto.randomUUID(),
          trackId: "track-video-main",
          startTime: 0,
          duration: source.durationSeconds ?? timelineDuration,
          sourceIn: 0,
          sourceOut: source.durationSeconds ?? timelineDuration,
          type: "video",
          mediaSourceId: source.id,
          mediaSourceType: "video-source",
          positionX: 50,
          positionY: 50,
          scale: 1,
          rotation: 0,
          opacity: i === 0 ? 1 : 0, // Only first source visible by default
          volume: 0, // Audio comes from audio-main track
          fadeIn: 0,
          fadeOut: 0,
          speed: 1,
        }));

        tracks.push({
          id: "track-video-main",
          type: "video-main",
          name: "Video",
          order: 0,
          locked: false,
          muted: false,
          visible: true,
          solo: false,
          volume: 1,
          opacity: 1,
          height: 72,
          items: videoItems,
        });
      }

      // Audio-main track
      if (project.audioBlobUrl || project.mixedAudioBlobUrl) {
        tracks.push({
          id: "track-audio-main",
          type: "audio-main",
          name: "Episode Audio",
          order: tracks.length,
          locked: false,
          muted: false,
          visible: true,
          solo: false,
          volume: 1,
          opacity: 1,
          height: 72,
          items: [
            {
              id: crypto.randomUUID(),
              trackId: "track-audio-main",
              startTime: 0,
              duration: audioDuration || timelineDuration,
              sourceIn: 0,
              sourceOut: audioDuration || timelineDuration,
              type: "audio",
              mediaSourceId: episodeId,
              mediaSourceType: "episode-audio",
              positionX: 50,
              positionY: 50,
              scale: 1,
              rotation: 0,
              opacity: 1,
              volume: 1,
              fadeIn: 0,
              fadeOut: 0,
              speed: 1,
            },
          ],
        });
      }

      // Captions track (empty — populated when user enables captions)
      tracks.push({
        id: "track-captions",
        type: "captions",
        name: "Captions",
        order: tracks.length,
        locked: false,
        muted: false,
        visible: true,
        solo: false,
        volume: 1,
        opacity: 1,
        height: 48,
        items: [],
      });

      // Build multicam config if multiple speaker sources
      const speakerSources = sources.filter((s) => s.sourceType === "speaker");
      const multicamConfig =
        speakerSources.length > 1
          ? {
              switchingTimeline: [
                {
                  startTime: 0,
                  endTime: timelineDuration,
                  videoSourceId: speakerSources[0].id,
                },
              ],
              layoutMode: "active-speaker",
              pipEnabled: false,
              pipPositions: [],
              pipScale: 0.2,
              transitionStyle: "cut",
              transitionDurationFrames: 3,
            }
          : null;

      const now = new Date();
      const [timeline] = await db
        .insert(episodeTimelines)
        .values({
          projectId: episodeId,
          tracks,
          duration: timelineDuration,
          fps: 30,
          multicamConfig,
          background: {
            type: "gradient",
            gradientColors: ["#667eea", "#764ba2"],
            gradientDirection: 135,
          },
          markers: [],
          clipMarkers: [],
          format: "16:9",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      res.status(201).json({ timeline, created: true });
    } catch (error) {
      console.error("Error initializing timeline:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export const episodeTimelinesRouter = router;
