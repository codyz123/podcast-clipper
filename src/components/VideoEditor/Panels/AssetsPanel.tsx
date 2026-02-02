import React, { useState, useCallback, useEffect } from "react";
import Lottie from "lottie-react";
import {
  MagnifyingGlassIcon,
  VideoIcon,
  SpeakerLoudIcon,
  MagicWandIcon,
  Cross2Icon,
  ReloadIcon,
  GearIcon,
  ChevronLeftIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../../lib/utils";
import { useSettingsStore } from "../../../stores/settingsStore";
import {
  searchVideos,
  getBestVideoFile,
  PexelsVideo,
} from "../../../services/assets/pexelsService";
import {
  LOTTIE_LIBRARY,
  LottieAnimation,
  LottieCategory,
  getCategories,
  getAnimationsByCategory,
  searchAnimations,
  fetchLottieData,
} from "../../../services/assets/lottieService";
import {
  searchGiphyStickers,
  GiphySticker,
  GIPHY_CATEGORIES,
  GiphyCategory,
  getGiphyStickersByCategory,
  getGiphyStickerUrl,
} from "../../../services/assets/giphyService";
import {
  searchTenorStickers,
  TenorSticker,
  TENOR_CATEGORIES,
  TenorCategory,
  getTenorStickersByCategory,
  getTenorStickerUrl,
  getTenorStickerDuration,
} from "../../../services/assets/tenorService";

type AssetTab = "b-roll" | "music" | "animations";
type AnimationSource = "giphy" | "tenor" | "lottie";

interface AssetsPanelProps {
  onAddBRoll?: (videoUrl: string, duration: number) => void;
  onAddMusic?: (audioUrl: string, name: string) => void;
  onAddAnimation?: (
    animationUrl: string,
    name: string,
    duration: number,
    source: "lottie" | "giphy" | "tenor"
  ) => void;
}

// Lottie preview component with lazy loading
const LottiePreview: React.FC<{
  animation: LottieAnimation;
  onClick: () => void;
}> = ({ animation, onClick }) => {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAnimation = async () => {
      setIsLoading(true);
      setError(false);
      const data = await fetchLottieData(animation.url);
      if (mounted) {
        if (data) {
          setAnimationData(data);
        } else {
          setError(true);
        }
        setIsLoading(false);
      }
    };

    loadAnimation();
    return () => {
      mounted = false;
    };
  }, [animation.url]);

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] transition-all hover:border-[hsl(var(--cyan))] hover:shadow-lg"
      onClick={onClick}
    >
      <div className="flex aspect-square items-center justify-center p-2">
        {isLoading ? (
          <ReloadIcon className="h-5 w-5 animate-spin text-[hsl(var(--text-ghost))]" />
        ) : error ? (
          <MagicWandIcon className="h-5 w-5 text-[hsl(var(--text-ghost))]" />
        ) : animationData ? (
          <Lottie
            animationData={animationData}
            loop={true}
            autoplay={true}
            className="h-full w-full"
          />
        ) : null}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="text-[10px] font-medium text-white">+ Add</span>
      </div>
      <div className="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface))] px-2 py-1.5">
        <p className="truncate text-[10px] font-medium text-[hsl(var(--text))]">{animation.name}</p>
      </div>
    </div>
  );
};

// GIPHY sticker preview component
const GiphyPreview: React.FC<{
  sticker: GiphySticker;
  onClick: () => void;
}> = ({ sticker, onClick }) => {
  const previewUrl = getGiphyStickerUrl(sticker, "fixed_height");

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] transition-all hover:border-[hsl(var(--magenta))] hover:shadow-lg"
      onClick={onClick}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-[hsl(var(--surface))]">
        <img
          src={previewUrl}
          alt={sticker.title}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="text-[10px] font-medium text-white">+ Add</span>
      </div>
      <div className="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface))] px-2 py-1.5">
        <p className="truncate text-[10px] font-medium text-[hsl(var(--text))]">
          {sticker.title || "Sticker"}
        </p>
      </div>
    </div>
  );
};

// Tenor sticker preview component
const TenorPreview: React.FC<{
  sticker: TenorSticker;
  onClick: () => void;
}> = ({ sticker, onClick }) => {
  const previewUrl = getTenorStickerUrl(sticker, "tiny");

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] transition-all hover:border-[hsl(var(--success))] hover:shadow-lg"
      onClick={onClick}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-[hsl(var(--surface))]">
        <img
          src={previewUrl}
          alt={sticker.title}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="text-[10px] font-medium text-white">+ Add</span>
      </div>
      <div className="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface))] px-2 py-1.5">
        <p className="truncate text-[10px] font-medium text-[hsl(var(--text))]">
          {sticker.title || "Sticker"}
        </p>
      </div>
    </div>
  );
};

