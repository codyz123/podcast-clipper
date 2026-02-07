import { VideoFormat, VIDEO_FORMATS, VideoFormatConfig } from "./types";

export function getFormatConfig(format: VideoFormat): VideoFormatConfig {
  return VIDEO_FORMATS[format];
}

export function getAllFormats(): VideoFormatConfig[] {
  return Object.values(VIDEO_FORMATS);
}

export function getFormatsForPlatform(platform: string): VideoFormatConfig[] {
  return getAllFormats().filter((f) =>
    f.useCases.some((useCase) => useCase.toLowerCase().includes(platform.toLowerCase()))
  );
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":");
  if (parts.length === 2) {
    const [mins, secsAndMs] = parts;
    const [secs, ms] = secsAndMs.split(".");
    return parseInt(mins) * 60 + parseInt(secs) + (ms ? parseInt(ms) / 100 : 0);
  }
  return 0;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function generateFilename(
  template: string,
  data: {
    podcast?: string;
    clipNumber?: number;
    format?: VideoFormat;
    date?: Date;
  }
): string {
  const { podcast = "podcast", clipNumber = 1, format = "9:16", date = new Date() } = data;

  return template
    .replace("{podcast}", sanitizeFilename(podcast))
    .replace("{clip#}", clipNumber.toString().padStart(2, "0"))
    .replace("{format}", format.replace(":", "x"))
    .replace("{date}", date.toISOString().split("T")[0]);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}
