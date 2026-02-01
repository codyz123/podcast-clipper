import React, { useRef, useCallback, useState } from "react";
import {
  SpeakerLoudIcon,
  SpeakerOffIcon,
  LockClosedIcon,
  LockOpen1Icon,
  VideoIcon,
  TextIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import { Track, TrackType } from "../../../lib/types";
import { cn } from "../../../lib/utils";
import { formatTimestamp } from "../../../lib/formats";

interface MultiTrackTimelineProps {
  tracks: Track[];
  clipDuration: number;
  currentTime: number;
  zoomLevel: number; // pixels per second
  selectedTrackId: string | null;
  onTracksChange: (tracks: Track[]) => void;
  onSeek: (time: number) => void;
  onSelectTrack: (trackId: string | null) => void;
}

// Track type icons and colors
const TRACK_CONFIG: Record<
  TrackType,
  { icon: React.ElementType; color: string; bgColor: string; fadeColor: string }
> = {
  "podcast-audio": {
    icon: SpeakerLoudIcon,
    color: "hsl(var(--cyan))",
    bgColor: "hsl(var(--cyan)/0.2)",
    fadeColor: "hsl(var(--cyan)/0.4)",
  },
  music: {
    icon: SpeakerLoudIcon,
    color: "hsl(var(--magenta))",
    bgColor: "hsl(var(--magenta)/0.2)",
    fadeColor: "hsl(var(--magenta)/0.4)",
  },
  sfx: {
    icon: SpeakerLoudIcon,
    color: "hsl(var(--success))",
    bgColor: "hsl(var(--success)/0.2)",
    fadeColor: "hsl(var(--success)/0.4)",
  },
  "video-overlay": {
    icon: VideoIcon,
    color: "hsl(185 100% 50%)",
    bgColor: "hsl(185 100% 50%/0.2)",
    fadeColor: "hsl(185 100% 50%/0.4)",
  },
  "text-graphics": {
    icon: TextIcon,
    color: "hsl(45 100% 50%)",
    bgColor: "hsl(45 100% 50%/0.2)",
    fadeColor: "hsl(45 100% 50%/0.4)",
  },
  captions: {
    icon: TextIcon,
    color: "hsl(var(--text))",
    bgColor: "hsl(var(--text)/0.15)",
    fadeColor: "hsl(var(--text)/0.3)",
  },
};

const TRACK_HEIGHT_COLLAPSED = 40;
const TRACK_HEIGHT_EXPANDED = 72;
const HEADER_WIDTH = 140;

// Check if track is an audio type that supports fades
const isAudioTrack = (type: TrackType) =>
  type === "podcast-audio" || type === "music" || type === "sfx";

export const MultiTrackTimeline: React.FC<MultiTrackTimelineProps> = ({
  tracks,
  clipDuration,
  currentTime,
  zoomLevel,
  selectedTrackId,
  onTracksChange,
  onSeek,
  onSelectTrack,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingFade, setDraggingFade] = useState<{
    trackId: string;
    type: "fadeIn" | "fadeOut";
    startX: number;
    startValue: number;
  } | null>(null);

  // Calculate timeline width based on duration and zoom
  const timelineWidth = Math.max(clipDuration * zoomLevel, 400);

  // Generate time markers
  const getTimeMarkers = () => {
    const markers: { time: number; label: string; major: boolean }[] = [];

    let interval: number;
    if (zoomLevel >= 100) {
      interval = 1;
    } else if (zoomLevel >= 50) {
      interval = 2;
    } else if (zoomLevel >= 25) {
      interval = 5;
    } else {
      interval = 10;
    }

    for (let t = 0; t <= clipDuration; t += interval) {
      markers.push({
        time: t,
        label: formatTimestamp(t),
        major: t % (interval * 2) === 0,
      });
    }

    return markers;
  };

  // Handle click on timeline to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current || draggingFade) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_WIDTH;
      const time = Math.max(0, Math.min(clipDuration, x / zoomLevel));
      onSeek(time);
    },
    [clipDuration, zoomLevel, onSeek, draggingFade]
  );

  // Handle dragging on timeline for scrubbing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current || draggingFade) return;

      handleTimelineClick(e);

      const handleMouseMove = (e: MouseEvent) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - HEADER_WIDTH;
        const time = Math.max(0, Math.min(clipDuration, x / zoomLevel));
        onSeek(time);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [clipDuration, zoomLevel, onSeek, handleTimelineClick, draggingFade]
  );

  // Toggle track mute
  const toggleMute = useCallback(
    (trackId: string) => {
      const updatedTracks = tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t));
      onTracksChange(updatedTracks);
    },
    [tracks, onTracksChange]
  );

  // Toggle track lock
  const toggleLock = useCallback(
    (trackId: string) => {
      const updatedTracks = tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t));
      onTracksChange(updatedTracks);
    },
    [tracks, onTracksChange]
  );

  // Update track fade
  const updateTrackFade = useCallback(
    (trackId: string, fadeType: "fadeIn" | "fadeOut", value: number) => {
      const updatedTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, [fadeType]: Math.max(0, Math.min(clipDuration / 2, value)) } : t
      );
      onTracksChange(updatedTracks);
    },
    [tracks, onTracksChange, clipDuration]
  );

  // Update track volume
  const updateTrackVolume = useCallback(
    (trackId: string, volume: number) => {
      const updatedTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, volume: Math.max(0, Math.min(1, volume)) } : t
      );
      onTracksChange(updatedTracks);
    },
    [tracks, onTracksChange]
  );

  // Handle fade handle drag start
  const handleFadeHandleMouseDown = useCallback(
    (e: React.MouseEvent, trackId: string, fadeType: "fadeIn" | "fadeOut") => {
      e.stopPropagation();
      e.preventDefault();

      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;

      const startValue = fadeType === "fadeIn" ? track.fadeIn || 0 : track.fadeOut || 0;

      setDraggingFade({
        trackId,
        type: fadeType,
        startX: e.clientX,
        startValue,
      });

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - (draggingFade?.startX || e.clientX);
        const deltaTime = deltaX / zoomLevel;

        // For fade in, dragging right increases; for fade out, dragging left increases
        const newValue = fadeType === "fadeIn" ? startValue + deltaTime : startValue - deltaTime;

        updateTrackFade(trackId, fadeType, newValue);
      };

      const handleMouseUp = () => {
        setDraggingFade(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [tracks, zoomLevel, updateTrackFade, draggingFade?.startX]
  );

  // Sort tracks by order (lower = bottom, higher = top)
  const sortedTracks = [...tracks].sort((a, b) => b.order - a.order);

  const timeMarkers = getTimeMarkers();
  const playheadPosition = currentTime * zoomLevel + HEADER_WIDTH;

  return (
    <div
      ref={timelineRef}
      className="relative overflow-auto bg-[hsl(var(--bg-base))]"
      style={{ height: "auto", minHeight: 200 }}
      onMouseDown={handleMouseDown}
    >
      {/* Time ruler */}
      <div
        className="sticky top-0 z-20 flex h-6 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]"
        style={{ width: timelineWidth + HEADER_WIDTH }}
      >
        <div
          className="shrink-0 border-r border-[hsl(var(--border-subtle))]"
          style={{ width: HEADER_WIDTH }}
        />
        <div className="relative flex-1">
          {timeMarkers.map(({ time, label, major }) => (
            <div
              key={time}
              className="absolute top-0 flex h-full flex-col items-center"
              style={{ left: time * zoomLevel }}
            >
              <div
                className={cn(
                  "w-px",
                  major
                    ? "h-3 bg-[hsl(var(--text-tertiary))]"
                    : "h-2 bg-[hsl(var(--border-subtle))]"
                )}
              />
              {major && (
                <span className="mt-0.5 text-[9px] text-[hsl(var(--text-tertiary))]">{label}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tracks */}
      <div style={{ width: timelineWidth + HEADER_WIDTH }}>
        {sortedTracks.map((track) => {
          const config = TRACK_CONFIG[track.type];
          const Icon = config.icon;
          const isSelected = selectedTrackId === track.id;
          const isAudio = isAudioTrack(track.type);
          const trackHeight = isSelected ? TRACK_HEIGHT_EXPANDED : TRACK_HEIGHT_COLLAPSED;

          const fadeInWidth = (track.fadeIn || 0) * zoomLevel;
          const fadeOutWidth = (track.fadeOut || 0) * zoomLevel;

          return (
            <div
              key={track.id}
              className={cn(
                "flex border-b border-[hsl(var(--border-subtle))] transition-all duration-150",
                isSelected && "bg-[hsl(var(--cyan)/0.03)]"
              )}
              style={{ height: trackHeight }}
            >
              {/* Track header */}
              <div
                className={cn(
                  "flex shrink-0 cursor-pointer flex-col border-r border-[hsl(var(--border-subtle))] px-2 py-1.5 transition-colors",
                  isSelected
                    ? "bg-[hsl(var(--cyan)/0.1)]"
                    : "bg-[hsl(var(--bg-surface))] hover:bg-[hsl(var(--surface))]"
                )}
                style={{ width: HEADER_WIDTH }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onSelectTrack(isSelected ? null : track.id)}
              >
                {/* Top row: icon, name, expand indicator */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded"
                    style={{ backgroundColor: config.bgColor }}
                  >
                    <Icon className="h-3 w-3" style={{ color: config.color }} />
                  </div>
                  <span className="flex-1 truncate text-[10px] font-medium text-[hsl(var(--text))]">
                    {track.name}
                  </span>
                  {isAudio && (
                    <div className="text-[hsl(var(--text-ghost))]">
                      {isSelected ? (
                        <ChevronDownIcon className="h-3 w-3" />
                      ) : (
                        <ChevronRightIcon className="h-3 w-3" />
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom row: controls - only visible when expanded */}
                {isSelected && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMute(track.id);
                      }}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded transition-colors",
                        track.muted
                          ? "bg-[hsl(var(--error)/0.2)] text-[hsl(var(--error))]"
                          : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                      )}
                      title={track.muted ? "Unmute" : "Mute"}
                    >
                      {track.muted ? (
                        <SpeakerOffIcon className="h-3 w-3" />
                      ) : (
                        <SpeakerLoudIcon className="h-3 w-3" />
                      )}
                    </button>
                    {track.type !== "podcast-audio" && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock(track.id);
                        }}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded transition-colors",
                          track.locked
                            ? "bg-[hsl(var(--cyan)/0.2)] text-[hsl(var(--cyan))]"
                            : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                        )}
                        title={track.locked ? "Unlock" : "Lock"}
                      >
                        {track.locked ? (
                          <LockClosedIcon className="h-3 w-3" />
                        ) : (
                          <LockOpen1Icon className="h-3 w-3" />
                        )}
                      </button>
                    )}
                    {/* Volume slider */}
                    {isAudio && (
                      <div className="flex flex-1 items-center gap-1">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(track.volume * 100)}
                          onChange={(e) =>
                            updateTrackVolume(track.id, parseInt(e.target.value) / 100)
                          }
                          onMouseDown={(e) => e.stopPropagation()}
                          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface))] accent-[hsl(var(--cyan))]"
                          style={{ accentColor: config.color }}
                        />
                        <span className="w-7 text-right text-[9px] text-[hsl(var(--text-muted))]">
                          {Math.round(track.volume * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Track content */}
              <div className="relative flex-1 bg-[hsl(var(--bg-base))]">
                {/* Track clips with fade overlays */}
                {track.clips.map((clip) => {
                  const clipLeft = clip.startTime * zoomLevel;
                  const clipWidth = Math.max(clip.duration * zoomLevel, 4);

                  return (
                    <div
                      key={clip.id}
                      className="absolute top-1 bottom-1 overflow-hidden rounded"
                      style={{
                        left: clipLeft,
                        width: clipWidth,
                        backgroundColor: config.bgColor,
                        borderLeft: `2px solid ${config.color}`,
                      }}
                    >
                      {/* Fade In overlay */}
                      {isAudio && fadeInWidth > 0 && (
                        <div
                          className="absolute top-0 bottom-0 left-0"
                          style={{ width: Math.min(fadeInWidth, clipWidth) }}
                        >
                          <svg className="h-full w-full" preserveAspectRatio="none">
                            <polygon points={`0,100% 0,0 100%,0`} fill={config.fadeColor} />
                          </svg>
                        </div>
                      )}

                      {/* Fade Out overlay */}
                      {isAudio && fadeOutWidth > 0 && (
                        <div
                          className="absolute top-0 right-0 bottom-0"
                          style={{ width: Math.min(fadeOutWidth, clipWidth) }}
                        >
                          <svg className="h-full w-full" preserveAspectRatio="none">
                            <polygon points={`0,0 100%,0 100%,100%`} fill={config.fadeColor} />
                          </svg>
                        </div>
                      )}

                      {/* Clip label */}
                      {clip.duration * zoomLevel > 60 && (
                        <span
                          className="absolute top-1/2 left-2 -translate-y-1/2 truncate text-[9px] font-medium"
                          style={{
                            color: config.color,
                            maxWidth: clip.duration * zoomLevel - 16,
                          }}
                        >
                          {clip.type === "audio" ? "Audio" : clip.type}
                        </span>
                      )}

                      {/* Fade handles (only when selected) */}
                      {isSelected && isAudio && (
                        <>
                          {/* Fade In handle */}
                          <div
                            className="group absolute top-0 bottom-0 cursor-ew-resize"
                            style={{
                              left: Math.min(fadeInWidth, clipWidth - 10),
                              width: 10,
                            }}
                            onMouseDown={(e) => handleFadeHandleMouseDown(e, track.id, "fadeIn")}
                          >
                            <div
                              className="absolute top-1/2 left-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all group-hover:h-8 group-hover:w-2"
                              style={{ backgroundColor: config.color }}
                            />
                          </div>

                          {/* Fade Out handle */}
                          <div
                            className="group absolute top-0 right-0 bottom-0 cursor-ew-resize"
                            style={{
                              right: Math.min(fadeOutWidth, clipWidth - 10),
                              width: 10,
                            }}
                            onMouseDown={(e) => handleFadeHandleMouseDown(e, track.id, "fadeOut")}
                          >
                            <div
                              className="absolute top-1/2 left-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all group-hover:h-8 group-hover:w-2"
                              style={{ backgroundColor: config.color }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Fade labels when expanded */}
                {isSelected && isAudio && track.clips.length > 0 && (
                  <div className="absolute right-0 bottom-0.5 left-0 flex justify-between px-1">
                    <span className="rounded bg-black/50 px-1 text-[8px] font-medium text-white">
                      Fade In: {(track.fadeIn || 0).toFixed(1)}s
                    </span>
                    <span className="rounded bg-black/50 px-1 text-[8px] font-medium text-white">
                      Fade Out: {(track.fadeOut || 0).toFixed(1)}s
                    </span>
                  </div>
                )}

                {/* Empty state for tracks without clips */}
                {track.clips.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9px] text-[hsl(var(--text-ghost))]">
                      {track.type === "captions" ? "Captions auto-generated" : "Drop media here"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Playhead */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-[hsl(var(--text))]"
        style={{ left: playheadPosition }}
      >
        <div className="absolute -top-0 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm bg-[hsl(var(--text))]" />
      </div>
    </div>
  );
};
