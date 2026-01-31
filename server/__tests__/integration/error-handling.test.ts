import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import express from "express";
import { transcribeRouter } from "../../routes/transcribe.js";
import { authMiddleware } from "../../middleware/auth.js";
import { mockTranscriptionCreate, mockTranscriptionResponse } from "../setup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "../fixtures/audio");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authMiddleware);
  app.use("/api", transcribeRouter);
  return app;
}

describe("Error Handling", () => {
  let app: express.Application;
  let originalApiKey: string | undefined;

  beforeAll(() => {
    originalApiKey = process.env.OPENAI_API_KEY;
    process.env.ACCESS_CODE = "test-access-code";
  });

  afterAll(() => {
    if (originalApiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  afterEach(() => {
    mockTranscriptionCreate.mockReset();
    mockTranscriptionCreate.mockResolvedValue(mockTranscriptionResponse);
    process.env.OPENAI_API_KEY = "test-api-key";
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-api-key";
    app = createTestApp();
  });

  it("should handle OpenAI rate limiting", async () => {
    // Mock rate limit error
    const rateLimitError = new Error("Rate limit exceeded");
    (rateLimitError as any).status = 429;
    mockTranscriptionCreate.mockRejectedValueOnce(rateLimitError);

    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "test.mp3");

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("Rate limit");
  });

  it("should handle OpenAI server errors", async () => {
    // Mock server error
    const serverError = new Error("Internal server error");
    (serverError as any).status = 500;
    mockTranscriptionCreate.mockRejectedValueOnce(serverError);

    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "test.mp3");

    expect(response.status).toBe(500);
  });

  it("should handle invalid audio format errors", async () => {
    // Mock invalid format error
    const formatError = new Error("Invalid file format");
    (formatError as any).status = 400;
    mockTranscriptionCreate.mockRejectedValueOnce(formatError);

    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "test.mp3");

    expect(response.status).toBe(500);
    expect(response.body.error).toBeDefined();
  });

  it("should handle missing OPENAI_API_KEY", async () => {
    delete process.env.OPENAI_API_KEY;
    app = createTestApp(); // Recreate app without API key

    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "test.mp3");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Server misconfigured");
  });

  it("should provide actionable error messages", async () => {
    // Mock error with message
    const detailedError = new Error("Audio file is corrupted or not a valid audio format");
    mockTranscriptionCreate.mockRejectedValueOnce(detailedError);

    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "test.mp3");

    expect(response.status).toBe(500);
    // Error message should be specific enough to diagnose
    expect(response.body.error).toBeDefined();
    expect(typeof response.body.error).toBe("string");
    expect(response.body.error.length).toBeGreaterThan(0);
  });

  it("should handle concurrent requests", async () => {
    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    // Send multiple requests concurrently
    const promises = Array(3)
      .fill(null)
      .map(() =>
        request(app)
          .post("/api/transcribe")
          .set("X-Access-Code", "test-access-code")
          .attach("file", audioBuffer, "test.mp3")
      );

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });
});
