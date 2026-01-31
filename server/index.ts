import express, { ErrorRequestHandler } from "express";
import cors from "cors";
import multer from "multer";
import { transcribeRouter } from "./routes/transcribe.js";
import { analyzeClipsRouter } from "./routes/analyze-clips.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased for large transcripts

// Health check (no auth required)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Protected routes
app.use("/api", authMiddleware);
app.use("/api", transcribeRouter);
app.use("/api", analyzeClipsRouter);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
