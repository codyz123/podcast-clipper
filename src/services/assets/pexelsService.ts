/**
 * Pexels API service for searching and fetching stock videos
 * Documentation: https://www.pexels.com/api/documentation/
 */

const PEXELS_API_BASE = "https://api.pexels.com";

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
  user: {
    id: number;
    name: string;
    url: string;
  };
}

export interface PexelsVideoFile {
  id: number;
  quality: "hd" | "sd" | "uhd";
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

export interface PexelsVideoPicture {
  id: number;
  picture: string;
  nr: number;
}

export interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: PexelsVideo[];
  next_page?: string;
  prev_page?: string;
}

export type VideoOrientation = "landscape" | "portrait" | "square";
export type VideoSize = "large" | "medium" | "small";

export interface PexelsSearchOptions {
  query: string;
  orientation?: VideoOrientation;
  size?: VideoSize;
  locale?: string;
  page?: number;
  perPage?: number;
}

/**
 * Search Pexels for stock videos
 */
export async function searchVideos(
  apiKey: string,
  options: PexelsSearchOptions
): Promise<PexelsSearchResponse> {
  const {
    query,
    orientation = "portrait",
    size = "medium",
    locale = "en-US",
    page = 1,
    perPage = 15,
  } = options;

  const params = new URLSearchParams({
    query,
    orientation,
    size,
    locale,
    page: String(page),
    per_page: String(perPage),
  });

  const response = await fetch(`${PEXELS_API_BASE}/videos/search?${params}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid Pexels API key");
    }
    if (response.status === 429) {
      throw new Error("Pexels API rate limit exceeded. Please try again later.");
    }
    throw new Error(`Pexels API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get popular videos from Pexels
 */
export async function getPopularVideos(
  apiKey: string,
  options: { perPage?: number; page?: number } = {}
): Promise<PexelsSearchResponse> {
  const { perPage = 15, page = 1 } = options;

  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });

  const response = await fetch(`${PEXELS_API_BASE}/videos/popular?${params}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid Pexels API key");
    }
    throw new Error(`Pexels API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get a specific video by ID
 */
export async function getVideo(apiKey: string, videoId: number): Promise<PexelsVideo> {
  const response = await fetch(`${PEXELS_API_BASE}/videos/videos/${videoId}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid Pexels API key");
    }
    if (response.status === 404) {
      throw new Error("Video not found");
    }
    throw new Error(`Pexels API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the best video file for a given resolution preference
 * Prefers portrait orientation and HD quality
 */
export function getBestVideoFile(
  video: PexelsVideo,
  preferredQuality: "hd" | "sd" | "uhd" = "hd",
  maxWidth: number = 1080
): PexelsVideoFile | undefined {
  // Sort video files by quality preference
  const sortedFiles = [...video.video_files].sort((a, b) => {
    // Prefer the requested quality
    if (a.quality === preferredQuality && b.quality !== preferredQuality) return -1;
    if (b.quality === preferredQuality && a.quality !== preferredQuality) return 1;

    // Then prefer HD over SD
    if (a.quality === "hd" && b.quality === "sd") return -1;
    if (b.quality === "hd" && a.quality === "sd") return 1;

    // Then prefer smaller files under the max width
    if (a.width <= maxWidth && b.width > maxWidth) return -1;
    if (b.width <= maxWidth && a.width > maxWidth) return 1;

    return 0;
  });

  return sortedFiles[0];
}
