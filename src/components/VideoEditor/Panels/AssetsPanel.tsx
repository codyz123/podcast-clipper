import React, { useState, useCallback } from "react";
import {
  MagnifyingGlassIcon,
  VideoIcon,
  SpeakerLoudIcon,
  MagicWandIcon,
  Cross2Icon,
  ReloadIcon,
  GearIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../../lib/utils";
import { useSettingsStore } from "../../../stores/settingsStore";
import {
  searchVideos,
  getBestVideoFile,
  PexelsVideo,
} from "../../../services/assets/pexelsService";

type AssetTab = "b-roll" | "music" | "animations";

interface AssetsPanelProps {
  onAddBRoll?: (videoUrl: string, duration: number) => void;
  onAddMusic?: (audioUrl: string, name: string) => void;
  onAddAnimation?: (
    animationUrl: string,
    name: string,
    duration: number,
    source: "lottie" | "giphy" | "tenor" | "waveform" | "youtube-cta" | "apple-podcasts-cta"
  ) => void;
}

const OVERLAY_ITEMS = [
  {
    id: "waveform" as const,
    name: "Audio Waveform",
    description: "Animates when someone is talking",
    duration: 5,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="1" y="8" width="2" height="4" rx="1" fill="currentColor" opacity="0.6" />
        <rect x="4.5" y="5" width="2" height="10" rx="1" fill="currentColor" opacity="0.8" />
        <rect x="8" y="3" width="2" height="14" rx="1" fill="currentColor" />
        <rect x="11.5" y="6" width="2" height="8" rx="1" fill="currentColor" opacity="0.8" />
        <rect x="15" y="4" width="2" height="12" rx="1" fill="currentColor" opacity="0.7" />
        <rect x="18" y="7" width="1" height="6" rx="0.5" fill="currentColor" opacity="0.5" />
      </svg>
    ),
    color: "hsl(var(--cyan))",
  },
  {
    id: "youtube-cta" as const,
    name: "YouTube Subscribe",
    description: "Encourage viewers to subscribe",
    duration: 4,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="1" y="4" width="18" height="12" rx="3" fill="#FF0000" />
        <path d="M8 7.5V12.5L13 10L8 7.5Z" fill="white" />
      </svg>
    ),
    color: "#FF0000",
  },
  {
    id: "apple-podcasts-cta" as const,
    name: "Apple Podcasts",
    description: "Show your podcast in Apple Podcasts",
    duration: 5,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <defs>
          <linearGradient id="ap-panel-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F452FF" />
            <stop offset="100%" stopColor="#832BC1" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="18" height="18" rx="4" fill="url(#ap-panel-grad)" />
        <circle cx="10" cy="8.5" r="2.5" fill="white" />
        <path
          d="M10 12c-2 0-3.5 1.2-4 2.8C6.5 16.5 8 17.5 10 17.5s3.5-1 4-2.7c-.5-1.6-2-2.8-4-2.8z"
          fill="white"
        />
        <circle cx="10" cy="8.5" r="4.5" stroke="white" strokeWidth="1.2" fill="none" />
      </svg>
    ),
    color: "#9B59B6",
  },
];

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

  const hasPexelsKey = Boolean(settings.pexelsApiKey);

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

  const tabs = [
    { id: "b-roll" as const, label: "Video", icon: VideoIcon },
    { id: "music" as const, label: "Music", icon: SpeakerLoudIcon },
    { id: "animations" as const, label: "Graphics", icon: MagicWandIcon },
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
          <div className="space-y-4">
            {/* Overlays section */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                Overlays
              </h4>
              <div className="space-y-1.5">
                {OVERLAY_ITEMS.map((overlay) => (
                  <button
                    key={overlay.id}
                    onClick={() => onAddAnimation?.("", overlay.name, overlay.duration, overlay.id)}
                    className="group flex w-full items-center gap-3 rounded-lg border border-[hsl(var(--border-subtle))] p-2.5 text-left transition-all hover:border-[hsl(var(--cyan))] hover:bg-[hsl(var(--surface))]"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${overlay.color}20`, color: overlay.color }}
                    >
                      {overlay.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[hsl(var(--text))]">{overlay.name}</p>
                      <p className="text-[10px] text-[hsl(var(--text-muted))]">
                        {overlay.description}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-md bg-[hsl(var(--surface))] px-2 py-1 text-[10px] font-medium text-[hsl(var(--text-muted))] opacity-0 transition-opacity group-hover:opacity-100">
                      <PlusIcon className="inline h-3 w-3" /> Add
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Generated section */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                AI Generated
              </h4>
              <div className="rounded-lg border border-dashed border-[hsl(var(--border-subtle))] p-4 text-center">
                <MagicWandIcon className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--text-ghost))]" />
                <p className="text-xs text-[hsl(var(--text-muted))]">Coming soon</p>
                <p className="mt-1 text-[10px] text-[hsl(var(--text-ghost))]">
                  AI-generated graphics and visuals
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
