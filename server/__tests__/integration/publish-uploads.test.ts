import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";
import { authMiddleware } from "../../middleware/auth.js";
import { youtubeUploadRouter } from "../../routes/youtube-upload.js";
import { instagramUploadRouter } from "../../routes/instagram-upload.js";
import { tiktokUploadRouter } from "../../routes/tiktok-upload.js";
import { xUploadRouter } from "../../routes/x-upload.js";

vi.mock("../../db/index.js", () => {
  const tables: Record<string, any[]> = {
    rendered_clips_v2: [],
    youtube_uploads: [],
    instagram_uploads: [],
    tiktok_uploads: [],
    x_uploads: [],
  };

  const pickColumns = (row: Record<string, unknown>, selectCols: Record<string, unknown>) => {
    if (!selectCols || Object.keys(selectCols).length === 0) return row;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(selectCols)) {
      result[key] = row[key];
    }
    return result;
  };

  const db = {
    select: vi.fn((selectCols?: Record<string, unknown>) => ({
      from: vi.fn((table: any) => {
        const tableName = table?._?.name as string;
        const resolveRows = () => {
          const rows = tables[tableName] || [];
          return selectCols ? rows.map((row) => pickColumns(row, selectCols)) : rows;
        };

        const query: any = {
          where: vi.fn(() => query),
          orderBy: vi.fn(async () => resolveRows()),
          then: (resolve: any, reject: any) => Promise.resolve(resolveRows()).then(resolve, reject),
        };

        return query;
      }),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((data: Record<string, unknown>) => {
        const tableName = table?._?.name as string;
        const row = {
          id: crypto.randomUUID(),
          ...data,
        };
        tables[tableName] = tables[tableName] || [];
        tables[tableName].push(row);
        return {
          returning: vi.fn(async () => [row]),
        };
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((data: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          const tableName = table?._?.name as string;
          tables[tableName] = (tables[tableName] || []).map((row) => ({
            ...row,
            ...data,
          }));
          return [];
        }),
      })),
    })),
    _test: {
      tables,
      reset: () => {
        for (const key of Object.keys(tables)) {
          tables[key] = [];
        }
      },
    },
  };

  return {
    db,
    renderedClips: { _: { name: "rendered_clips_v2" } },
    youtubeUploads: { _: { name: "youtube_uploads" } },
    instagramUploads: { _: { name: "instagram_uploads" } },
    tiktokUploads: { _: { name: "tiktok_uploads" } },
    xUploads: { _: { name: "x_uploads" } },
  };
});

vi.mock("../../lib/token-storage.js", () => ({
  getToken: vi.fn(async (platform: string) => {
    if (platform === "instagram") {
      return {
        accessToken: "ig-access",
        refreshToken: "ig-refresh",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accountName: "iguser",
        accountId: "ig123",
      };
    }
    if (platform === "youtube") {
      return {
        accessToken: "yt-access",
        refreshToken: "yt-refresh",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accountName: "ytuser",
        accountId: "yt123",
      };
    }
    if (platform === "tiktok") {
      return {
        accessToken: "tt-access",
        refreshToken: "tt-refresh",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accountName: "ttuser",
        accountId: "tt123",
      };
    }
    if (platform === "x") {
      return {
        accessToken: "x-access",
        refreshToken: "x-secret",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accountName: "xuser",
        accountId: "x123",
      };
    }
    return null;
  }),
  saveToken: vi.fn(async () => {}),
  updateToken: vi.fn(async () => {}),
  deleteToken: vi.fn(async () => {}),
  getAllTokenStatuses: vi.fn(async () => []),
  isTokenExpired: vi.fn(async () => false),
}));

vi.mock("../../lib/media-storage.js", () => ({
  getRenderedClipsForClip: vi.fn(async (clipId: string) => [
    {
      id: `rendered-${clipId}`,
      format: "9:16",
      blobUrl: "https://r2.example.com/video.mp4",
      sizeBytes: 1000,
      renderedAt: new Date().toISOString(),
    },
  ]),
}));

vi.mock("../../lib/instagram-upload.js", () => ({
  createMediaContainer: vi.fn(async () => "container123"),
  getContainerStatus: vi.fn(async () => ({ statusCode: "FINISHED" })),
  publishContainer: vi.fn(async () => "media123"),
}));

vi.mock("../../lib/youtube-upload.js", () => ({
  initializeResumableUpload: vi.fn(async () => "https://upload.example.com"),
  streamToYouTube: vi.fn(async () => "video123"),
  getUploadResumePosition: vi.fn(async () => 0),
  checkProcessingStatus: vi.fn(async () => ({ status: "processed", progress: 100 })),
}));

