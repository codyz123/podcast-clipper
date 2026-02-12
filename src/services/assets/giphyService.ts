// GIPHY Stickers API Service
// Docs: https://developers.giphy.com/docs/api/endpoint#search

const GIPHY_API_KEY = "dc6zaTOxFJmzC"; // Public beta key for development
const GIPHY_BASE_URL = "https://api.giphy.com/v1/stickers";

export interface GiphySticker {
  id: string;
  title: string;
  url: string; // Page URL
  images: {
    original: { url: string; webp: string; width: string; height: string };
    fixed_height: { url: string; webp: string; width: string; height: string };
    fixed_width: { url: string; webp: string; width: string; height: string };
    preview_gif: { url: string; width: string; height: string };
    downsized_medium: { url: string; width: string; height: string };
  };
}

export interface GiphySearchResult {
  stickers: GiphySticker[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

// Predefined categories for podcast clips
export const GIPHY_CATEGORIES = [
  { id: "subscribe", query: "subscribe button", label: "Subscribe" },
  { id: "like", query: "like button thumbs up", label: "Like" },
  { id: "fire", query: "fire flame lit", label: "Fire" },
  { id: "reactions", query: "reaction emoji", label: "Reactions" },
  { id: "arrows", query: "arrow pointing", label: "Arrows" },
  { id: "celebrate", query: "celebration confetti party", label: "Celebrate" },
  { id: "emoji", query: "emoji face", label: "Emojis" },
  { id: "hearts", query: "heart love", label: "Hearts" },
  { id: "stars", query: "stars sparkle shine", label: "Stars" },
  { id: "explosion", query: "explosion boom pow", label: "Explosion" },
] as const;

export type GiphyCategory = (typeof GIPHY_CATEGORIES)[number]["id"];

// Search for stickers
export async function searchGiphyStickers(
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<GiphySearchResult> {
  try {
    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      q: query,
      limit: limit.toString(),
      offset: offset.toString(),
      rating: "g",
    });

    const response = await fetch(`${GIPHY_BASE_URL}/search?${params}`);
    if (!response.ok) throw new Error("GIPHY API error");

    const data = await response.json();

    return {
      stickers: (data.data as GiphySticker[]).map((item: GiphySticker) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        images: {
          original: item.images.original,
          fixed_height: item.images.fixed_height,
          fixed_width: item.images.fixed_width,
          preview_gif: item.images.preview_gif,
          downsized_medium: item.images.downsized_medium,
        },
      })),
      pagination: data.pagination,
    };
  } catch (error) {
    console.error("Error fetching GIPHY stickers:", error);
    return { stickers: [], pagination: { total_count: 0, count: 0, offset: 0 } };
  }
}

// Get trending stickers
export async function getTrendingGiphyStickers(
  limit: number = 20,
  offset: number = 0
): Promise<GiphySearchResult> {
  try {
    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      limit: limit.toString(),
      offset: offset.toString(),
      rating: "g",
    });

    const response = await fetch(`${GIPHY_BASE_URL}/trending?${params}`);
    if (!response.ok) throw new Error("GIPHY API error");

    const data = await response.json();

    return {
      stickers: (data.data as GiphySticker[]).map((item: GiphySticker) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        images: {
          original: item.images.original,
          fixed_height: item.images.fixed_height,
          fixed_width: item.images.fixed_width,
          preview_gif: item.images.preview_gif,
          downsized_medium: item.images.downsized_medium,
        },
      })),
      pagination: data.pagination,
    };
  } catch (error) {
    console.error("Error fetching trending GIPHY stickers:", error);
    return { stickers: [], pagination: { total_count: 0, count: 0, offset: 0 } };
  }
}

// Get stickers by category
export async function getGiphyStickersByCategory(
  categoryId: GiphyCategory,
  limit: number = 20
): Promise<GiphySticker[]> {
  const category = GIPHY_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return [];

  const result = await searchGiphyStickers(category.query, limit);
  return result.stickers;
}

// Get the best URL for display (prefer WebP for better quality/size)
export function getGiphyStickerUrl(
  sticker: GiphySticker,
  size: "original" | "fixed_height" | "fixed_width" | "preview" = "fixed_height"
): string {
  switch (size) {
    case "original":
      return sticker.images.original.webp || sticker.images.original.url;
    case "fixed_height":
      return sticker.images.fixed_height.webp || sticker.images.fixed_height.url;
    case "fixed_width":
      return sticker.images.fixed_width.webp || sticker.images.fixed_width.url;
    case "preview":
      return sticker.images.preview_gif.url;
    default:
      return sticker.images.fixed_height.webp || sticker.images.fixed_height.url;
  }
}
