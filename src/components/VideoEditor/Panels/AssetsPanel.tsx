import React, { useState, useCallback } from "react";
import {
  MagnifyingGlassIcon,
  VideoIcon,
  SpeakerLoudIcon,
  MagicWandIcon,
  Cross2Icon,
  ReloadIcon,
  GearIcon,
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
  onAddAnimation?: (animationType: string, config: object) => void;
}

export const AssetsPanel: React.FC<AssetsPanelProps> = ({
  onAddBRoll,
  onAddMusic: _onAddMusic,
  onAddAnimation: _onAddAnimation,
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
    { id: "b-roll" as const, label: "B-Roll", icon: VideoIcon },
    { id: "music" as const, label: "Music", icon: SpeakerLoudIcon },
    { id: "animations" as const, label: "Animations", icon: MagicWandIcon },
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
            {/* AI Generation */}
            <div>
              <h4 className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                AI Generate
              </h4>
              <div className="rounded-lg border border-[hsl(var(--border-subtle))] p-3">
                <textarea
                  placeholder="Describe the animation you want..."
                  className="h-16 w-full resize-none rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] p-2 text-xs text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))] focus:border-[hsl(var(--cyan))] focus:outline-none"
                />
                <button
                  disabled
                  className="mt-2 flex h-7 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--surface))] text-[10px] font-medium text-[hsl(var(--text-ghost))]"
                >
                  <MagicWandIcon className="h-3 w-3" />
                  Generate (Coming Soon)
                </button>
              </div>
            </div>

            {/* Motion Templates */}
            <div>
              <h4 className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                Templates
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "Text Pop", category: "Text" },
                  { name: "Icon Pulse", category: "Icon" },
                  { name: "Stats Counter", category: "Stats" },
                  { name: "Quote Card", category: "Quote" },
                  { name: "Bullet Points", category: "List" },
                  { name: "Progress Bar", category: "Progress" },
                ].map((template) => (
                  <div
                    key={template.name}
                    className="cursor-not-allowed rounded-md border border-[hsl(var(--border-subtle))] p-2 opacity-50"
                  >
                    <div className="mb-1 flex h-12 items-center justify-center rounded bg-[hsl(var(--surface))]">
                      <MagicWandIcon className="h-4 w-4 text-[hsl(var(--text-ghost))]" />
                    </div>
                    <p className="text-[10px] font-medium text-[hsl(var(--text))]">
                      {template.name}
                    </p>
                    <p className="text-[9px] text-[hsl(var(--text-muted))]">{template.category}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
