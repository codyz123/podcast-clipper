import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// Test IDs
const ownerId = "owner-user-id";
const testPodcastId = "test-podcast-id";
const testEpisodeId = "test-episode-id";

const resetStores = () => {
  // Reset any shared state between tests
};

/**
 * Creates a thenable chainable mock that supports both:
 *   await db.select().from(X).where(Y)           -- where is terminal
 *   await db.select().from(X).where(Y).orderBy(Z) -- where is intermediate
 *
 * The trick: where() returns a thenable object (has .then()) that also
 * has .orderBy(), .returning(), etc. When awaited directly, it resolves
 * to returnValue. When .orderBy() is called, that returns the promise.
 */
const createChainableMock = (returnValue: unknown) => {
  const makeThenable = (val: unknown) => {
    const obj: Record<string, unknown> = {};
    obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(val).then(resolve, reject);
    obj.orderBy = vi.fn(() => Promise.resolve(val));
    obj.returning = vi.fn(() => Promise.resolve(val));
    return obj;
  };

  const chainable: Record<string, unknown> = {};
  chainable.from = vi.fn(() => chainable);
  chainable.where = vi.fn(() => makeThenable(returnValue));
  chainable.innerJoin = vi.fn(() => chainable);
  chainable.returning = vi.fn(() => Promise.resolve(returnValue));
  chainable.onConflictDoNothing = vi.fn(() => Promise.resolve());
  chainable.values = vi.fn(() => chainable);
  chainable.set = vi.fn(() => chainable);
  chainable.orderBy = vi.fn(() => Promise.resolve(returnValue));
  return chainable;
};

// Mock the database module
vi.mock("../../db/index.js", () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    db,
    podcasts: { _: { name: "podcasts" } },
    podcastMembers: { _: { name: "podcast_members" } },
  };
});

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  and: vi.fn((...args) => ({ type: "and", args })),
  asc: vi.fn((a) => ({ type: "asc", a })),
}));

// Mock schema
vi.mock("../../db/schema.js", () => ({
  episodeTimelines: { projectId: "projectId", id: "id" },
  videoSources: { projectId: "projectId", displayOrder: "displayOrder" },
  projects: { id: "id" },
  mediaAssets: { projectId: "projectId", id: "id", displayOrder: "displayOrder" },
  podcastBrandingAssets: { podcastId: "podcastId" },
  podcastMembers: { _: { name: "podcast_members" } },
}));

// Mock podcast access middleware - just pass through
vi.mock("../../middleware/podcast-access.js", () => ({
  getParam: (param: string) => param,
  verifyPodcastAccess: (_req: any, _res: any, next: () => void) => next(),
}));

