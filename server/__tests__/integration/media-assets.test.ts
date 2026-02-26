import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// Test IDs
const ownerId = "owner-user-id";
const testPodcastId = "test-podcast-id";
const testEpisodeId = "test-episode-id";

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
  podcastBrandingAssets: { podcastId: "podcastId", displayOrder: "displayOrder" },
  podcastMembers: { _: { name: "podcast_members" } },
}));

// Mock podcast access middleware - just pass through
vi.mock("../../middleware/podcast-access.js", () => ({
  getParam: (param: string) => param,
  verifyPodcastAccess: (_req: any, _res: any, next: () => void) => next(),
}));

// Mock R2 storage
vi.mock("../../lib/r2-storage.js", () => ({
  deleteFromR2ByUrl: vi.fn().mockResolvedValue(undefined),
}));

describe("Media Assets Routes Integration", () => {
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
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    const { mediaAssetsRouter } = await import("../../routes/media-assets.js");
    app.use("/api/podcasts", mediaAssetsRouter);
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

  // ============ GET /:podcastId/episodes/:episodeId/media-assets ============

  describe("GET /api/podcasts/:podcastId/episodes/:episodeId/media-assets", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app).get(
        `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`
      );

      expect(response.status).toBe(401);
    });

    it("should return empty array when no assets exist", async () => {
      // 4 selects: videoSources, mediaAssets, projects, brandingAssets — all empty
      setupSelectMock(() => []);

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.mediaItems).toEqual([]);
    });

    it("should return aggregated media items from multiple sources", async () => {
      const now = new Date();

      const videoSource = {
        id: "vs-1",
        projectId: testEpisodeId,
        sourceType: "speaker",
        videoBlobUrl: "https://r2.example.com/video.mp4",
        proxyBlobUrl: "https://r2.example.com/proxy.mp4",
        thumbnailStripUrl: "https://r2.example.com/thumb.jpg",
        label: "Camera 1",
        fileName: "camera1.mp4",
        contentType: "video/mp4",
        sizeBytes: 5000000,
        durationSeconds: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        displayOrder: 0,
        syncOffsetMs: 0,
        syncMethod: "audio",
        syncConfidence: 0.95,
        createdAt: now,
      };

      const mediaAsset = {
        id: "ma-1",
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        sizeBytes: 50000,
        category: "graphic",
        durationSeconds: null,
        width: 512,
        height: 512,
        fps: null,
        thumbnailUrl: null,
        displayOrder: 0,
        createdAt: now,
      };

      const project = {
        id: testEpisodeId,
        audioBlobUrl: "https://r2.example.com/audio.wav",
        mixedAudioBlobUrl: "https://r2.example.com/mixed.wav",
        audioDuration: 300,
        audioFileName: "episode-audio.wav",
        createdAt: now,
      };

      const brandingAsset = {
        id: "ba-1",
        podcastId: testPodcastId,
        name: "Podcast Logo",
        blobUrl: "https://r2.example.com/branding.png",
        contentType: "image/png",
        sizeBytes: 100000,
        width: 1024,
        height: 1024,
        displayOrder: 0,
        createdAt: now,
      };

      setupSelectMock((n) => {
        if (n === 1) return [videoSource]; // Video sources
        if (n === 2) return [mediaAsset]; // Media assets
        if (n === 3) return [project]; // Project
        if (n === 4) return [brandingAsset]; // Branding assets
        return [];
      });

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.mediaItems).toBeDefined();
      // Should have: 1 video source + 1 media asset + 1 episode audio + 1 branding = 4
      expect(response.body.mediaItems).toHaveLength(4);

      // Verify sources are mapped correctly
      const sources = response.body.mediaItems.map((item: any) => item.source);
      expect(sources).toContain("video-source");
      expect(sources).toContain("media-asset");
      expect(sources).toContain("episode-audio");
      expect(sources).toContain("branding");
    });

    it("should filter by category query param", async () => {
      const now = new Date();

      const videoSource = {
        id: "vs-1",
        projectId: testEpisodeId,
        sourceType: "speaker",
        videoBlobUrl: "https://r2.example.com/video.mp4",
        proxyBlobUrl: "https://r2.example.com/proxy.mp4",
        thumbnailStripUrl: null,
        label: "Camera 1",
        fileName: "camera1.mp4",
        contentType: "video/mp4",
        sizeBytes: 5000000,
        durationSeconds: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        displayOrder: 0,
        syncOffsetMs: null,
        syncMethod: null,
        syncConfidence: null,
        createdAt: now,
      };

      const mediaAsset = {
        id: "ma-1",
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        sizeBytes: 50000,
        category: "graphic",
        durationSeconds: null,
        width: 512,
        height: 512,
        fps: null,
        thumbnailUrl: null,
        displayOrder: 0,
        createdAt: now,
      };

      setupSelectMock((n) => {
        if (n === 1) return [videoSource]; // Video sources
        if (n === 2) return [mediaAsset]; // Media assets
        return []; // No project audio, no branding
      });

      // Filter for "camera" category only
      const response = await request(app)
        .get(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets?category=camera`
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      // Only camera items should be returned, not graphic
      expect(response.body.mediaItems.length).toBeGreaterThan(0);
      for (const item of response.body.mediaItems) {
        expect(item.category).toBe("camera");
      }
    });

    it("should map speaker sourceType to camera category", async () => {
      const now = new Date();

      const speakerSource = {
        id: "vs-1",
        projectId: testEpisodeId,
        sourceType: "speaker",
        videoBlobUrl: "https://r2.example.com/video.mp4",
        proxyBlobUrl: "https://r2.example.com/proxy.mp4",
        thumbnailStripUrl: null,
        label: "Camera 1",
        fileName: "camera1.mp4",
        contentType: "video/mp4",
        sizeBytes: 5000000,
        durationSeconds: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        displayOrder: 0,
        syncOffsetMs: null,
        syncMethod: null,
        syncConfidence: null,
        createdAt: now,
      };

      setupSelectMock((n) => {
        if (n === 1) return [speakerSource]; // Video source (speaker type)
        return []; // Everything else empty
      });

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const cameraItems = response.body.mediaItems.filter(
        (item: any) => item.source === "video-source"
      );
      expect(cameraItems.length).toBe(1);
      expect(cameraItems[0].category).toBe("camera");
    });

    it("should map broll sourceType to broll category", async () => {
      const now = new Date();

      const brollSource = {
        id: "vs-2",
        projectId: testEpisodeId,
        sourceType: "broll",
        videoBlobUrl: "https://r2.example.com/broll.mp4",
        proxyBlobUrl: null,
        thumbnailStripUrl: null,
        label: "B-Roll Clip",
        fileName: "broll.mp4",
        contentType: "video/mp4",
        sizeBytes: 2000000,
        durationSeconds: 15,
        width: 1920,
        height: 1080,
        fps: 30,
        displayOrder: 1,
        syncOffsetMs: null,
        syncMethod: null,
        syncConfidence: null,
        createdAt: now,
      };

      setupSelectMock((n) => {
        if (n === 1) return [brollSource];
        return [];
      });

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const brollItems = response.body.mediaItems.filter(
        (item: any) => item.source === "video-source"
      );
      expect(brollItems.length).toBe(1);
      expect(brollItems[0].category).toBe("broll");
    });

    it("should include episode audio with mixed audio URL when available", async () => {
      const now = new Date();
      const project = {
        id: testEpisodeId,
        audioBlobUrl: "https://r2.example.com/audio.wav",
        mixedAudioBlobUrl: "https://r2.example.com/mixed.wav",
        audioDuration: 300,
        audioFileName: "episode-audio.wav",
        createdAt: now,
      };

      setupSelectMock((n) => {
        if (n === 3) return [project]; // Project with audio
        return [];
      });

      const response = await request(app)
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const audioItem = response.body.mediaItems.find(
        (item: any) => item.source === "episode-audio"
      );
      expect(audioItem).toBeDefined();
      expect(audioItem.blobUrl).toBe("https://r2.example.com/mixed.wav");
      expect(audioItem.category).toBe("episode-audio");
      expect(audioItem.displayOrder).toBe(-1); // Always at top
    });

    it("should return 500 on database error", async () => {
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        const makeRejecting = () => {
          const obj: Record<string, unknown> = {};
          const rejection = Promise.reject(new Error("DB connection lost"));
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
        .get(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("DB connection lost");
    });
  });

  // ============ POST /:podcastId/episodes/:episodeId/media-assets ============

  describe("POST /api/podcasts/:podcastId/episodes/:episodeId/media-assets", () => {
    it("should reject request without authentication", async () => {
      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .send({ blobUrl: "https://example.com/file.png", name: "Test" });

      expect(response.status).toBe(401);
    });

    it("should return 400 when blobUrl is missing", async () => {
      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Test Asset" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("blobUrl and name are required");
    });

    it("should return 400 when name is missing", async () => {
      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ blobUrl: "https://example.com/file.png" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("blobUrl and name are required");
    });

    it("should return 400 when both blobUrl and name are missing", async () => {
      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ contentType: "image/png" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("blobUrl and name are required");
    });

    it("should create a media asset record", async () => {
      const now = new Date();
      const createdAsset = {
        id: "asset-1",
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        sizeBytes: 50000,
        category: "graphic",
        durationSeconds: null,
        width: 512,
        height: 512,
        fps: null,
        thumbnailUrl: null,
        displayOrder: 0,
        createdAt: now,
      };

      // Select counts existing assets for displayOrder
      setupSelectMock(() => []);

      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdAsset]);
        chain.values = vi.fn(() => {
          chain.returning = vi.fn(() => Promise.resolve([createdAsset]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          blobUrl: "https://r2.example.com/logo.png",
          name: "Logo.png",
          contentType: "image/png",
          sizeBytes: 50000,
          category: "graphic",
          width: 512,
          height: 512,
        });

      expect(response.status).toBe(201);
      expect(response.body.mediaAsset).toBeDefined();
      expect(response.body.mediaAsset.name).toBe("Logo.png");
      expect(response.body.mediaAsset.id).toBe("asset-1");
      expect(dbModule.db.insert).toHaveBeenCalled();
    });

    it("should set displayOrder based on existing asset count", async () => {
      const existingAssets = [
        { id: "existing-1", projectId: testEpisodeId },
        { id: "existing-2", projectId: testEpisodeId },
      ];

      const createdAsset = {
        id: "asset-3",
        projectId: testEpisodeId,
        type: "video",
        name: "Clip.mp4",
        blobUrl: "https://r2.example.com/clip.mp4",
        contentType: "video/mp4",
        sizeBytes: 2000000,
        category: "general",
        durationSeconds: 15,
        width: 1920,
        height: 1080,
        fps: 30,
        thumbnailUrl: null,
        displayOrder: 2,
        createdAt: new Date(),
      };

      setupSelectMock(() => existingAssets);

      let insertedValues: any = null;
      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdAsset]);
        chain.values = vi.fn((vals: any) => {
          insertedValues = vals;
          chain.returning = vi.fn(() => Promise.resolve([createdAsset]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          blobUrl: "https://r2.example.com/clip.mp4",
          name: "Clip.mp4",
          contentType: "video/mp4",
          sizeBytes: 2000000,
        });

      expect(response.status).toBe(201);
      expect(insertedValues).toBeDefined();
      expect(insertedValues.displayOrder).toBe(2); // Based on existing count
    });

    it("should default category to general when not provided", async () => {
      const createdAsset = {
        id: "asset-1",
        projectId: testEpisodeId,
        type: "image",
        name: "Photo.jpg",
        blobUrl: "https://r2.example.com/photo.jpg",
        contentType: "image/jpeg",
        sizeBytes: 100000,
        category: "general",
        durationSeconds: null,
        width: null,
        height: null,
        fps: null,
        thumbnailUrl: null,
        displayOrder: 0,
        createdAt: new Date(),
      };

      setupSelectMock(() => []);

      let insertedValues: any = null;
      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdAsset]);
        chain.values = vi.fn((vals: any) => {
          insertedValues = vals;
          chain.returning = vi.fn(() => Promise.resolve([createdAsset]));
          return chain;
        });
        return chain;
      });

      const response = await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          blobUrl: "https://r2.example.com/photo.jpg",
          name: "Photo.jpg",
          contentType: "image/jpeg",
        });

      expect(response.status).toBe(201);
      expect(insertedValues.category).toBe("general");
    });

    it("should derive type from contentType", async () => {
      const createdAsset = {
        id: "asset-1",
        projectId: testEpisodeId,
        type: "video",
        name: "Clip.mp4",
        blobUrl: "https://r2.example.com/clip.mp4",
        contentType: "video/mp4",
        category: "general",
        displayOrder: 0,
        createdAt: new Date(),
      };

      setupSelectMock(() => []);

      let insertedValues: any = null;
      dbModule.db.insert.mockImplementation(() => {
        const chain = createChainableMock([createdAsset]);
        chain.values = vi.fn((vals: any) => {
          insertedValues = vals;
          chain.returning = vi.fn(() => Promise.resolve([createdAsset]));
          return chain;
        });
        return chain;
      });

      await request(app)
        .post(`/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          blobUrl: "https://r2.example.com/clip.mp4",
          name: "Clip.mp4",
          contentType: "video/mp4",
        });

      expect(insertedValues.type).toBe("video");
    });
  });

  // ============ PATCH /:podcastId/episodes/:episodeId/media-assets/:assetId ============

  describe("PATCH /api/podcasts/:podcastId/episodes/:episodeId/media-assets/:assetId", () => {
    const testAssetId = "asset-1";

    it("should reject request without authentication", async () => {
      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .send({ name: "Updated Name" });

      expect(response.status).toBe(401);
    });

    it("should return 400 when no valid fields provided", async () => {
      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ blobUrl: "should-be-ignored", contentType: "also-ignored" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("No valid fields");
    });

    it("should return 400 when body is empty", async () => {
      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("No valid fields");
    });

    it("should update asset name", async () => {
      const updatedAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "image",
        name: "Renamed Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        sizeBytes: 50000,
        category: "graphic",
        displayOrder: 0,
        createdAt: new Date(),
      };

      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([updatedAsset]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([updatedAsset]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([updatedAsset]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([updatedAsset]));
            return inner;
          });
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Renamed Logo.png" });

      expect(response.status).toBe(200);
      expect(response.body.mediaAsset).toBeDefined();
      expect(response.body.mediaAsset.name).toBe("Renamed Logo.png");
    });

    it("should update asset category", async () => {
      const updatedAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        category: "overlay",
        displayOrder: 0,
        createdAt: new Date(),
      };

      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([updatedAsset]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([updatedAsset]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([updatedAsset]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([updatedAsset]));
            return inner;
          });
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ category: "overlay" });

      expect(response.status).toBe(200);
      expect(response.body.mediaAsset.category).toBe("overlay");
    });

    it("should update asset displayOrder", async () => {
      const updatedAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        category: "graphic",
        displayOrder: 5,
        createdAt: new Date(),
      };

      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([updatedAsset]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([updatedAsset]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([updatedAsset]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([updatedAsset]));
            return inner;
          });
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ displayOrder: 5 });

      expect(response.status).toBe(200);
      expect(response.body.mediaAsset.displayOrder).toBe(5);
    });

    it("should return 404 when asset not found", async () => {
      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([]));
            return inner;
          });
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/nonexistent-id`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated" });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Media asset not found");
    });

    it("should update multiple allowed fields at once", async () => {
      const updatedAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "image",
        name: "New Name.png",
        blobUrl: "https://r2.example.com/logo.png",
        category: "overlay",
        displayOrder: 3,
        createdAt: new Date(),
      };

      dbModule.db.update.mockImplementation(() => {
        const chain = createChainableMock([updatedAsset]);
        chain.set = vi.fn(() => {
          const thenable: Record<string, unknown> = {};
          thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve([updatedAsset]).then(resolve, reject);
          thenable.where = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve([updatedAsset]).then(resolve, reject);
            inner.returning = vi.fn(() => Promise.resolve([updatedAsset]));
            return inner;
          });
          return thenable;
        });
        return chain;
      });

      const response = await request(app)
        .patch(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "New Name.png", category: "overlay", displayOrder: 3 });

      expect(response.status).toBe(200);
      expect(response.body.mediaAsset.name).toBe("New Name.png");
      expect(response.body.mediaAsset.category).toBe("overlay");
      expect(response.body.mediaAsset.displayOrder).toBe(3);
    });
  });

  // ============ DELETE /:podcastId/episodes/:episodeId/media-assets/:assetId ============

  describe("DELETE /api/podcasts/:podcastId/episodes/:episodeId/media-assets/:assetId", () => {
    const testAssetId = "asset-1";

    it("should reject request without authentication", async () => {
      const response = await request(app).delete(
        `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
      );

      expect(response.status).toBe(401);
    });

    it("should delete asset and return success", async () => {
      const existingAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        thumbnailUrl: "https://r2.example.com/thumb.jpg",
        category: "graphic",
        displayOrder: 0,
        createdAt: new Date(),
      };

      setupSelectMock(() => [existingAsset]);

      dbModule.db.delete.mockImplementation(() => {
        const chain = createChainableMock([]);
        const thenable: Record<string, unknown> = {};
        thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve([]).then(resolve, reject);
        chain.where = vi.fn(() => thenable);
        return chain;
      });

      const response = await request(app)
        .delete(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(dbModule.db.delete).toHaveBeenCalled();
    });

    it("should return 404 when asset not found", async () => {
      setupSelectMock(() => []);

      const response = await request(app)
        .delete(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/nonexistent-id`
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Media asset not found");
    });

    it("should call R2 cleanup for blobUrl and thumbnailUrl", async () => {
      const { deleteFromR2ByUrl } = await import("../../lib/r2-storage.js");

      const existingAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "image",
        name: "Logo.png",
        blobUrl: "https://r2.example.com/logo.png",
        contentType: "image/png",
        thumbnailUrl: "https://r2.example.com/thumb.jpg",
        category: "graphic",
        displayOrder: 0,
        createdAt: new Date(),
      };

      setupSelectMock(() => [existingAsset]);

      dbModule.db.delete.mockImplementation(() => {
        const chain = createChainableMock([]);
        const thenable: Record<string, unknown> = {};
        thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve([]).then(resolve, reject);
        chain.where = vi.fn(() => thenable);
        return chain;
      });

      const response = await request(app)
        .delete(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Give the background Promise.all a tick to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      // R2 cleanup should have been called for both URLs
      expect(deleteFromR2ByUrl).toHaveBeenCalledWith("https://r2.example.com/logo.png");
      expect(deleteFromR2ByUrl).toHaveBeenCalledWith("https://r2.example.com/thumb.jpg");
    });

    it("should handle deletion when asset has no thumbnailUrl", async () => {
      const existingAsset = {
        id: testAssetId,
        projectId: testEpisodeId,
        type: "video",
        name: "Clip.mp4",
        blobUrl: "https://r2.example.com/clip.mp4",
        contentType: "video/mp4",
        thumbnailUrl: null, // No thumbnail
        category: "general",
        displayOrder: 0,
        createdAt: new Date(),
      };

      setupSelectMock(() => [existingAsset]);

      dbModule.db.delete.mockImplementation(() => {
        const chain = createChainableMock([]);
        const thenable: Record<string, unknown> = {};
        thenable.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve([]).then(resolve, reject);
        chain.where = vi.fn(() => thenable);
        return chain;
      });

      const response = await request(app)
        .delete(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return 500 on database error during delete", async () => {
      dbModule.db.select.mockImplementation(() => {
        const chain = createChainableMock([]);
        const makeRejecting = () => {
          const obj: Record<string, unknown> = {};
          const rejection = Promise.reject(new Error("Database write failed"));
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
        .delete(
          `/api/podcasts/${testPodcastId}/episodes/${testEpisodeId}/media-assets/${testAssetId}`
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Database write failed");
    });
  });
});
