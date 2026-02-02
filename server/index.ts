import express, { ErrorRequestHandler } from "express";
import cors from "cors";
import multer from "multer";
import { transcribeRouter } from "./routes/transcribe.js";
import { analyzeClipsRouter } from "./routes/analyze-clips.js";
import { oauthRouter } from "./routes/oauth.js";
import { projectsRouter } from "./routes/projects.js";
import { authRouter } from "./routes/auth.js";
import { podcastsRouter } from "./routes/podcasts.js";
import { episodesRouter } from "./routes/episodes.js";
import { textSnippetsRouter } from "./routes/text-snippets.js";
import { generateSnippetRouter } from "./routes/generate-snippet.js";
import { authMiddleware } from "./middleware/auth.js";
import { initializeDatabase } from "./lib/token-storage.js";
import { initializeMediaTables } from "./lib/media-storage.js";
import { validateEnv } from "./utils/validateEnv.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased for large transcripts

// Health check (no auth required)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

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

// Text snippets routes - scoped to podcast (JWT auth handled internally)
app.use("/api/podcasts", textSnippetsRouter);

// Protected routes (legacy - uses access code or JWT)
app.use("/api", authMiddleware);
app.use("/api", transcribeRouter);
app.use("/api", analyzeClipsRouter);
app.use("/api", projectsRouter);

// AI snippet generation (JWT auth handled internally)
app.use("/api", generateSnippetRouter);

// Error handler for multer and other errors - returns JSON instead of HTML
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("Server error:", err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: "File too large. Maximum size is 50MB. Try a shorter audio clip.",
      });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  if (err.message?.includes("File too large")) {
    res.status(413).json({
      error: "File too large. Maximum size is 50MB. Try a shorter audio clip.",
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
