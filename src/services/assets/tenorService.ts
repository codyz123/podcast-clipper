// Tenor GIF/Sticker API Service
// Docs: https://developers.google.com/tenor/guides/endpoints

// Note: For production, you should get your own API key from Google Cloud Console
// This is a placeholder - Tenor requires a valid API key
const TENOR_API_KEY = "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ"; // Public test key
const TENOR_BASE_URL = "https://tenor.googleapis.com/v2";

export interface TenorSticker {
  id: string;
  title: string;
  content_description: string;
  url: string; // Page URL
  media_formats: {
    gif?: { url: string; dims: [number, number]; duration: number };
    gifpreview?: { url: string; dims: [number, number] };
    tinygif?: { url: string; dims: [number, number]; duration: number };
    webp?: { url: string; dims: [number, number]; duration: number };
    tinywebp?: { url: string; dims: [number, number]; duration: number };
    mp4?: { url: string; dims: [number, number]; duration: number };
  };
}

export interface TenorSearchResult {
  stickers: TenorSticker[];
  next: string; // Pagination cursor
}

// Predefined categories for podcast clips
export const TENOR_CATEGORIES = [
  { id: "subscribe", query: "subscribe button youtube", label: "Subscribe" },
  { id: "like", query: "like thumbs up", label: "Like" },
  { id: "fire", query: "fire lit flame", label: "Fire" },
  { id: "reactions", query: "reaction face", label: "Reactions" },
  { id: "arrows", query: "arrow point", label: "Arrows" },
  { id: "celebrate", query: "celebrate party confetti", label: "Celebrate" },
  { id: "emoji", query: "emoji animated", label: "Emojis" },
  { id: "hearts", query: "heart love", label: "Hearts" },
  { id: "stars", query: "stars sparkle", label: "Stars" },
  { id: "wow", query: "wow amazing shock", label: "Wow" },
] as const;

export type TenorCategory = (typeof TENOR_CATEGORIES)[number]["id"];

// Search for stickers
export async function searchTenorStickers(
  query: string,
  limit: number = 20,
  pos?: string // Pagination cursor
): Promise<TenorSearchResult> {
  try {
    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      q: query,
      limit: limit.toString(),
      searchfilter: "sticker", // Only return stickers (transparent background)
      media_filter: "gif,tinygif,webp,tinywebp",
      contentfilter: "high", // Family-safe content
    });

    if (pos) {
      params.set("pos", pos);
    }

    const response = await fetch(`${TENOR_BASE_URL}/search?${params}`);
    if (!response.ok) throw new Error("Tenor API error");

    const data = await response.json();

    return {
      stickers: ((data.results || []) as TenorSticker[]).map((item: TenorSticker) => ({
        id: item.id,
        title: item.title || item.content_description,
        content_description: item.content_description,
        url: item.url,
        media_formats: item.media_formats,
      })),
      next: data.next || "",
    };
  } catch (error) {
    console.error("Error fetching Tenor stickers:", error);
    return { stickers: [], next: "" };
  }
}

// Get featured/trending stickers
export async function getFeaturedTenorStickers(
  limit: number = 20,
  pos?: string
): Promise<TenorSearchResult> {
  try {
    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      limit: limit.toString(),
      searchfilter: "sticker",
      media_filter: "gif,tinygif,webp,tinywebp",
      contentfilter: "high",
    });

    if (pos) {
      params.set("pos", pos);
    }

    const response = await fetch(`${TENOR_BASE_URL}/featured?${params}`);
    if (!response.ok) throw new Error("Tenor API error");

    const data = await response.json();

    return {
      stickers: ((data.results || []) as TenorSticker[]).map((item: TenorSticker) => ({
        id: item.id,
        title: item.title || item.content_description,
        content_description: item.content_description,
        url: item.url,
        media_formats: item.media_formats,
      })),
      next: data.next || "",
    };
  } catch (error) {
    console.error("Error fetching featured Tenor stickers:", error);
    return { stickers: [], next: "" };
  }
}

// Get stickers by category
export async function getTenorStickersByCategory(
  categoryId: TenorCategory,
  limit: number = 20
): Promise<TenorSticker[]> {
  const category = TENOR_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return [];

  const result = await searchTenorStickers(category.query, limit);
  return result.stickers;
}

// Get the best URL for display (prefer WebP for better quality/size)
export function getTenorStickerUrl(
  sticker: TenorSticker,
  size: "original" | "tiny" | "preview" = "original"
): string {
  const formats = sticker.media_formats;

  switch (size) {
    case "original":
      return formats.webp?.url || formats.gif?.url || "";
    case "tiny":
      return formats.tinywebp?.url || formats.tinygif?.url || "";
    case "preview":
      return formats.gifpreview?.url || formats.tinygif?.url || "";
    default:
      return formats.webp?.url || formats.gif?.url || "";
  }
}

// Get duration of sticker animation (in seconds)
export function getTenorStickerDuration(sticker: TenorSticker): number {
  const formats = sticker.media_formats;
  // Duration is in milliseconds, convert to seconds
  const durationMs =
    formats.gif?.duration || formats.webp?.duration || formats.tinygif?.duration || 2000;
  return durationMs / 1000;
}
