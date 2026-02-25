import React from "react";
import { useNleStore } from "../../stores/nleStore";
import type { NleTimelineItem, NleTrack } from "../../lib/nleTypes";

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 4];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2);
  return `${m}:${s.padStart(5, "0")}`;
}

export const InspectorPanel: React.FC = () => {
  const timeline = useNleStore((s) => s.timeline);
  const selectedItemIds = useNleStore((s) => s.selectedItemIds);
  const selectedTrackIds = useNleStore((s) => s.selectedTrackIds);
  const updateItem = useNleStore((s) => s.updateItem);
  const updateTrack = useNleStore((s) => s.updateTrack);

  if (!timeline) return null;

  // Find selected items
  const selectedItems: NleTimelineItem[] = [];
  for (const track of timeline.tracks) {
    for (const item of track.items) {
      if (selectedItemIds.includes(item.id)) {
        selectedItems.push(item);
      }
    }
  }

  // Find selected tracks
  const selectedTracks: NleTrack[] = timeline.tracks.filter((t) => selectedTrackIds.includes(t.id));

  // ---- Single item selected ----
  if (selectedItems.length === 1) {
    const item = selectedItems[0];
    const isMedia = item.type === "video" || item.type === "audio";

    return (
      <div className="space-y-4">
        {/* Type info */}
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
            Info
          </div>
          <div className="space-y-1 text-xs text-[hsl(var(--text-secondary))]">
            <div className="flex justify-between">
              <span>Type</span>
              <span className="text-[hsl(var(--text-muted))]">{item.type}</span>
            </div>
            {item.mediaSourceType && (
              <div className="flex justify-between">
                <span>Source</span>
                <span className="text-[hsl(var(--text-muted))]">{item.mediaSourceType}</span>
              </div>
            )}
          </div>
        </div>

        {/* Opacity */}
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
            Opacity
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={item.opacity}
              onChange={(e) => updateItem(item.id, { opacity: parseFloat(e.target.value) })}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface))] accent-[hsl(var(--cyan))]"
            />
            <span className="w-10 text-right font-mono text-[10px] text-[hsl(var(--text-muted))]">
              {Math.round(item.opacity * 100)}%
            </span>
          </div>
        </div>

        {/* Volume (video/audio only) */}
        {isMedia && (
          <div>
            <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              Volume
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={item.volume}
                onChange={(e) => updateItem(item.id, { volume: parseFloat(e.target.value) })}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface))] accent-[hsl(var(--cyan))]"
              />
              <span className="w-10 text-right font-mono text-[10px] text-[hsl(var(--text-muted))]">
                {Math.round(item.volume * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Speed (video/audio only) */}
        {isMedia && (
          <div>
            <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              Speed
            </div>
            <select
              value={item.speed}
              onChange={(e) => updateItem(item.id, { speed: parseFloat(e.target.value) })}
              className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))] px-2 py-1 text-xs text-[hsl(var(--text-secondary))]"
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Timing (read-only) */}
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
            Timing
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[hsl(var(--text-muted))]">Start</span>
              <span className="font-mono text-[hsl(var(--text-secondary))]">
                {formatTime(item.startTime)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[hsl(var(--text-muted))]">Duration</span>
              <span className="font-mono text-[hsl(var(--text-secondary))]">
                {formatTime(item.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[hsl(var(--text-muted))]">Source In</span>
              <span className="font-mono text-[hsl(var(--text-secondary))]">
                {formatTime(item.sourceIn)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[hsl(var(--text-muted))]">Source Out</span>
              <span className="font-mono text-[hsl(var(--text-secondary))]">
                {formatTime(item.sourceOut)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Multiple items selected ----
  if (selectedItems.length > 1) {
    return (
      <div className="mt-4 text-center">
        <p className="text-xs text-[hsl(var(--text-secondary))]">
          {selectedItems.length} items selected
        </p>
      </div>
    );
  }

  // ---- Single track selected ----
  if (selectedTracks.length === 1) {
    const track = selectedTracks[0];
    return (
      <div className="space-y-4">
        {/* Track name */}
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
            Name
          </div>
          <input
            type="text"
            value={track.name}
            onChange={(e) => updateTrack(track.id, { name: e.target.value })}
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))] px-2 py-1 text-xs text-[hsl(var(--text-secondary))]"
          />
        </div>

        {/* Track volume */}
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
            Volume
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={track.volume}
              onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface))] accent-[hsl(var(--cyan))]"
            />
            <span className="w-10 text-right font-mono text-[10px] text-[hsl(var(--text-muted))]">
              {Math.round(track.volume * 100)}%
            </span>
          </div>
        </div>

        {/* Track info */}
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
            Info
          </div>
          <div className="space-y-1 text-xs text-[hsl(var(--text-secondary))]">
            <div className="flex justify-between">
              <span>Type</span>
              <span className="text-[hsl(var(--text-muted))]">{track.type}</span>
            </div>
            <div className="flex justify-between">
              <span>Items</span>
              <span className="text-[hsl(var(--text-muted))]">{track.items.length}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Nothing selected ----
  return (
    <div className="mt-8 text-center">
      <p className="text-xs text-[hsl(var(--text-muted))]">
        Select an item or track to inspect its properties
      </p>
    </div>
  );
};
