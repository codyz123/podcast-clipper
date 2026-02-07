import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";
import { authMiddleware } from "../../middleware/auth.js";
import { renderRouter } from "../../routes/render.js";

type RenderGate = {
  resolve?: () => void;
};

const renderGate: RenderGate = {};

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => {
    const err = new Error("ffprobe not available") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  }),
}));

vi.mock("@remotion/bundler", () => ({
  bundle: vi.fn(async () => "https://remotion.test/bundle"),
}));

vi.mock("@remotion/renderer", () => ({
  selectComposition: vi.fn(async () => ({
    id: "ClipVideo-9-16",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
  })),
  renderMedia: vi.fn(async (options: any) => {
    options.onProgress?.({ progress: 0.4 });
    await new Promise<void>((resolve) => {
      renderGate.resolve = resolve;
    });
    options.onProgress?.({ progress: 1 });
  }),
}));

vi.mock("../../lib/media-storage.js", () => ({
  uploadMediaFromPath: vi.fn(async () => ({
    url: "https://r2.example.com/rendered.mp4",
    size: 123,
  })),
}));

vi.mock("../../db/index.js", () => {
  const tables: Record<string, any[]> = {
    clips_v2: [],
    projects_v2: [],
    rendered_clips_v2: [],
  };

  const getTableName = (table: any): string => {
    // Drizzle stores table name in Symbol('drizzle:Name'), not in _.name
    if (table?._?.name) return table._.name;
    const sym = Object.getOwnPropertySymbols(table).find(
      (s) => s.toString() === "Symbol(drizzle:Name)"
    );
    return sym ? table[sym] : "unknown";
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
        const tableName = getTableName(table);
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
        const tableName = getTableName(table);
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
          const tableName = getTableName(table);
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
    clips: { _: { name: "clips_v2" } },
    projects: { _: { name: "projects_v2" } },
    renderedClips: { _: { name: "rendered_clips_v2" } },
  };
});

describe("Render routes", () => {
  let app: express.Express;
  let dbModule: any;

  beforeEach(async () => {
    process.env.ACCESS_CODE = "test-access-code";

    dbModule = await import("../../db/index.js");
    dbModule.db._test.reset();

    renderGate.resolve = undefined;

    app = express();
    app.use(express.json());
    app.use("/api", authMiddleware);
    app.use("/api", renderRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports render progress and completes", async () => {
    const projectId = "project-1";
    const clipId = "clip-1";

    dbModule.db._test.tables.projects_v2.push({
      id: projectId,
      audioBlobUrl: "https://r2.example.com/audio.mp3",
    });
    dbModule.db._test.tables.clips_v2.push({
      id: clipId,
      projectId,
      startTime: 0,
      endTime: 5,
      words: [],
    });

    const initRes = await request(app)
      .post("/api/render/clip")
      .set("x-access-code", "test-access-code")
      .send({ clipId, format: "9:16" });

    expect(initRes.status).toBe(200);
    expect(initRes.body.jobId).toBeDefined();

    const jobId = initRes.body.jobId as string;

    for (let i = 0; i < 10; i += 1) {
      if (renderGate.resolve) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const midStatus = await request(app)
      .get(`/api/render/clip/${jobId}/status`)
      .set("x-access-code", "test-access-code");

    expect(midStatus.body.status).toBe("rendering");
    expect(midStatus.body.progress).toBe(40);

    renderGate.resolve?.();

    let finalStatus = midStatus;
    for (let i = 0; i < 10; i += 1) {
      finalStatus = await request(app)
        .get(`/api/render/clip/${jobId}/status`)
        .set("x-access-code", "test-access-code");
      if (finalStatus.body.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(finalStatus.body.status).toBe("completed");
    expect(finalStatus.body.progress).toBe(100);
    expect(finalStatus.body.renderedClipUrl).toBe("https://r2.example.com/rendered.mp4");
  });
});