vi.mock("../../lib/tiktok-upload.js", () => ({
  queryCreatorInfo: vi.fn(async () => ({ privacyLevels: ["PUBLIC_TO_EVERYONE"] })),
  initDirectPost: vi.fn(async () => ({ publishId: "publish123" })),
  fetchPublishStatus: vi.fn(async () => ({ status: "PUBLISH_COMPLETE", videoId: "video123" })),
}));

vi.mock("../../lib/x-upload.js", () => ({
  initMediaUpload: vi.fn(async () => ({ mediaId: "media123" })),
  streamToX: vi.fn(async () => {}),
  finalizeMediaUpload: vi.fn(async () => ({ processingInfo: { state: "succeeded" } })),
  getMediaStatus: vi.fn(async () => ({ state: "succeeded" })),
  createTweet: vi.fn(async () => ({ tweetId: "tweet123" })),
}));

describe("Publish upload routes", () => {
  let app: express.Express;
  let dbModule: any;

  beforeEach(async () => {
    process.env.ACCESS_CODE = "test-access-code";
    process.env.X_CONSUMER_KEY = "x-key";
    process.env.X_CONSUMER_SECRET = "x-secret";

    dbModule = await import("../../db/index.js");
    dbModule.db._test.reset();

    app = express();
    app.use(express.json());
    app.use("/api", authMiddleware);
    app.use("/api", youtubeUploadRouter);
    app.use("/api", instagramUploadRouter);
    app.use("/api", tiktokUploadRouter);
    app.use("/api", xUploadRouter);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: any, init?: any) => {
        if (init?.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              "content-length": "1000",
            },
          });
        }
        return new Response("", { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const addRenderedClip = (clipId: string) => {
    dbModule.db._test.tables.rendered_clips_v2.push({
      id: crypto.randomUUID(),
      clipId,
      format: "9:16",
      blobUrl: "https://r2.example.com/video.mp4",
      sizeBytes: 1000,
      renderedAt: new Date(),
    });
  };

  const waitForCompletion = async (path: string) => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get(path).set("x-access-code", "test-access-code");
      if (res.body.status === "completed") return res;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return request(app).get(path).set("x-access-code", "test-access-code");
  };

  it("publishes Instagram upload", async () => {
    addRenderedClip("clip-ig");

    const initRes = await request(app)
      .post("/api/instagram/upload/init")
      .set("x-access-code", "test-access-code")
      .send({
        postId: "post-ig",
        clipId: "clip-ig",
        caption: "hello instagram",
        format: "9:16",
        mediaType: "REELS",
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.uploadId).toBeDefined();

    const statusRes = await waitForCompletion(
      `/api/instagram/upload/${initRes.body.uploadId}/status`
    );
    expect(statusRes.body.status).toBe("completed");
  });

  it("publishes YouTube upload", async () => {
    addRenderedClip("clip-yt");

    const initRes = await request(app)
      .post("/api/youtube/upload/init")
      .set("x-access-code", "test-access-code")
      .send({
        postId: "post-yt",
        clipId: "clip-yt",
        title: "hello youtube",
        description: "desc",
        tags: ["podcast"],
        privacyStatus: "public",
        isShort: true,
        format: "9:16",
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.uploadId).toBeDefined();

    const statusRes = await waitForCompletion(
      `/api/youtube/upload/${initRes.body.uploadId}/status`
    );
    expect(statusRes.body.status).toBe("completed");
  });

  it("publishes TikTok upload", async () => {
    addRenderedClip("clip-tt");

    const initRes = await request(app)
      .post("/api/tiktok/upload/init")
      .set("x-access-code", "test-access-code")
      .send({
        postId: "post-tt",
        clipId: "clip-tt",
        caption: "hello tiktok",
        format: "9:16",
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.uploadId).toBeDefined();

    const statusRes = await waitForCompletion(`/api/tiktok/upload/${initRes.body.uploadId}/status`);
    expect(statusRes.body.status).toBe("completed");
  });

  it("publishes X upload", async () => {
    addRenderedClip("clip-x");

    const initRes = await request(app)
      .post("/api/x/upload/init")
      .set("x-access-code", "test-access-code")
      .send({
        postId: "post-x",
        clipId: "clip-x",
        text: "hello x",
        format: "9:16",
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.uploadId).toBeDefined();

    const statusRes = await waitForCompletion(`/api/x/upload/${initRes.body.uploadId}/status`);
    expect(statusRes.body.status).toBe("completed");
  });
});
