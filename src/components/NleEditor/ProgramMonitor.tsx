import React, { useEffect, useRef, useMemo } from "react";
import type { EpisodeTimeline } from "../../lib/nleTypes";
import { getActiveItems, type ActiveItem } from "../../lib/nlePlayback";

interface ProgramMonitorProps {
  timeline: EpisodeTimeline;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  mediaUrlMap: Map<string, string>;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  timeline,
  currentTime,
  isPlaying,
  playbackSpeed,
  mediaUrlMap,
}) => {
  const mediaRefs = useRef<Map<string, HTMLMediaElement>>(new Map());

  const activeItems = useMemo(
    () => getActiveItems(currentTime, timeline.tracks),
    [currentTime, timeline.tracks]
  );

  // Separate video and audio items
  const videoItems = activeItems.filter((a) => a.item.type === "video" || a.item.type === "image");
  const audioItems = activeItems.filter((a) => a.item.type === "audio" || a.item.type === "video");

  // ---- Time sync: seek + volume + playbackRate ----
  useEffect(() => {
    for (const active of activeItems) {
      const { item, sourceSeekTime, trackMuted, trackVolume } = active;
      if (item.type !== "video" && item.type !== "audio") continue;

      const el = mediaRefs.current.get(item.id);
      if (!el) continue;

      // Seek if drifted more than 100ms (same threshold as MulticamPreview)
      if (Math.abs(el.currentTime - sourceSeekTime) > 0.1) {
        el.currentTime = sourceSeekTime;
      }

      // Volume: item volume * track volume, or 0 if muted (guard against NaN from missing fields)
      const vol = (item.volume ?? 1) * (trackVolume ?? 1);
      el.volume = trackMuted ? 0 : Math.max(0, Math.min(1, vol));

      // Playback rate (clamp to valid range — 0 or negative throws RangeError)
      el.playbackRate = Math.max(0.0625, (item.speed ?? 1) * playbackSpeed);
    }
  }, [currentTime, activeItems, playbackSpeed]);

  // ---- Play/pause sync ----
  useEffect(() => {
    mediaRefs.current.forEach((el) => {
      try {
        if (isPlaying) {
          if (el.paused) {
            el.play().catch(() => {
              // Autoplay blocked — user gesture required. Subsequent clicks will work.
            });
          }
        } else {
          if (!el.paused) {
            el.pause();
          }
        }
      } catch {
        // Element may be detached from DOM during re-render
      }
    });
  }, [isPlaying, activeItems]);

  // Resolve URL for an active item
  const getUrl = (active: ActiveItem): string | undefined => {
    const { item } = active;
    // Prefer resolvedUrl (set on drag-drop), fall back to mediaUrlMap lookup
    return (
      item.resolvedUrl || (item.mediaSourceId ? mediaUrlMap.get(item.mediaSourceId) : undefined)
    );
  };

  // Callback ref for media elements
  const setMediaRef = (itemId: string, el: HTMLMediaElement | null) => {
    if (el) {
      mediaRefs.current.set(itemId, el);
    } else {
      mediaRefs.current.delete(itemId);
    }
  };

  const hasVideo = videoItems.some((a) => getUrl(a));

  return (
    <div className="absolute inset-0 bg-black">
      {/* Video layers — stacked by track order */}
      {videoItems.map((active, i) => {
        const url = getUrl(active);
        if (!url) return null;
        if (active.item.type === "image") {
          return (
            <img
              key={active.item.id}
              src={url}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              style={{
                zIndex: i,
                opacity: active.item.opacity * active.trackOpacity,
              }}
            />
          );
        }
        return (
          <video
            key={active.item.id}
            ref={(el) => setMediaRef(active.item.id, el)}
            src={url}
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              zIndex: i,
              opacity: active.item.opacity * active.trackOpacity,
            }}
            onError={() => mediaRefs.current.delete(active.item.id)}
          />
        );
      })}

      {/* Audio elements — hidden, for playback only */}
      {audioItems.map((active) => {
        const url = getUrl(active);
        if (!url) return null;
        // Video items already have a <video> element above — use that for their audio
        if (active.item.type === "video") {
          // Unmute the video element for this item so its audio plays
          return null;
        }
        return (
          <audio
            key={active.item.id}
            ref={(el) => setMediaRef(active.item.id, el)}
            src={url}
            preload="auto"
            onError={() => mediaRefs.current.delete(active.item.id)}
          />
        );
      })}

      {/* Fallback when nothing to show */}
      {!hasVideo && (
        <div className="flex h-full items-center justify-center">
          <p className="text-xs text-neutral-600">No video at playhead</p>
        </div>
      )}
    </div>
  );
};
