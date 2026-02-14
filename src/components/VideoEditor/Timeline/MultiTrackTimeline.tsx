import React, { useRef, useCallback, useState, useMemo } from "react";
import {
  SpeakerLoudIcon,
  SpeakerOffIcon,
  LockClosedIcon,
  LockOpen1Icon,
  VideoIcon,
  TextIcon,
  PersonIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import { Track, TrackType, Word, PodcastPerson } from "../../../lib/types";
import { cn } from "../../../lib/utils";
import { formatTimestamp } from "../../../lib/formats";
import { getMediaUrl } from "../../../lib/api";

// Speaker color palette for multicam track segments
const SPEAKER_COLORS = [
  { bg: "hsl(200 80% 50%/0.3)", border: "hsl(200 80% 50%)", text: "hsl(200 80% 70%)" },
  { bg: "hsl(340 80% 50%/0.3)", border: "hsl(340 80% 50%)", text: "hsl(340 80% 70%)" },
  { bg: "hsl(130 60% 45%/0.3)", border: "hsl(130 60% 45%)", text: "hsl(130 60% 65%)" },
  { bg: "hsl(40 90% 50%/0.3)", border: "hsl(40 90% 50%)", text: "hsl(40 90% 70%)" },
  { bg: "hsl(270 70% 55%/0.3)", border: "hsl(270 70% 55%)", text: "hsl(270 70% 70%)" },
  { bg: "hsl(15 80% 55%/0.3)", border: "hsl(15 80% 55%)", text: "hsl(15 80% 70%)" },
];

interface VideoSourceInfo {
  id: string;
  label: string;
}

interface MultiTrackTimelineProps {
  tracks: Track[];
  clipDuration: number;
  currentTime: number;
  zoomLevel: number; // pixels per second
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onTracksChange: (tracks: Track[]) => void;
  onSeek: (time: number) => void;
  onSelectTrack: (trackId: string | null) => void;
  onSelectClip: (clipId: string | null) => void;
  words?: Word[]; // Words for caption visualization
  clipStartTime?: number; // Start time of the clip in the full audio
  videoSources?: VideoSourceInfo[]; // Video sources for multicam track labels
  speakerPeople?: PodcastPerson[]; // Podcast people for speaker track avatars
  onDoubleClickTrack?: (trackId: string, timeInClip: number) => void;
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
  multicam: {
    icon: VideoIcon,
    color: "hsl(280 100% 65%)",
    bgColor: "hsl(280 100% 65%/0.2)",
    fadeColor: "hsl(280 100% 65%/0.4)",
  },
  speaker: {
    icon: PersonIcon,
    color: "hsl(185 60% 50%)",
    bgColor: "hsl(185 60% 50%/0.2)",
    fadeColor: "hsl(185 60% 50%/0.4)",
  },
  background: {
    icon: VideoIcon,
    color: "hsl(var(--text-muted))",
    bgColor: "hsl(var(--text-muted)/0.15)",
    fadeColor: "hsl(var(--text-muted)/0.3)",
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
  selectedClipId,
  onTracksChange,
  onSeek,
  onSelectTrack,
  onSelectClip,
  words = [],
  clipStartTime = 0,
  videoSources,
  speakerPeople,
  onDoubleClickTrack,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingFade, setDraggingFade] = useState<{
    trackId: string;
    type: "fadeIn" | "fadeOut";
    startX: number;
    startValue: number;
  } | null>(null);

  // State for dragging clips
  const [draggingClip, setDraggingClip] = useState<{
    trackId: string;
    clipId: string;
    startX: number;
    originalStartTime: number;
  } | null>(null);

  // Ref for tracking edge resize (speaker track)
  const resizingEdgeRef = useRef(false);

  // Get words that fall within the clip duration (for caption visualization)
  const clipWords = useMemo(() => {
    const clipEndTime = clipStartTime + clipDuration;
    return words.filter((w) => w.start >= clipStartTime && w.end <= clipEndTime);
  }, [words, clipStartTime, clipDuration]);

  // Build a color map for multicam source IDs and speaker labels
  const sourceColorMap = useMemo(() => {
    const map = new Map<string, (typeof SPEAKER_COLORS)[0]>();
    if (videoSources) {
      videoSources.forEach((s, i) => {
        map.set(s.id, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
      });
    }
    // Also assign colors to unique speaker labels from speaker tracks
    const speakerLabels = new Set<string>();
    for (const track of tracks) {
      if (track.type === "speaker") {
        for (const clip of track.clips) {
          if (clip.assetId && !map.has(clip.assetId)) {
            speakerLabels.add(clip.assetId);
          }
        }
      }
    }
    let colorIdx = videoSources?.length ?? 0;
    for (const label of speakerLabels) {
      map.set(label, SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]);
      colorIdx++;
    }
    return map;
  }, [videoSources, tracks]);

  const sourceLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    if (videoSources) {
      videoSources.forEach((s) => map.set(s.id, s.label));
    }
    // Add speaker labels (assetId is the speaker label itself for speaker tracks)
    for (const track of tracks) {
      if (track.type === "speaker") {
        for (const clip of track.clips) {
          if (clip.assetId && !map.has(clip.assetId)) {
            map.set(clip.assetId, clip.assetId);
          }
        }
      }
    }
    return map;
  }, [videoSources, tracks]);

  // Build a map from speaker clip IDs to their PodcastPerson (for photos)
  // Uses the speakerId stored in assetUrl for direct lookup
  const speakerPersonMap = useMemo(() => {
    const map = new Map<string, PodcastPerson>();
    if (!speakerPeople?.length) return map;

    for (const track of tracks) {
      if (track.type !== "speaker") continue;
      for (const clip of track.clips) {
        if (clip.assetUrl && clip.assetId && !map.has(clip.assetId)) {
          const person = speakerPeople.find((p) => p.id === clip.assetUrl);
          if (person) map.set(clip.assetId, person);
        }
      }
    }
    return map;
  }, [tracks, speakerPeople]);

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

      const startX = e.clientX;
      const startValue = fadeType === "fadeIn" ? track.fadeIn || 0 : track.fadeOut || 0;

      setDraggingFade({
        trackId,
        type: fadeType,
        startX,
        startValue,
      });

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
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
    [tracks, zoomLevel, updateTrackFade]
  );

  // Handle clip drag start (for repositioning clips)
  const handleClipDragStart = useCallback(
    (e: React.MouseEvent, trackId: string, clipId: string, originalStartTime: number) => {
      e.stopPropagation();
      e.preventDefault();

      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.locked) return;

      // Don't allow dragging podcast-audio or captions tracks
      if (track.type === "podcast-audio" || track.type === "captions") return;

      const startX = e.clientX;

      setDraggingClip({
        trackId,
        clipId,
        startX,
        originalStartTime,
      });

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const deltaTime = deltaX / zoomLevel;

        // Find the clip to get its duration for bounds checking
        const clip = track.clips.find((c) => c.id === clipId);
        const clipDur = clip?.duration || 1;

        const newStartTime = Math.max(
          0,
          Math.min(clipDuration - clipDur, originalStartTime + deltaTime)
        );

        // Update the clip position
        const updatedTracks = tracks.map((t) => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? { ...c, startTime: newStartTime } : c)),
          };
        });
        onTracksChange(updatedTracks);
      };

      const handleMouseUp = () => {
        setDraggingClip(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [tracks, zoomLevel, clipDuration, onTracksChange]
  );

  // Handle edge resize for speaker/multicam clips
  const handleEdgeResizeStart = useCallback(
    (e: React.MouseEvent, trackId: string, clipId: string, edge: "start" | "end") => {
      e.stopPropagation();
      e.preventDefault();

      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.locked) return;

      const clip = track.clips.find((c) => c.id === clipId);
      if (!clip) return;

      const startX = e.clientX;

      resizingEdgeRef.current = true;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const deltaTime = deltaX / zoomLevel;

        let newStartTime = clip.startTime;
        let newDuration = clip.duration;

        if (edge === "start") {
          // Left edge: move start, adjust duration to keep end fixed
          newStartTime = Math.max(0, clip.startTime + deltaTime);
          newDuration = clip.duration - (newStartTime - clip.startTime);
          // Enforce minimum duration
          if (newDuration < 0.1) {
            newDuration = 0.1;
            newStartTime = clip.startTime + clip.duration - 0.1;
          }
        } else {
          // Right edge: adjust duration only
          newDuration = Math.max(0.1, clip.duration + deltaTime);
          // Don't exceed clip timeline bounds
          if (newStartTime + newDuration > clipDuration) {
            newDuration = clipDuration - newStartTime;
          }
        }

        const updatedTracks = tracks.map((t) => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            clips: t.clips.map((c) =>
              c.id === clipId ? { ...c, startTime: newStartTime, duration: newDuration } : c
            ),
          };
        });
        onTracksChange(updatedTracks);
      };

      const handleMouseUp = () => {
        resizingEdgeRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [tracks, zoomLevel, clipDuration, onTracksChange]
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
              <div
                className="relative flex-1 bg-[hsl(var(--bg-base))]"
                onDoubleClick={(e) => {
                  if (track.type !== "multicam" || !onDoubleClickTrack) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const time =
                    (e.clientX - rect.left + (e.currentTarget.parentElement?.scrollLeft || 0)) /
                    zoomLevel;
                  onDoubleClickTrack(track.id, time);
                }}
              >
                {/* Caption word visualization for captions track */}
                {track.type === "captions" && clipWords.length > 0 && (
                  <div className="absolute inset-x-0 top-1 bottom-1 overflow-hidden">
                    {clipWords.map((word, i) => {
                      const wordStart = (word.start - clipStartTime) * zoomLevel;
                      const wordWidth = Math.max((word.end - word.start) * zoomLevel, 2);
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 flex items-center overflow-hidden rounded-sm"
                          style={{
                            left: wordStart,
                            width: wordWidth,
                            backgroundColor: config.bgColor,
                          }}
                        >
                          {wordWidth > 20 && (
                            <span
                              className="truncate px-0.5 text-[8px]"
                              style={{ color: config.color }}
                            >
                              {word.text}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Track clips with fade overlays */}
                {track.clips.map((clip) => {
                  const clipLeft = clip.startTime * zoomLevel;
                  const clipWidth = Math.max(clip.duration * zoomLevel, 4);
                  const isDraggable =
                    !track.locked &&
                    track.type !== "podcast-audio" &&
                    track.type !== "captions" &&
                    track.type !== "multicam" &&
                    track.type !== "speaker";
                  const isDraggingThis = draggingClip?.clipId === clip.id;
                  const isClipSelected = selectedClipId === clip.id;

                  // Use source-specific colors for multicam and speaker clips
                  const isMulticamClip = track.type === "multicam" && clip.assetId;
                  const isSpeakerClip = track.type === "speaker" && clip.assetId;
                  const isOverrideClip = isMulticamClip && clip.assetSource === "override";
                  const sourceColor =
                    isMulticamClip || isSpeakerClip ? sourceColorMap.get(clip.assetId!) : undefined;
                  const clipBgColor = isOverrideClip
                    ? sourceColor?.bg.replace("0.3", "0.45") || config.bgColor
                    : sourceColor?.bg || config.bgColor;
                  const clipBorderColor = sourceColor?.border || config.color;

                  return (
                    <div
                      key={clip.id}
                      className={cn(
                        "absolute top-1 bottom-1 overflow-hidden rounded",
                        isDraggable && "cursor-grab",
                        isDraggingThis && "cursor-grabbing ring-2 ring-white/50",
                        isClipSelected &&
                          "ring-2 ring-[hsl(var(--cyan))] ring-offset-1 ring-offset-[hsl(var(--bg-base))]"
                      )}
                      style={{
                        left: clipLeft,
                        width: clipWidth,
                        backgroundColor: clipBgColor,
                        borderLeft: `2px solid ${clipBorderColor}`,
                        ...(isOverrideClip ? { borderTop: `2px dashed ${clipBorderColor}` } : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Allow selecting clips on video-overlay tracks and override clips
                        if (track.type === "video-overlay" || isOverrideClip) {
                          onSelectClip(isClipSelected ? null : clip.id);
                        }
                      }}
                      onMouseDown={
                        isDraggable
                          ? (e) => handleClipDragStart(e, track.id, clip.id, clip.startTime)
                          : undefined
                      }
                    >
                      {/* Fade In overlay - triangle from bottom-left to top of handle */}
                      {isAudio && fadeInWidth > 0 && (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 left-0"
                          style={{ width: Math.min(fadeInWidth, clipWidth) }}
                        >
                          <svg
                            className="h-full w-full"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            {/* Triangle: bottom-left -> top-right -> bottom-right */}
                            <polygon points="0,100 100,0 100,100" fill={config.fadeColor} />
                            {/* Diagonal line for the fade curve */}
                            <line
                              x1="0"
                              y1="100"
                              x2="100"
                              y2="0"
                              stroke={config.color}
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Fade Out overlay - triangle from top of handle to bottom-right */}
                      {isAudio && fadeOutWidth > 0 && (
                        <div
                          className="pointer-events-none absolute top-0 right-0 bottom-0"
                          style={{ width: Math.min(fadeOutWidth, clipWidth) }}
                        >
                          <svg
                            className="h-full w-full"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            {/* Triangle: top-left -> bottom-left -> bottom-right */}
                            <polygon points="0,0 0,100 100,100" fill={config.fadeColor} />
                            {/* Diagonal line for the fade curve */}
                            <line
                              x1="0"
                              y1="0"
                              x2="100"
                              y2="100"
                              stroke={config.color}
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Clip label */}
                      {isSpeakerClip && clip.assetId
                        ? (() => {
                            const person = speakerPersonMap.get(clip.assetId);
                            const label =
                              person?.name || sourceLabelMap.get(clip.assetId) || "Speaker";
                            const clipPx = clip.duration * zoomLevel;
                            return (
                              <div className="absolute inset-0 flex items-center gap-1 overflow-hidden px-1">
                                {clipPx > 28 && (
                                  <div
                                    className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full"
                                    style={{
                                      backgroundColor: person?.photoUrl
                                        ? undefined
                                        : `${sourceColor?.border || config.color}40`,
                                    }}
                                  >
                                    {person?.photoUrl ? (
                                      <img
                                        src={getMediaUrl(person.photoUrl)}
                                        alt={label}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span
                                        className="text-[7px] font-bold"
                                        style={{ color: sourceColor?.text || config.color }}
                                      >
                                        {label.slice(0, 2).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {clipPx > 70 && (
                                  <span
                                    className="truncate text-[9px] font-medium"
                                    style={{
                                      color: sourceColor?.text || config.color,
                                      maxWidth: clipPx - 32,
                                    }}
                                  >
                                    {label}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        : clip.duration * zoomLevel > 60 && (
                            <span
                              className="absolute top-1/2 left-2 -translate-y-1/2 truncate text-[9px] font-medium"
                              style={{
                                color: sourceColor?.text || config.color,
                                maxWidth: clip.duration * zoomLevel - 16,
                              }}
                            >
                              {isMulticamClip
                                ? sourceLabelMap.get(clip.assetId!) || "Camera"
                                : clip.type === "audio"
                                  ? "Audio"
                                  : clip.type}
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

                      {/* Override badge */}
                      {isOverrideClip && clipWidth > 20 && (
                        <div
                          className="absolute top-0.5 right-0.5 flex h-3 w-3 items-center justify-center rounded-sm"
                          style={{ backgroundColor: `${clipBorderColor}40` }}
                        >
                          <span className="text-[7px] font-bold" style={{ color: clipBorderColor }}>
                            M
                          </span>
                        </div>
                      )}

                      {/* Edge resize handles for speaker and override clips */}
                      {(isSpeakerClip || isOverrideClip) && !track.locked && (
                        <>
                          {/* Left edge handle */}
                          <div
                            className="group absolute top-0 bottom-0 left-0 z-10 cursor-ew-resize"
                            style={{ width: 6 }}
                            onMouseDown={(e) =>
                              handleEdgeResizeStart(e, track.id, clip.id, "start")
                            }
                          >
                            <div
                              className="absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-r-full opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ backgroundColor: clipBorderColor }}
                            />
                          </div>
                          {/* Right edge handle */}
                          <div
                            className="group absolute top-0 right-0 bottom-0 z-10 cursor-ew-resize"
                            style={{ width: 6 }}
                            onMouseDown={(e) => handleEdgeResizeStart(e, track.id, clip.id, "end")}
                          >
                            <div
                              className="absolute top-1/2 right-0 h-4 w-1 -translate-y-1/2 rounded-l-full opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ backgroundColor: clipBorderColor }}
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
                      {track.type === "captions"
                        ? "Captions auto-generated"
                        : track.type === "background"
                          ? "Background color"
                          : "Drop media here"}
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
