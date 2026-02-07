import express, { ErrorRequestHandler } from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { transcribeRouter } from "./routes/transcribe.js";
import { analyzeClipsRouter } from "./routes/analyze-clips.js";
import { oauthRouter } from "./routes/oauth.js";
import { projectsRouter } from "./routes/projects.js";
import { authRouter } from "./routes/auth.js";
import { podcastsRouter } from "./routes/podcasts.js";
import { episodesRouter } from "./routes/episodes.js";
import { podcastPeopleRouter } from "./routes/podcast-people.js";
import { textSnippetsRouter } from "./routes/text-snippets.js";
import { generateSnippetRouter } from "./routes/generate-snippet.js";
import { uploadsRouter } from "./routes/uploads.js";
import { youtubeUploadRouter } from "./routes/youtube-upload.js";
import { instagramUploadRouter } from "./routes/instagram-upload.js";
import { tiktokUploadRouter } from "./routes/tiktok-upload.js";
import { xUploadRouter } from "./routes/x-upload.js";
import { renderRouter } from "./routes/render.js";
import { uploadEventsRouter } from "./routes/upload-events.js";
import { authMiddleware } from "./middleware/auth.js";
import { initializeDatabase } from "./lib/token-storage.js";
import { initializeMediaTables } from "./lib/media-storage.js";
import { validateEnv } from "./utils/validateEnv.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());

// Raw body parser for multipart chunk uploads (must come BEFORE express.json)
// Matches: /api/podcasts/:podcastId/episodes/:episodeId/uploads/:sessionId/part/:partNumber
app.use(
  /^\/api\/podcasts\/[^/]+\/episodes\/[^/]+\/uploads\/[^/]+\/part\/\d+$/,
  express.raw({
    type: "application/octet-stream",
    limit: "100mb", // Max chunk size
  })
);

app.use(express.json({ limit: "10mb" })); // Increased for large transcripts

// Health check (no auth required)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Serve locally stored media (dev fallback when R2 is not configured)
app.use("/api/local-media", express.static(path.join(process.cwd(), ".context", "local-media")));

// Auth routes - handles registration, login, logout
// Rate limiting is applied per-route in the auth router
app.use("/api/auth", authRouter);

// OAuth routes - mounted without global auth, handles auth internally
// The callback route must be accessible without auth (Google redirects here)
app.use("/api/oauth", oauthRouter);

// Podcast management routes (JWT auth handled internally)
app.use("/api/podcasts", podcastsRouter);

// Episodes routes - scoped to podcast (JWT auth handled internally)
app.use("/api/podcasts", episodesRouter);

// Podcast people routes - recurring hosts & guests (JWT auth handled internally)
app.use("/api/podcasts", podcastPeopleRouter);

// Multipart upload routes for large files (JWT auth handled internally)
app.use("/api/podcasts", uploadsRouter);

// Text snippets routes - scoped to podcast (JWT auth handled internally)
app.use("/api/podcasts", textSnippetsRouter);

// Protected routes (legacy - uses access code or JWT)
app.use("/api", authMiddleware);
app.use("/api", transcribeRouter);
app.use("/api", analyzeClipsRouter);
app.use("/api", projectsRouter);
app.use("/api", youtubeUploadRouter);
app.use("/api", instagramUploadRouter);
app.use("/api", tiktokUploadRouter);
app.use("/api", xUploadRouter);
app.use("/api", renderRouter);
app.use("/api", uploadEventsRouter);

// AI snippet generation (JWT auth handled internally)
app.use("/api", generateSnippetRouter);

// Error handler for multer and other errors - returns JSON instead of HTML
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("Server error:", err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: "File too large. Maximum size is 5GB. Try a shorter audio clip.",
      });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  if (err.message?.includes("File too large")) {
    res.status(413).json({
      error: "File too large. Maximum size is 5GB. Try a shorter audio clip.",
    });
    return;
  }

  res.status(500).json({ error: err.message || "Internal server error" });
};

app.use(errorHandler);

// Initialize database and start server
async function start() {
  // Validate environment variables first - fail fast with clear instructions
  validateEnv();

  try {
    await initializeDatabase();
    await initializeMediaTables();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }
}

start();
