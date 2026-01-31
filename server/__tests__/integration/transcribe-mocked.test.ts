import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import express from "express";
import { transcribeRouter } from "../../routes/transcribe.js";
import { authMiddleware } from "../../middleware/auth.js";
import "../setup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "../fixtures/audio");

/**
 * Create a fresh Express app for testing
 */
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authMiddleware);
  app.use("/api", transcribeRouter);
  return app;
}

describe("POST /api/transcribe", () => {
  let app: express.Application;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.ACCESS_CODE = "test-access-code";
  });

  beforeEach(() => {
    app = createTestApp();
  });

  describe("Format Support", () => {
    it.each([
      ["short-5s.mp3", "audio/mpeg"],
      ["short-5s.wav", "audio/wav"],
      ["short-5s.m4a", "audio/mp4"],
      ["short-5s.ogg", "audio/ogg"],
      ["short-5s.flac", "audio/flac"],
      ["short-5s.webm", "audio/webm"],
    ])("should transcribe %s successfully", async (filename, mimeType) => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, filename));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, { filename, contentType: mimeType });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("text");
      expect(response.body).toHaveProperty("words");
      expect(Array.isArray(response.body.words)).toBe(true);
    });

    it("should convert and transcribe AIFF files", async () => {
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
      expect(response.body).toHaveProperty("words");
      expect(Array.isArray(response.body.words)).toBe(true);
    });

    it("should detect AIFF by extension even with unknown MIME type", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.aiff"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, {
          filename: "recording.aif",
          contentType: "application/octet-stream",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("text");
    });
  });

  describe("File Durations", () => {
    it("should handle short 5-second files", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, "short.mp3");

      expect(response.status).toBe(200);
    });

    it("should handle medium 30-second files", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "medium-30s.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, "medium.mp3");

      expect(response.status).toBe(200);
    });

    it("should handle long 2-minute files", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "long-2min.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, "long.mp3");

      expect(response.status).toBe(200);
    }, 15000); // Extended timeout

    it("should handle medium AIFF files (with conversion)", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "medium-30s.aiff"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, {
          filename: "medium.aiff",
          contentType: "audio/aiff",
        });

      expect(response.status).toBe(200);
    }, 15000);

    it("should handle long AIFF files (with conversion)", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "long-2min.aiff"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, {
          filename: "long.aiff",
          contentType: "audio/aiff",
        });

      expect(response.status).toBe(200);
    }, 30000);
  });

  describe("Authentication", () => {
    it("should reject requests without access code", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .attach("file", audioBuffer, "test.mp3");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Access code required");
    });

    it("should reject requests with invalid access code", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "wrong-code")
        .attach("file", audioBuffer, "test.mp3");

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Invalid access code");
    });
  });

  describe("Input Validation", () => {
    it("should reject requests without file", async () => {
      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No audio file provided");
    });
  });

  describe("Response Format", () => {
    it("should return transcript with word-level timestamps", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, "test.mp3");

      expect(response.status).toBe(200);
      expect(response.body.words).toBeDefined();
      expect(response.body.words.length).toBeGreaterThan(0);

      // Check word structure
      const firstWord = response.body.words[0];
      expect(firstWord).toHaveProperty("word");
      expect(firstWord).toHaveProperty("start");
      expect(firstWord).toHaveProperty("end");
      expect(typeof firstWord.start).toBe("number");
      expect(typeof firstWord.end).toBe("number");
    });

    it("should return language detection", async () => {
      const audioBuffer = await readFile(join(FIXTURES_PATH, "short-5s.mp3"));

      const response = await request(app)
        .post("/api/transcribe")
        .set("X-Access-Code", "test-access-code")
        .attach("file", audioBuffer, "test.mp3");

      expect(response.status).toBe(200);
      expect(response.body.language).toBe("en");
    });
  });
});
