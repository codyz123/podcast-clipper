/**
 * File security validation utilities
 * 
 * This module provides comprehensive file validation to prevent:
 * - Malicious file uploads
 * - Path traversal attacks
 * - MIME type confusion
 * - Oversized uploads
 */

import { basename, extname } from 'path';

/**
 * Allowed MIME types for different file categories
 */
export const ALLOWED_MIME_TYPES = {
  audio: [
    'audio/mpeg',          // MP3
    'audio/wav',           // WAV
    'audio/x-wav',         // WAV (alternative)
    'audio/wave',          // WAV (alternative)
    'audio/mp4',           // M4A
    'audio/aac',           // AAC
    'audio/flac',          // FLAC
    'audio/ogg',           // OGG
    'audio/webm',          // WebM Audio
    'audio/x-aiff',        // AIFF
    'audio/aiff',          // AIFF (alternative)
  ],
  video: [
    'video/mp4',           // MP4
    'video/webm',          // WebM
    'video/ogg',           // OGV
    'video/avi',           // AVI
    'video/quicktime',     // MOV
    'video/x-msvideo',     // AVI (alternative)
  ],
  image: [
    'image/jpeg',          // JPEG
    'image/png',           // PNG
    'image/gif',           // GIF
    'image/webp',          // WebP
    'image/svg+xml',       // SVG
  ]
} as const;

/**
 * File extension to MIME type mapping
 */
const EXTENSION_TO_MIME: Record<string, string[]> = {
  // Audio
  '.mp3': ['audio/mpeg'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave'],
  '.m4a': ['audio/mp4', 'audio/aac'],
  '.aac': ['audio/aac', 'audio/mp4'],
  '.flac': ['audio/flac'],
  '.ogg': ['audio/ogg'],
  '.webm': ['audio/webm'],
  '.aiff': ['audio/x-aiff', 'audio/aiff'],
  '.aif': ['audio/x-aiff', 'audio/aiff'],
  
  // Video  
  '.mp4': ['video/mp4'],
  '.webm': ['video/webm'],
  '.ogv': ['video/ogg'],
  '.avi': ['video/avi', 'video/x-msvideo'],
  '.mov': ['video/quicktime'],
  
  // Images
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.svg': ['image/svg+xml'],
};

/**
 * Maximum file sizes by category (in bytes)
 */
export const MAX_FILE_SIZES = {
  audio: 10 * 1024 * 1024 * 1024,  // 10GB for audio files
  video: 5 * 1024 * 1024 * 1024,   // 5GB for video files  
  image: 50 * 1024 * 1024,         // 50MB for images
  upload: 50 * 1024 * 1024 * 1024, // 50GB for general uploads
} as const;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
  detectedCategory?: keyof typeof ALLOWED_MIME_TYPES;
}

/**
 * Validate file based on MIME type, extension, and size
 */
export function validateFile(
  filename: string,
  mimetype: string,
  size: number,
  category?: keyof typeof ALLOWED_MIME_TYPES
): FileValidationResult {
  try {
    // Sanitize filename first
    const sanitizedFilename = sanitizeFilename(filename);
    
    // Extract extension
    const ext = extname(sanitizedFilename).toLowerCase();
    
    // Validate filename
    if (!sanitizedFilename || sanitizedFilename === ext) {
      return { valid: false, error: 'Invalid filename' };
    }
    
    // Check for dangerous extensions
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js', 
      '.jar', '.php', '.py', '.rb', '.pl', '.sh', '.asp', '.jsp'
    ];
    
    if (dangerousExtensions.includes(ext)) {
      return { valid: false, error: 'File type not allowed' };
    }
    
    // Detect file category if not provided
    let detectedCategory = category;
    if (!detectedCategory) {
      detectedCategory = detectFileCategory(mimetype, ext);
      if (!detectedCategory) {
        return { valid: false, error: 'Unknown file type' };
      }
    }
    
    // Validate MIME type against category
    const allowedMimes = ALLOWED_MIME_TYPES[detectedCategory];
    if (!allowedMimes.includes(mimetype as any)) {
      return { 
        valid: false, 
        error: `Invalid MIME type '${mimetype}' for ${detectedCategory} file` 
      };
    }
    
    // Validate MIME type matches extension
    if (ext && EXTENSION_TO_MIME[ext] && !EXTENSION_TO_MIME[ext].includes(mimetype)) {
      return { 
        valid: false, 
        error: `MIME type '${mimetype}' doesn't match extension '${ext}'` 
      };
    }
    
    // Validate file size
    const maxSize = MAX_FILE_SIZES[detectedCategory];
    if (size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return { 
        valid: false, 
        error: `File size exceeds ${maxSizeMB}MB limit for ${detectedCategory} files` 
      };
    }
    
    return { 
      valid: true, 
      sanitizedFilename,
      detectedCategory 
    };
    
  } catch (error) {
    return { 
      valid: false, 
      error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return '';
  
  // Get just the base filename (removes any path components)
  let sanitized = basename(filename);
  
  // Remove or replace dangerous characters
  sanitized = sanitized
    // Remove path traversal attempts
    .replace(/\.\./g, '')
    // Replace dangerous characters with underscores
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    // Replace multiple dots with single dot
    .replace(/\.{2,}/g, '.')
    // Remove leading dots and spaces
    .replace(/^[\.\s]+/, '')
    // Remove trailing dots and spaces  
    .replace(/[\.\s]+$/, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = extname(sanitized);
    const nameWithoutExt = sanitized.slice(0, sanitized.length - ext.length);
    sanitized = nameWithoutExt.slice(0, 255 - ext.length) + ext;
  }
  
  return sanitized;
}

/**
 * Create a safe storage path that prevents directory traversal
 */
export function createSafeStoragePath(basePath: string, ...pathSegments: string[]): string {
  // Sanitize each segment
  const sanitizedSegments = pathSegments.map(segment => {
    if (!segment) return '';
    
    // Basic sanitization for path segments
    return segment
      .replace(/\.\./g, '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^[\.\s]+/, '')
      .replace(/[\.\s]+$/, '');
  }).filter(Boolean);
  
  // Join with base path
  return [basePath, ...sanitizedSegments].join('/');
}

/**
 * Detect file category based on MIME type and extension
 */
function detectFileCategory(mimetype: string, extension: string): keyof typeof ALLOWED_MIME_TYPES | null {
  // Check by MIME type first
  for (const [category, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimetype as any)) {
      return category as keyof typeof ALLOWED_MIME_TYPES;
    }
  }
  
  // Check by extension if MIME type is generic or unknown
  if (extension && EXTENSION_TO_MIME[extension]) {
    const possibleMimes = EXTENSION_TO_MIME[extension];
    for (const [category, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
      if (possibleMimes.some(mime => mimes.includes(mime as any))) {
        return category as keyof typeof ALLOWED_MIME_TYPES;
      }
    }
  }
  
  return null;
}

/**
 * Validate content type header to prevent MIME confusion attacks
 */
export function validateContentType(contentType: string): boolean {
  if (!contentType) return false;
  
  // Remove charset and other parameters
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  
  // Check if it's in our allowed list
  return Object.values(ALLOWED_MIME_TYPES).some(mimes => 
    mimes.includes(mimeType as any)
  );
}