export const AssetsPanel: React.FC<AssetsPanelProps> = ({
  onAddBRoll,
  onAddMusic: _onAddMusic,
  onAddAnimation,
}) => {
  const { settings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<AssetTab>("b-roll");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PexelsVideo[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Animation source tabs
  const [animationSource, setAnimationSource] = useState<AnimationSource>("giphy");

  // Lottie state
  const [lottieSearchQuery, setLottieSearchQuery] = useState("");
  const [selectedLottieCategory, setSelectedLottieCategory] = useState<LottieCategory | null>(null);
  const [filteredLottieAnimations, setFilteredLottieAnimations] =
    useState<LottieAnimation[]>(LOTTIE_LIBRARY);

  // GIPHY state
  const [giphySearchQuery, setGiphySearchQuery] = useState("");
  const [selectedGiphyCategory, setSelectedGiphyCategory] = useState<GiphyCategory | null>(null);
  const [giphyStickers, setGiphyStickers] = useState<GiphySticker[]>([]);
  const [isLoadingGiphy, setIsLoadingGiphy] = useState(false);

  // Tenor state
  const [tenorSearchQuery, setTenorSearchQuery] = useState("");
  const [selectedTenorCategory, setSelectedTenorCategory] = useState<TenorCategory | null>(null);
  const [tenorStickers, setTenorStickers] = useState<TenorSticker[]>([]);
  const [isLoadingTenor, setIsLoadingTenor] = useState(false);

  const hasPexelsKey = Boolean(settings.pexelsApiKey);
  const lottieCategories = getCategories();

  // Filter Lottie animations based on search or category
  useEffect(() => {
    if (lottieSearchQuery.trim()) {
      setFilteredLottieAnimations(searchAnimations(lottieSearchQuery));
      setSelectedLottieCategory(null);
    } else if (selectedLottieCategory) {
      setFilteredLottieAnimations(getAnimationsByCategory(selectedLottieCategory));
    } else {
      setFilteredLottieAnimations(LOTTIE_LIBRARY);
    }
  }, [lottieSearchQuery, selectedLottieCategory]);

  // Load GIPHY stickers based on search or category
  useEffect(() => {
    if (animationSource !== "giphy") return;

    const loadGiphyStickers = async () => {
      setIsLoadingGiphy(true);
      try {
        if (giphySearchQuery.trim()) {
          const result = await searchGiphyStickers(giphySearchQuery, 20);
          setGiphyStickers(result.stickers);
          setSelectedGiphyCategory(null);
        } else if (selectedGiphyCategory) {
          const stickers = await getGiphyStickersByCategory(selectedGiphyCategory, 20);
          setGiphyStickers(stickers);
        } else {
          // Load default "trending" or first category
          const stickers = await getGiphyStickersByCategory("reactions", 20);
          setGiphyStickers(stickers);
        }
      } catch (error) {
        console.error("Error loading GIPHY stickers:", error);
        setGiphyStickers([]);
      } finally {
        setIsLoadingGiphy(false);
      }
    };

    const debounce = setTimeout(loadGiphyStickers, 300);
    return () => clearTimeout(debounce);
  }, [animationSource, giphySearchQuery, selectedGiphyCategory]);

  // Load Tenor stickers based on search or category
  useEffect(() => {
    if (animationSource !== "tenor") return;

    const loadTenorStickers = async () => {
      setIsLoadingTenor(true);
      try {
        if (tenorSearchQuery.trim()) {
          const result = await searchTenorStickers(tenorSearchQuery, 20);
          setTenorStickers(result.stickers);
          setSelectedTenorCategory(null);
        } else if (selectedTenorCategory) {
          const stickers = await getTenorStickersByCategory(selectedTenorCategory, 20);
          setTenorStickers(stickers);
        } else {
          // Load default category
          const stickers = await getTenorStickersByCategory("reactions", 20);
          setTenorStickers(stickers);
        }
      } catch (error) {
        console.error("Error loading Tenor stickers:", error);
        setTenorStickers([]);
      } finally {
        setIsLoadingTenor(false);
      }
    };

    const debounce = setTimeout(loadTenorStickers, 300);
    return () => clearTimeout(debounce);
  }, [animationSource, tenorSearchQuery, selectedTenorCategory]);

  // Search Pexels for B-roll videos
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    if (!settings.pexelsApiKey) {
      setSearchError("Pexels API key not configured. Add it in Settings.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const response = await searchVideos(settings.pexelsApiKey, {
        query: searchQuery,
        orientation: "portrait",
        perPage: 12,
      });

      setSearchResults(response.videos || []);
    } catch (error) {
      console.error("Pexels search error:", error);
      setSearchError(error instanceof Error ? error.message : "Failed to search for videos");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, settings.pexelsApiKey]);

  // Handle adding B-roll to timeline
  const handleAddBRoll = useCallback(
    (video: PexelsVideo) => {
      const videoFile = getBestVideoFile(video, "hd", 1080);

      if (videoFile && onAddBRoll) {
        onAddBRoll(videoFile.link, video.duration);
      }
    },
    [onAddBRoll]
  );

  // Handle adding Lottie animation
  const handleAddLottie = useCallback(
    (animation: LottieAnimation) => {
      if (onAddAnimation) {
        onAddAnimation(animation.url, animation.name, animation.duration || 2, "lottie");
      }
    },
    [onAddAnimation]
  );

  // Handle adding GIPHY sticker
  const handleAddGiphy = useCallback(
    (sticker: GiphySticker) => {
      if (onAddAnimation) {
        const url = getGiphyStickerUrl(sticker, "original");
        onAddAnimation(url, sticker.title || "Sticker", 3, "giphy");
      }
    },
    [onAddAnimation]
  );

  // Handle adding Tenor sticker
  const handleAddTenor = useCallback(
    (sticker: TenorSticker) => {
      if (onAddAnimation) {
        const url = getTenorStickerUrl(sticker, "original");
        const duration = getTenorStickerDuration(sticker);
        onAddAnimation(url, sticker.title || "Sticker", duration, "tenor");
      }
    },
    [onAddAnimation]
  );

  const tabs = [
    { id: "b-roll" as const, label: "Video", icon: VideoIcon },
    { id: "music" as const, label: "Music", icon: SpeakerLoudIcon },
    { id: "animations" as const, label: "Graphics", icon: MagicWandIcon },
  ];

  const animationSources: { id: AnimationSource; label: string; color: string }[] = [
    { id: "giphy", label: "GIPHY", color: "hsl(var(--magenta))" },
    { id: "tenor", label: "Tenor", color: "hsl(var(--success))" },
    { id: "lottie", label: "Lottie", color: "hsl(var(--cyan))" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-[hsl(var(--border-subtle))]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-[hsl(var(--cyan))] text-[hsl(var(--cyan))]"
                  : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
              )}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "b-roll" && (
          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search Pexels..."
                className="h-8 w-full rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] pr-8 pl-8 text-xs text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))] focus:border-[hsl(var(--cyan))] focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setSearchError(null);
                  }}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                >
                  <Cross2Icon className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className={cn(
                "flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors",
                isSearching || !searchQuery.trim()
                  ? "cursor-not-allowed bg-[hsl(var(--surface))] text-[hsl(var(--text-ghost))]"
                  : "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))] hover:bg-[hsl(var(--cyan)/0.9)]"
              )}
            >
              {isSearching ? (
                <>
                  <ReloadIcon className="h-3 w-3 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <MagnifyingGlassIcon className="h-3 w-3" />
                  Search B-Roll
                </>
              )}
            </button>

            {/* Error message */}
            {searchError && (
              <div className="rounded-md bg-[hsl(var(--error)/0.1)] p-2 text-xs text-[hsl(var(--error))]">
                {searchError}
              </div>
            )}

            {/* Search results grid */}
            {searchResults.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map((video) => (
                  <div
                    key={video.id}
                    className="group relative cursor-pointer overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] transition-all hover:border-[hsl(var(--cyan))]"
                    onClick={() => handleAddBRoll(video)}
                  >
                    <img
                      src={video.image}
                      alt="B-roll preview"
                      className="aspect-video w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="text-[10px] font-medium text-white">+ Add to timeline</span>
                    </div>
                    <div className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                      {video.duration}s
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isSearching && searchResults.length === 0 && !searchError && (
              <div className="rounded-lg border border-dashed border-[hsl(var(--border-subtle))] p-4 text-center">
                {hasPexelsKey ? (
                  <>
                    <VideoIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      Search for stock videos on Pexels
                    </p>
                    <p className="mt-1 text-[10px] text-[hsl(var(--text-ghost))]">
                      Free to use, no attribution required
                    </p>
                  </>
                ) : (
                  <>
                    <GearIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
                    <p className="text-xs text-[hsl(var(--text-muted))]">Pexels API key required</p>
                    <p className="mt-1 text-[10px] text-[hsl(var(--text-ghost))]">
                      Add your key in Settings to search B-roll
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "music" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-dashed border-[hsl(var(--border-subtle))] p-4 text-center">
              <SpeakerLoudIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
              <p className="text-xs text-[hsl(var(--text-muted))]">Music library coming soon</p>
              <p className="mt-1 text-[10px] text-[hsl(var(--text-ghost))]">
                Royalty-free background music
              </p>
            </div>

            {/* Preview music tracks (placeholder) */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                Suggested
              </h4>
              {[
                { name: "Upbeat Corporate", duration: "2:30", mood: "Energetic" },
                { name: "Calm Ambient", duration: "3:15", mood: "Relaxed" },
                { name: "Inspiring Piano", duration: "2:45", mood: "Emotional" },
              ].map((track) => (
                <div
                  key={track.name}
                  className="flex cursor-not-allowed items-center gap-2 rounded-md border border-[hsl(var(--border-subtle))] p-2 opacity-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-[hsl(var(--magenta)/0.2)]">
                    <SpeakerLoudIcon className="h-3 w-3 text-[hsl(var(--magenta))]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-[hsl(var(--text))]">{track.name}</p>
                    <p className="text-[10px] text-[hsl(var(--text-muted))]">
                      {track.mood} • {track.duration}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "animations" && (
          <div className="space-y-3">
            {/* Animation source tabs */}
            <div className="flex gap-1 rounded-lg bg-[hsl(var(--surface))] p-1">
              {animationSources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => setAnimationSource(source.id)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors",
                    animationSource === source.id
                      ? "bg-[hsl(var(--bg-elevated))] shadow-sm"
                      : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                  )}
                  style={animationSource === source.id ? { color: source.color } : undefined}
                >
                  {source.label}
                </button>
              ))}
            </div>

            {/* GIPHY Content */}
            {animationSource === "giphy" && (
              <>
                {/* Search input */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                  <input
                    type="text"
                    value={giphySearchQuery}
                    onChange={(e) => setGiphySearchQuery(e.target.value)}
                    placeholder="Search GIPHY stickers..."
                    className="h-8 w-full rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] pr-8 pl-8 text-xs text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))] focus:border-[hsl(var(--magenta))] focus:outline-none"
                  />
                  {giphySearchQuery && (
                    <button
                      onClick={() => setGiphySearchQuery("")}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                    >
                      <Cross2Icon className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Category pills or back button */}
                {selectedGiphyCategory && !giphySearchQuery ? (
                  <button
                    onClick={() => setSelectedGiphyCategory(null)}
                    className="flex items-center gap-1 text-xs text-[hsl(var(--magenta))] hover:underline"
                  >
                    <ChevronLeftIcon className="h-3 w-3" />
                    All Categories
                  </button>
                ) : !giphySearchQuery ? (
                  <div className="flex flex-wrap gap-1.5">
                    {GIPHY_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedGiphyCategory(cat.id)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                          selectedGiphyCategory === cat.id
                            ? "bg-[hsl(var(--magenta))] text-white"
                            : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Results */}
                {isLoadingGiphy ? (
                  <div className="flex items-center justify-center py-8">
                    <ReloadIcon className="h-5 w-5 animate-spin text-[hsl(var(--magenta))]" />
                  </div>
                ) : giphyStickers.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {giphyStickers.map((sticker) => (
                      <GiphyPreview
                        key={sticker.id}
                        sticker={sticker}
                        onClick={() => handleAddGiphy(sticker)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[hsl(var(--border-subtle))] p-4 text-center">
                    <MagicWandIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
                    <p className="text-xs text-[hsl(var(--text-muted))]">No stickers found</p>
                  </div>
                )}

                {/* Attribution */}
                <p className="text-center text-[9px] text-[hsl(var(--text-ghost))]">
                  Powered by{" "}
                  <a
                    href="https://giphy.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--magenta))] hover:underline"
                  >
                    GIPHY
                  </a>
                </p>
              </>
            )}

            {/* Tenor Content */}
            {animationSource === "tenor" && (
              <>
                {/* Search input */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                  <input
                    type="text"
                    value={tenorSearchQuery}
                    onChange={(e) => setTenorSearchQuery(e.target.value)}
                    placeholder="Search Tenor stickers..."
                    className="h-8 w-full rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] pr-8 pl-8 text-xs text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))] focus:border-[hsl(var(--success))] focus:outline-none"
                  />
                  {tenorSearchQuery && (
                    <button
                      onClick={() => setTenorSearchQuery("")}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                    >
                      <Cross2Icon className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Category pills or back button */}
                {selectedTenorCategory && !tenorSearchQuery ? (
                  <button
                    onClick={() => setSelectedTenorCategory(null)}
                    className="flex items-center gap-1 text-xs text-[hsl(var(--success))] hover:underline"
                  >
                    <ChevronLeftIcon className="h-3 w-3" />
                    All Categories
                  </button>
                ) : !tenorSearchQuery ? (
                  <div className="flex flex-wrap gap-1.5">
                    {TENOR_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedTenorCategory(cat.id)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                          selectedTenorCategory === cat.id
                            ? "bg-[hsl(var(--success))] text-white"
                            : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Results */}
                {isLoadingTenor ? (
                  <div className="flex items-center justify-center py-8">
                    <ReloadIcon className="h-5 w-5 animate-spin text-[hsl(var(--success))]" />
                  </div>
                ) : tenorStickers.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {tenorStickers.map((sticker) => (
                      <TenorPreview
                        key={sticker.id}
                        sticker={sticker}
                        onClick={() => handleAddTenor(sticker)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[hsl(var(--border-subtle))] p-4 text-center">
                    <MagicWandIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
                    <p className="text-xs text-[hsl(var(--text-muted))]">No stickers found</p>
                  </div>
                )}

                {/* Attribution */}
                <p className="text-center text-[9px] text-[hsl(var(--text-ghost))]">
                  Powered by{" "}
                  <a
                    href="https://tenor.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--success))] hover:underline"
                  >
                    Tenor
                  </a>
                </p>
              </>
            )}

            {/* Lottie Content */}
            {animationSource === "lottie" && (
              <>
                {/* Search input */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                  <input
                    type="text"
                    value={lottieSearchQuery}
                    onChange={(e) => setLottieSearchQuery(e.target.value)}
                    placeholder="Search Lottie animations..."
                    className="h-8 w-full rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] pr-8 pl-8 text-xs text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))] focus:border-[hsl(var(--cyan))] focus:outline-none"
                  />
                  {lottieSearchQuery && (
                    <button
                      onClick={() => setLottieSearchQuery("")}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                    >
                      <Cross2Icon className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Category pills or back button */}
                {selectedLottieCategory && !lottieSearchQuery ? (
                  <button
                    onClick={() => setSelectedLottieCategory(null)}
                    className="flex items-center gap-1 text-xs text-[hsl(var(--cyan))] hover:underline"
                  >
                    <ChevronLeftIcon className="h-3 w-3" />
                    All Categories
                  </button>
                ) : !lottieSearchQuery ? (
                  <div className="flex flex-wrap gap-1.5">
                    {lottieCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedLottieCategory(cat.id)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                          selectedLottieCategory === cat.id
                            ? "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))]"
                            : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                        )}
                      >
                        {cat.name}
                        <span className="ml-1 opacity-60">({cat.count})</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Results info */}
                {(lottieSearchQuery || selectedLottieCategory) && (
                  <p className="text-[10px] text-[hsl(var(--text-muted))]">
                    {filteredLottieAnimations.length} animation
                    {filteredLottieAnimations.length !== 1 ? "s" : ""}
                    {lottieSearchQuery
                      ? ` matching "${lottieSearchQuery}"`
                      : selectedLottieCategory
                        ? ` in ${lottieCategories.find((c) => c.id === selectedLottieCategory)?.name}`
                        : ""}
                  </p>
                )}

                {/* Animation grid */}
                <div className="grid grid-cols-2 gap-2">
                  {filteredLottieAnimations.map((animation) => (
                    <LottiePreview
                      key={animation.id}
                      animation={animation}
                      onClick={() => handleAddLottie(animation)}
                    />
                  ))}
                </div>

                {/* Empty state */}
                {filteredLottieAnimations.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[hsl(var(--border-subtle))] p-4 text-center">
                    <MagicWandIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
                    <p className="text-xs text-[hsl(var(--text-muted))]">No animations found</p>
                    <p className="mt-1 text-[10px] text-[hsl(var(--text-ghost))]">
                      Try a different search term
                    </p>
                  </div>
                )}

                {/* Attribution */}
                <p className="text-center text-[9px] text-[hsl(var(--text-ghost))]">
                  Animations powered by{" "}
                  <a
                    href="https://lottiefiles.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--cyan))] hover:underline"
                  >
                    LottieFiles
                  </a>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