describe("Episode Timelines Routes Integration", () => {
  let app: express.Express;
  let ownerToken: string;
  let dbModule: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-jwt-secret-key-12345";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-67890";

    dbModule = await import("../../db/index.js");

    const jwt = await import("jsonwebtoken");
    ownerToken = jwt.default.sign(
      { userId: ownerId, email: "owner@example.com", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
  });

  beforeEach(async () => {
    resetStores();
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    const { episodeTimelinesRouter } = await import("../../routes/episode-timelines.js");
    app.use("/api/podcasts", episodeTimelinesRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper: makes db.select() return a chainable that resolves
   * to the value returned by resultFn on each call.
   * resultFn receives callCount (1-indexed).
   */
  const setupSelectMock = (resultFn: (callCount: number) => unknown) => {
    let callCount = 0;
    dbModule.db.select.mockImplementation(() => {
      callCount++;
      const currentCall = callCount;
      const chain = createChainableMock([]);

      const makeThenable = (val: unknown) => {
        const obj: Record<string, unknown> = {};
        obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(val).then(resolve, reject);
        obj.orderBy = vi.fn(() => Promise.resolve(val));
        obj.returning = vi.fn(() => Promise.resolve(val));
        return obj;
      };

      chain.from = vi.fn(() => {
        chain.where = vi.fn(() => makeThenable(resultFn(currentCall)));
        return chain;
      });
      return chain;
    });
  };

  // ============ GET /:podcastId/episodes/:episodeId/timeline ============

  describe("GET /api/podcasts/:podcastId/episodes/:episodeId/timeline", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app).get(
        `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`
      );

      expect(response.status).toBe(401);
    });

    it("should return timeline when found", async () => {
      const now = new Date();
      const mockTimeline = {
        id: "timeline-1",
        projectId: testEpisodeId,
        tracks: [{ id: "track-1", type: "video-main", items: [] }],
        duration: 120,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: { type: "gradient", gradientColors: ["#667eea", "#764ba2"] },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      setupSelectMock(() => [mockTimeline]);

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeDefined();
      expect(response.body.timeline.id).toBe("timeline-1");
      expect(response.body.timeline.tracks).toHaveLength(1);
      expect(response.body.timeline.duration).toBe(120);
    });

    it("should return null timeline when not found", async () => {
      setupSelectMock(() => []);

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeNull();
    });

    it("should return 500 when database throws", async () => {
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        const makeRejecting = () => {
          const obj: Record<string, unknown> = {};
          const rejection = Promise.reject(new Error("DB connection failed"));
          obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            rejection.then(resolve, reject);
          obj.orderBy = vi.fn(() => rejection);
          return obj;
        };
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => makeRejecting());
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("DB connection failed");
    });
  });

  // ============ PUT /:podcastId/episodes/:episodeId/timeline ============

  describe("PUT /api/podcasts/:podcastId/episodes/:episodeId/timeline", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .send({ tracks: [] });

      expect(response.status).toBe(401);
    });

    it("should return 400 when tracks is not an array", async () => {
      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ tracks: "not-an-array" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("tracks must be an array");
    });

    it("should return 400 when tracks is missing", async () => {
      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ duration: 120 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("tracks must be an array");
    });

    it("should return 400 when tracks is an object instead of array", async () => {
      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ tracks: { id: "not-an-array" } });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("tracks must be an array");
    });

    it("should create timeline when none exists (upsert insert)", async () => {
      const newTimeline = {
        id: "new-timeline-1",
        projectId: testEpisodeId,
        tracks: [{ id: "track-1", type: "video-main", items: [] }],
        duration: 120,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: { type: "gradient", gradientColors: ["#667eea", "#764ba2"] },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Select returns empty (no existing timeline)
      setupSelectMock(() => []);

      // Insert returns the new timeline
      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([newTimeline]);
        chain.values = vi.fn(() => {
          chain.returning = vi.fn(() => Promise.resolve([newTimeline]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          tracks: [{ id: "track-1", type: "video-main", items: [] }],
          duration: 120,
          fps: 30,
        });

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeDefined();
      expect(response.body.timeline.id).toBe("new-timeline-1");
      expect(dbModule.db.insert).toHaveBeenCalled();
    });

    it("should update existing timeline (upsert update)", async () => {
      const now = new Date();
      const existingTimeline = {
        id: "timeline-1",
        projectId: testEpisodeId,
        tracks: [{ id: "track-1", type: "video-main", items: [] }],
        duration: 60,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: { type: "gradient" },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      const updatedTimeline = {
        ...existingTimeline,
        tracks: [
          { id: "track-1", type: "video-main", items: [] },
          { id: "track-2", type: "audio-main", items: [] },
        ],
        duration: 120,
        updatedAt: new Date(),
      };

      setupSelectMock(() => [existingTimeline]);

      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([updatedTimeline]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([updatedTimeline]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([updatedTimeline]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([updatedTimeline]));
            return inner;
          });
          thenable.returning = vi.fn(() => Promise.resolve([updatedTimeline]));
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          tracks: [
            { id: "track-1", type: "video-main", items: [] },
            { id: "track-2", type: "audio-main", items: [] },
          ],
          duration: 120,
        });

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeDefined();
      expect(response.body.timeline.duration).toBe(120);
      expect(dbModule.db.update).toHaveBeenCalled();
    });

    it("should return 409 on optimistic locking conflict", async () => {
      const serverDate = new Date("2025-01-01T12:00:00.000Z");
      const existingTimeline = {
        id: "timeline-1",
        projectId: testEpisodeId,
        tracks: [],
        duration: 60,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: { type: "gradient" },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: serverDate,
        updatedAt: serverDate,
      };

      setupSelectMock(() => [existingTimeline]);

      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          tracks: [{ id: "track-1", type: "video-main", items: [] }],
          updatedAt: "2024-12-31T00:00:00.000Z", // Stale timestamp
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain("modified since your last load");
      expect(response.body.serverUpdatedAt).toBe(serverDate.toISOString());
    });

    it("should skip optimistic locking when no updatedAt provided by client", async () => {
      const serverDate = new Date("2025-01-01T12:00:00.000Z");
      const existingTimeline = {
        id: "timeline-1",
        projectId: testEpisodeId,
        tracks: [],
        duration: 60,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: { type: "gradient" },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: serverDate,
        updatedAt: serverDate,
      };

      const updatedTimeline = { ...existingTimeline, updatedAt: new Date() };

      setupSelectMock(() => [existingTimeline]);

      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([updatedTimeline]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([updatedTimeline]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([updatedTimeline]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([updatedTimeline]));
            return inner;
          });
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          tracks: [{ id: "track-1", type: "video-main", items: [] }],
          // No updatedAt field
        });

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeDefined();
    });

    it("should pass through all optional fields", async () => {
      const newTimeline = {
        id: "new-timeline-1",
        projectId: testEpisodeId,
        tracks: [{ id: "track-1", type: "video-main", items: [] }],
        duration: 300,
        fps: 24,
        multicamConfig: { layoutMode: "active-speaker" },
        captionStyle: { fontSize: 24 },
        background: { type: "solid", color: "#000000" },
        markers: [{ time: 10, label: "Intro" }],
        clipMarkers: [{ start: 0, end: 60 }],
        format: "9:16",
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setupSelectMock(() => []);

      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([newTimeline]);
        chain.values = vi.fn(() => {
          chain.returning = vi.fn(() => Promise.resolve([newTimeline]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          tracks: [{ id: "track-1", type: "video-main", items: [] }],
          duration: 300,
          fps: 24,
          multicamConfig: { layoutMode: "active-speaker" },
          captionStyle: { fontSize: 24 },
          background: { type: "solid", color: "#000000" },
          markers: [{ time: 10, label: "Intro" }],
          clipMarkers: [{ start: 0, end: 60 }],
          format: "9:16",
          version: 2,
        });

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeDefined();
      expect(response.body.timeline.fps).toBe(24);
      expect(response.body.timeline.format).toBe("9:16");
      expect(response.body.timeline.multicamConfig).toEqual({ layoutMode: "active-speaker" });
    });

    it("should use default values when optional fields omitted on insert", async () => {
      const newTimeline = {
        id: "new-timeline-defaults",
        projectId: testEpisodeId,
        tracks: [],
        duration: 0,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: {
          type: "gradient",
          gradientColors: ["#667eea", "#764ba2"],
          gradientDirection: 135,
        },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setupSelectMock(() => []);

      let insertedValues: any = null;
      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([newTimeline]);
        chain.values = vi.fn((vals: any) => {
          insertedValues = vals;
          chain.returning = vi.fn(() => Promise.resolve([newTimeline]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .put(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          tracks: [],
          // No duration, fps, format, etc.
        });

      expect(response.status).toBe(200);
      expect(insertedValues).toBeDefined();
      expect(insertedValues.fps).toBe(30);
      expect(insertedValues.format).toBe("16:9");
      expect(insertedValues.version).toBe(1);
      expect(insertedValues.duration).toBe(0);
    });
  });

  // ============ POST /:podcastId/episodes/:episodeId/timeline/init ============

  describe("POST /api/podcasts/:podcastId/episodes/:episodeId/timeline/init", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app).post(
        `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`
      );

      expect(response.status).toBe(401);
    });

    it("should return existing timeline with created:false", async () => {
      const now = new Date();
      const existingTimeline = {
        id: "timeline-1",
        projectId: testEpisodeId,
        tracks: [{ id: "track-1", type: "video-main", items: [] }],
        duration: 120,
        fps: 30,
        multicamConfig: null,
        captionStyle: null,
        background: { type: "gradient" },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      // First select finds existing timeline - route returns early
      setupSelectMock(() => [existingTimeline]);

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.timeline).toBeDefined();
      expect(response.body.timeline.id).toBe("timeline-1");
      expect(response.body.created).toBe(false);
    });

    it("should return 404 when episode not found", async () => {
      // Call 1: no existing timeline, Call 2: no project
      setupSelectMock(() => []);

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Episode not found");
    });

    it("should return 400 when episode has no media", async () => {
      const projectWithNoMedia = {
        id: testEpisodeId,
        audioBlobUrl: null,
        mixedAudioBlobUrl: null,
        audioDuration: 0,
        audioFileName: null,
        createdAt: new Date(),
      };

      // Call 1: no timeline, Call 2: project (no audio), Call 3: no video sources (orderBy)
      setupSelectMock((n) => {
        if (n === 1) return []; // No existing timeline
        if (n === 2) return [projectWithNoMedia]; // Project found, no audio
        return []; // No video sources
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("no media");
    });

    it("should create initial timeline from episode with audio only", async () => {
      const projectWithAudio = {
        id: testEpisodeId,
        audioBlobUrl: "https://r2.example.com/audio.wav",
        mixedAudioBlobUrl: null,
        audioDuration: 300,
        audioFileName: "episode-audio.wav",
        createdAt: new Date(),
      };

      const createdTimeline = {
        id: "new-timeline-1",
        projectId: testEpisodeId,
        tracks: [
          { id: "track-audio-main", type: "audio-main" },
          { id: "track-captions", type: "captions" },
        ],
        duration: 300,
        fps: 30,
        multicamConfig: null,
        background: {
          type: "gradient",
          gradientColors: ["#667eea", "#764ba2"],
          gradientDirection: 135,
        },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setupSelectMock((n) => {
        if (n === 1) return []; // No existing timeline
        if (n === 2) return [projectWithAudio]; // Project found with audio
        return []; // No video sources
      });

      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdTimeline]);
        chain.values = vi.fn(() => {
          chain.returning = vi.fn(() => Promise.resolve([createdTimeline]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(201);
      expect(response.body.created).toBe(true);
      expect(response.body.timeline).toBeDefined();
      expect(dbModule.db.insert).toHaveBeenCalled();
    });

    it("should create initial timeline from episode with video sources", async () => {
      const projectWithMedia = {
        id: testEpisodeId,
        audioBlobUrl: "https://r2.example.com/audio.wav",
        mixedAudioBlobUrl: null,
        audioDuration: 300,
        audioFileName: "episode-audio.wav",
        createdAt: new Date(),
      };

      const videoSource = {
        id: "source-1",
        projectId: testEpisodeId,
        sourceType: "speaker",
        videoBlobUrl: "https://r2.example.com/video.mp4",
        proxyBlobUrl: "https://r2.example.com/proxy.mp4",
        thumbnailStripUrl: null,
        label: "Camera 1",
        fileName: "camera1.mp4",
        contentType: "video/mp4",
        sizeBytes: 1000000,
        durationSeconds: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        displayOrder: 0,
        syncOffsetMs: null,
        syncMethod: null,
        syncConfidence: null,
        createdAt: new Date(),
      };

      const createdTimeline = {
        id: "new-timeline-1",
        projectId: testEpisodeId,
        tracks: [
          { id: "track-video-main", type: "video-main" },
          { id: "track-audio-main", type: "audio-main" },
          { id: "track-captions", type: "captions" },
        ],
        duration: 300,
        fps: 30,
        multicamConfig: null,
        background: { type: "gradient" },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setupSelectMock((n) => {
        if (n === 1) return []; // No existing timeline
        if (n === 2) return [projectWithMedia]; // Project found
        return [videoSource]; // Video sources
      });

      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdTimeline]);
        chain.values = vi.fn(() => {
          chain.returning = vi.fn(() => Promise.resolve([createdTimeline]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(201);
      expect(response.body.created).toBe(true);
      expect(response.body.timeline).toBeDefined();
      expect(response.body.timeline.tracks).toHaveLength(3);
    });

    it("should create multicam config when multiple speaker sources exist", async () => {
      const projectWithMedia = {
        id: testEpisodeId,
        audioBlobUrl: "https://r2.example.com/audio.wav",
        mixedAudioBlobUrl: null,
        audioDuration: 300,
        audioFileName: "episode-audio.wav",
        createdAt: new Date(),
      };

      const sources = [
        {
          id: "source-1",
          projectId: testEpisodeId,
          sourceType: "speaker",
          videoBlobUrl: "https://r2.example.com/video1.mp4",
          durationSeconds: 300,
          displayOrder: 0,
          createdAt: new Date(),
        },
        {
          id: "source-2",
          projectId: testEpisodeId,
          sourceType: "speaker",
          videoBlobUrl: "https://r2.example.com/video2.mp4",
          durationSeconds: 300,
          displayOrder: 1,
          createdAt: new Date(),
        },
      ];

      const createdTimeline = {
        id: "new-timeline-multicam",
        projectId: testEpisodeId,
        tracks: [
          { id: "track-video-main", type: "video-main" },
          { id: "track-audio-main", type: "audio-main" },
          { id: "track-captions", type: "captions" },
        ],
        duration: 300,
        fps: 30,
        multicamConfig: {
          switchingTimeline: [{ startTime: 0, endTime: 300, videoSourceId: "source-1" }],
          layoutMode: "active-speaker",
        },
        background: { type: "gradient" },
        markers: [],
        clipMarkers: [],
        format: "16:9",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setupSelectMock((n) => {
        if (n === 1) return []; // No existing timeline
        if (n === 2) return [projectWithMedia]; // Project found
        return sources; // Multiple video sources
      });

      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdTimeline]);
        chain.values = vi.fn(() => {
          chain.returning = vi.fn(() => Promise.resolve([createdTimeline]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(201);
      expect(response.body.created).toBe(true);
      expect(response.body.timeline.multicamConfig).toBeDefined();
      expect(response.body.timeline.multicamConfig.layoutMode).toBe("active-speaker");
    });

    it("should return 500 on database error during init", async () => {
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        const makeRejecting = () => {
          const obj: Record<string, unknown> = {};
          const rejection = Promise.reject(new Error("Connection timeout"));
          obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            rejection.then(resolve, reject);
          obj.orderBy = vi.fn(() => rejection);
          return obj;
        };
        chain.from = vi.fn(() => {
          chain.where = vi.fn(() => makeRejecting());
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/timeline/init`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Connection timeout");
    });
  });
});
