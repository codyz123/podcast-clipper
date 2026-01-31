import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import express from "express";
import { transcribeRouter } from "../../routes/transcribe.js";
import { authMiddleware } from "../../middleware/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "../fixtures/audio");

/**
 * Skip if OPENAI_API_KEY is not a real key (starts with sk-) or if in CI without credits
 */
const hasRealApiKey =
  process.env.OPENAI_API_KEY?.startsWith("sk-") && process.env.OPENAI_API_KEY !== "test-api-key";
const SKIP_REAL_API = !hasRealApiKey || process.env.SKIP_REAL_API_TESTS === "true";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authMiddleware);
  app.use("/api", transcribeRouter);
  return app;
}

describe.skipIf(SKIP_REAL_API)("Real OpenAI API Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    process.env.ACCESS_CODE = "test-access-code";
    app = createTestApp();
  });

  it("should transcribe MP3 audio with real API", async () => {
    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "speech.mp3");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("text");
    expect(response.body).toHaveProperty("words");
    expect(Array.isArray(response.body.words)).toBe(true);

    // Verify word-level timestamps are present
    if (response.body.words.length > 0) {
      expect(response.body.words[0]).toHaveProperty("word");
      expect(response.body.words[0]).toHaveProperty("start");
      expect(response.body.words[0]).toHaveProperty("end");
    }

    console.log("Real API transcription result:", {
      text: response.body.text,
      wordCount: response.body.words?.length,
      language: response.body.language,
    });
  }, 60000); // 60s timeout for real API

  it("should handle AIFF conversion with real API", async () => {
    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.aiff"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, {
        filename: "test.aiff",
        contentType: "audio/aiff",
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("text");

    console.log("Real API AIFF transcription result:", {
      text: response.body.text,
      wordCount: response.body.words?.length,
    });
  }, 60000);

  it("should transcribe WAV audio with real API", async () => {
    const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.wav"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "audio.wav");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("text");
  }, 60000);

  it("should transcribe medium-length audio with real API", async () => {
    const audioBuffer = await readFile(join(FIXTURES_PATH, "medium-30s.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "medium.mp3");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("text");

    console.log("Real API 30s transcription result:", {
      textLength: response.body.text?.length,
      wordCount: response.body.words?.length,
    });
  }, 120000); // 2 minute timeout for medium files

  it("should transcribe long audio with real API", async () => {
    const audioBuffer = await readFile(join(FIXTURES_PATH, "long-2min.mp3"));

    const response = await request(app)
      .post("/api/transcribe")
      .set("X-Access-Code", "test-access-code")
      .attach("file", audioBuffer, "long.mp3");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("text");

    console.log("Real API 2min transcription result:", {
      textLength: response.body.text?.length,
      wordCount: response.body.words?.length,
    });
  }, 300000); // 5 minute timeout for long files
});
