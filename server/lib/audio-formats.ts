/**
 * Audio format detection utilities
 */

// Formats directly supported by OpenAI Whisper
export const SUPPORTED_FORMATS = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/flac",
  "audio/ogg",
  "audio/oga",
]);

// Formats that need conversion before sending to Whisper
export const CONVERTIBLE_FORMATS = new Set(["audio/aiff", "audio/x-aiff", "audio/aif"]);

/**
 * Check if a file is in a supported format (can be sent directly to Whisper)
 */
export function isSupported(mimetype: string): boolean {
  return SUPPORTED_FORMATS.has(mimetype);
}

/**
 * Check if a file needs conversion before sending to Whisper
 * Checks MIME type, extension, AND content magic bytes
 */
export function needsConversion(mimetype: string, filename: string, buffer?: Buffer): boolean {
  // Check MIME type
  if (CONVERTIBLE_FORMATS.has(mimetype)) {
    return true;
  }

  // Check file extension for AIFF
  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.endsWith(".aif") || lowerFilename.endsWith(".aiff")) {
    return true;
  }

  // Check magic bytes for AIFF (handles misnamed files)
  if (buffer && isAiffByMagicBytes(buffer)) {
    return true;
  }

  return false;
}

/**
 * Detect AIFF file by magic bytes (file signature)
 * AIFF files start with "FORM" followed by size, then "AIFF" or "AIFC"
 */
export function isAiffByMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }

  // Check for "FORM" header (bytes 0-3)
  const form = buffer.slice(0, 4).toString("ascii");
  if (form !== "FORM") {
    return false;
  }

  // Check for "AIFF" or "AIFC" marker (bytes 8-11)
  const type = buffer.slice(8, 12).toString("ascii");
  return type === "AIFF" || type === "AIFC";
}

/**
 * Check if file is AIFF based on extension
 */
export function isAiffExtension(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return lowerFilename.endsWith(".aif") || lowerFilename.endsWith(".aiff");
}
