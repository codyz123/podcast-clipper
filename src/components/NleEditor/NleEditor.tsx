import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  PlayIcon,
  PauseIcon,
  ScissorsIcon,
  ResetIcon,
  PlusIcon,
  MinusIcon,
  CursorArrowIcon,
  TrackPreviousIcon,
  TrackNextIcon,
  DownloadIcon,
  MixerHorizontalIcon,
  VideoIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "../../stores/projectStore";
import { useNleStore } from "../../stores/nleStore";
import { useAuthStore } from "../../stores/authStore";
import { cn } from "../../lib/utils";
import { formatTimestamp } from "../../lib/formats";
import { mediaAssetKeys, fetchMediaAssets } from "../../lib/queries";
import type { NleTool, NleTrackType } from "../../lib/nleTypes";
import type { MediaItem } from "../../lib/types";
import { usePlaybackLoop } from "../../hooks/usePlaybackLoop";
import { getMediaUrl } from "../../lib/api";
import { ProgramMonitor } from "./ProgramMonitor";
import { InspectorPanel } from "./InspectorPanel";
import { Button } from "../ui";

// ============ Tool Definitions ============

const TOOLS: Array<{ id: NleTool; label: string; shortcut: string }> = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "razor", label: "Razor", shortcut: "C" },
  { id: "ripple", label: "Ripple Edit", shortcut: "B" },
  { id: "roll", label: "Roll Edit", shortcut: "N" },
  { id: "slip", label: "Slip", shortcut: "Y" },
  { id: "slide", label: "Slide", shortcut: "U" },
  { id: "hand", label: "Hand", shortcut: "H" },
  { id: "zoom", label: "Zoom", shortcut: "Z" },
  { id: "marker", label: "Marker", shortcut: "M" },
];

const TRACK_TYPES: Array<{ type: NleTrackType; label: string }> = [
  { type: "video-main", label: "Video" },
  { type: "video-overlay", label: "Video Overlay" },
  { type: "audio-main", label: "Audio" },
  { type: "audio-music", label: "Music" },
  { type: "audio-sfx", label: "Sound Effects" },
  { type: "captions", label: "Captions" },
  { type: "text-graphics", label: "Text / Graphics" },
];

// ============ Helpers ============

function getRulerInterval(zoomLevel: number): number {
  if (zoomLevel >= 50) return 1;
  if (zoomLevel >= 20) return 5;
  if (zoomLevel >= 10) return 10;
  if (zoomLevel >= 5) return 30;
  if (zoomLevel >= 2) return 60;
  return 300;
}

function getTrackColor(type: NleTrackType): string {
  switch (type) {
    case "video-main":
      return "hsl(210 70% 40% / 0.7)";
    case "video-overlay":
      return "hsl(260 60% 45% / 0.7)";
    case "audio-main":
      return "hsl(140 50% 35% / 0.7)";
    case "audio-music":
      return "hsl(30 60% 40% / 0.7)";
    case "audio-sfx":
      return "hsl(50 60% 40% / 0.7)";
    case "captions":
      return "hsl(190 50% 40% / 0.7)";
    case "text-graphics":
      return "hsl(320 50% 40% / 0.7)";
    default:
      return "hsl(0 0% 40% / 0.7)";
  }
}

/** Map a MediaItem to the NLE item type based on its contentType/source */
function resolveItemType(item: MediaItem): "video" | "audio" | "image" {
  if (item.source === "episode-audio") return "audio";
  if (item.contentType?.startsWith("audio")) return "audio";
  if (item.contentType?.startsWith("image")) return "image";
  return "video";
}

// ============ Main Component ============

export const NleEditor: React.FC = () => {
  const { currentProject } = useProjectStore();
  const currentPodcastId = useAuthStore((s) => s.currentPodcastId);

  const {
    timeline,
    isLoading,
    isDirty,
    saveError,
    currentTime,
    isPlaying,
    playbackSpeed,
    inPoint,
    outPoint,
    zoomLevel,
    selectedTrackIds,
    selectedItemIds,
    activeTool,
    snapEnabled,
    multicamRecordMode,
    undoStack,
    redoStack,
    renderStatus,
    renderProgress,
    loadTimeline,
    initTimeline,
    saveTimeline,
    setCurrentTime,
    togglePlayback,
    setPlaybackSpeed,
    setInPoint,
    setOutPoint,
    clearInOutPoints,
    zoomIn,
    zoomOut,
    setActiveTool,
    setSnapEnabled,
    addTrack,
    updateTrack,
    addItem,
    updateItem,
    moveItem,
    removeTrack,
    setSelectedItemIds,
    setSelectedTrackIds,
    undo,
    redo,
    resetStore,
  } = useNleStore();

  // Panel collapse states
  const [projectPanelOpen, setProjectPanelOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showAddTrackMenu, setShowAddTrackMenu] = useState(false);

  // Resizable timeline height
  const [timelineHeight, setTimelineHeight] = useState(280);
  const isDraggingDivider = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref for the scrollable timeline content area (needed for accurate position calculations)
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  // Ref for track headers (vertical scroll sync with timeline content)
  const trackHeadersRef = useRef<HTMLDivElement>(null);

  // Drag-over visual state: track ID being hovered during drag (from Project Panel)
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const dragEnterCountRef = useRef<Record<string, number>>({});

  // Source Monitor: which media item is being previewed
  const [selectedMediaItemId, setSelectedMediaItemId] = useState<string | null>(null);

  // Clipboard for copy/paste
  const clipboardRef = useRef<import("../../lib/nleTypes").NleTimelineItem[]>([]);

  // ---- Item drag-to-move + edge-trim state ----
  const itemDragRef = useRef<{
    type: "move" | "trim-left" | "trim-right";
    itemId: string;
    trackId: string;
    startMouseX: number;
    originalStartTime: number;
    originalDuration: number;
    originalSourceIn: number;
    originalSourceOut: number;
    originalSpeed: number;
  } | null>(null);
  const dragGhostRef = useRef<{ itemId: string; left: number; width: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    itemId: string;
    left: number;
    width: number;
  } | null>(null);

  // ---- Playhead scrub state ----
  const isScrubbing = useRef(false);
  const wasPlayingBeforeScrub = useRef(false);

  const episodeId = currentProject?.id;
  const podcastId = currentPodcastId;
  const duration = timeline?.duration ?? 0;

  // ---- Fetch media assets for Project Panel ----
  const { data: mediaItems = [], isLoading: isLoadingMedia } = useQuery({
    queryKey: mediaAssetKeys.all(podcastId ?? "", episodeId ?? ""),
    queryFn: () => fetchMediaAssets(podcastId!, episodeId!),
    enabled: !!podcastId && !!episodeId,
  });

  // ---- Build URL lookup map: mediaSourceId → playable URL ----
  const mediaUrlMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of mediaItems) {
      const rawUrl = item.proxyBlobUrl || item.blobUrl;
      const resolved = getMediaUrl(rawUrl);
      if (resolved && item.sourceId) {
        map.set(item.sourceId, resolved);
      }
    }
    return map;
  }, [mediaItems]);

  // ---- Build name lookup map: mediaSourceId → display name ----
  const mediaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of mediaItems) {
      if (item.sourceId) map.set(item.sourceId, item.name);
    }
    return map;
  }, [mediaItems]);

  // ---- Selected media item for Source Monitor ----
  const selectedMediaItem = mediaItems.find((m) => m.id === selectedMediaItemId) ?? null;

  // ---- Load timeline on mount ----
  useEffect(() => {
    if (!podcastId || !episodeId) return;
    loadTimeline(podcastId, episodeId);
    return () => resetStore();
  }, [podcastId, episodeId, loadTimeline, resetStore]);

  // ---- Autosave (2s debounce) ----
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeline();
    }, 2000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [isDirty, saveTimeline]);

  // Flush save on unmount
  useEffect(() => {
    return () => {
      const { isDirty: dirty } = useNleStore.getState();
      if (dirty) useNleStore.getState().saveTimeline();
    };
  }, []);

  // ---- Close add-track menu on outside click ----
  useEffect(() => {
    if (!showAddTrackMenu) return;
    const close = () => setShowAddTrackMenu(false);
    // Use setTimeout to avoid closing on the same click that opened it
    const timer = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", close);
    };
  }, [showAddTrackMenu]);

  // ---- Playback loop: advance currentTime while playing ----
  usePlaybackLoop();

  // ---- Timeline auto-scroll to follow playhead during playback ----
  useEffect(() => {
    if (!isPlaying) return;
    const container = timelineScrollRef.current;
    if (!container) return;
    const playheadX = currentTime * zoomLevel;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    // If playhead is near the right edge or off-screen, scroll to keep it at 25% from right
    if (playheadX > viewRight - 60 || playheadX < viewLeft) {
      container.scrollLeft = playheadX - container.clientWidth * 0.25;
    }
  }, [isPlaying, currentTime, zoomLevel]);

  // ---- Item drag-to-move / edge-trim global handlers ----
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Playhead scrub
      if (isScrubbing.current) {
        const container = timelineScrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const x = e.clientX - rect.left + scrollLeft;
        const time = Math.max(0, Math.min(duration, x / zoomLevel));
        setCurrentTime(time);
        return;
      }

      // Item drag/trim
      const drag = itemDragRef.current;
      if (!drag) return;
      const deltaX = e.clientX - drag.startMouseX;
      const deltaTime = deltaX / zoomLevel;

      let ghost: { itemId: string; left: number; width: number } | null = null;
      if (drag.type === "move") {
        const newStart = Math.max(0, drag.originalStartTime + deltaTime);
        const newLeft = newStart * zoomLevel;
        const width = drag.originalDuration * zoomLevel;
        ghost = { itemId: drag.itemId, left: newLeft, width };
      } else if (drag.type === "trim-left") {
        const maxDelta = drag.originalDuration - 0.1;
        const clampedDelta = Math.max(-drag.originalStartTime, Math.min(maxDelta, deltaTime));
        const newStart = drag.originalStartTime + clampedDelta;
        const newDuration = drag.originalDuration - clampedDelta;
        ghost = { itemId: drag.itemId, left: newStart * zoomLevel, width: newDuration * zoomLevel };
      } else if (drag.type === "trim-right") {
        const newDuration = Math.max(0.1, drag.originalDuration + deltaTime);
        const left = drag.originalStartTime * zoomLevel;
        ghost = { itemId: drag.itemId, left, width: newDuration * zoomLevel };
      }
      // Update both ref (for mouseup) and state (for rendering)
      dragGhostRef.current = ghost;
      setDragGhost(ghost);
    };

    const handleMouseUp = () => {
      // Playhead scrub end
      if (isScrubbing.current) {
        isScrubbing.current = false;
        if (wasPlayingBeforeScrub.current) {
          useNleStore.getState().setIsPlaying(true);
          wasPlayingBeforeScrub.current = false;
        }
        return;
      }

      // Item drag/trim commit — read from ref, not closure state
      const drag = itemDragRef.current;
      if (!drag) return;
      const ghost = dragGhostRef.current;
      itemDragRef.current = null;
      dragGhostRef.current = null;
      setDragGhost(null);
      if (!ghost) return;

      if (drag.type === "move") {
        const newStartTime = ghost.left / zoomLevel;
        moveItem(drag.itemId, newStartTime);
      } else if (drag.type === "trim-left") {
        const newStartTime = ghost.left / zoomLevel;
        const newDuration = ghost.width / zoomLevel;
        const clampedDelta = newStartTime - drag.originalStartTime;
        const newSourceIn = drag.originalSourceIn + clampedDelta * drag.originalSpeed;
        updateItem(drag.itemId, {
          startTime: newStartTime,
          duration: newDuration,
          sourceIn: Math.max(0, newSourceIn),
        });
      } else if (drag.type === "trim-right") {
        const newDuration = ghost.width / zoomLevel;
        const newSourceOut =
          drag.originalSourceOut + (newDuration - drag.originalDuration) * drag.originalSpeed;
        updateItem(drag.itemId, {
          duration: newDuration,
          sourceOut: newSourceOut,
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [duration, zoomLevel, setCurrentTime, moveItem, updateItem]);

  // ---- Handlers for starting item drag/trim ----
  const handleItemMouseDown = useCallback(
    (
      e: React.MouseEvent,
      item: import("../../lib/nleTypes").NleTimelineItem,
      trackLocked: boolean
    ) => {
      if (trackLocked || activeTool === "razor") return; // Let click handler deal with razor

      const rect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const edgeThreshold = 6; // pixels from edge to trigger trim

      let type: "move" | "trim-left" | "trim-right" = "move";
      if (localX <= edgeThreshold) type = "trim-left";
      else if (rect.width - localX <= edgeThreshold) type = "trim-right";

      itemDragRef.current = {
        type,
        itemId: item.id,
        trackId: item.trackId,
        startMouseX: e.clientX,
        originalStartTime: item.startTime,
        originalDuration: item.duration,
        originalSourceIn: item.sourceIn,
        originalSourceOut: item.sourceOut,
        originalSpeed: item.speed,
      };

      e.preventDefault(); // Prevent text selection
      e.stopPropagation(); // Prevent track background click
    },
    [activeTool]
  );

  // ---- Playhead scrub start ----
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const time = getTimeFromClickX(e);
      setCurrentTime(time);

      // If playing, pause during scrub and resume on mouseup
      if (isPlaying) {
        wasPlayingBeforeScrub.current = true;
        useNleStore.getState().setIsPlaying(false);
      }
      isScrubbing.current = true;
      e.preventDefault();
    },
    [isPlaying, setCurrentTime]
  );

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      const key = e.key.toLowerCase();
      const meta = e.metaKey || e.ctrlKey;

      // Undo/Redo
      if (meta && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (meta && key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      // Copy
      if (meta && key === "c") {
        e.preventDefault();
        const state = useNleStore.getState();
        if (!state.timeline || state.selectedItemIds.length === 0) return;
        const items = state.timeline.tracks
          .flatMap((t) => t.items)
          .filter((i) => state.selectedItemIds.includes(i.id));
        clipboardRef.current = items.map((i) => ({ ...i }));
        return;
      }

      // Paste
      if (meta && key === "v") {
        e.preventDefault();
        if (clipboardRef.current.length === 0) return;
        const state = useNleStore.getState();
        const earliest = Math.min(...clipboardRef.current.map((i) => i.startTime));
        const offset = state.currentTime - earliest;
        for (const orig of clipboardRef.current) {
          const newItem = { ...orig, id: crypto.randomUUID(), startTime: orig.startTime + offset };
          state.addItem(newItem.trackId, newItem);
        }
        return;
      }

      // Cut
      if (meta && key === "x") {
        e.preventDefault();
        const state = useNleStore.getState();
        if (!state.timeline || state.selectedItemIds.length === 0) return;
        const items = state.timeline.tracks
          .flatMap((t) => t.items)
          .filter((i) => state.selectedItemIds.includes(i.id));
        clipboardRef.current = items.map((i) => ({ ...i }));
        const lockedTrackIds = new Set(
          state.timeline.tracks.filter((t) => t.locked).map((t) => t.id)
        );
        for (const item of items) {
          if (!lockedTrackIds.has(item.trackId)) state.removeItem(item.id);
        }
        state.setSelectedItemIds([]);
        return;
      }

      // Clear in/out points
      if (e.altKey && key === "x") {
        e.preventDefault();
        clearInOutPoints();
        return;
      }

      // Delete selected items
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        const state = useNleStore.getState();
        const selected = state.selectedItemIds;
        if (selected.length === 0) return;
        // Filter out items on locked tracks
        const tl = state.timeline;
        if (!tl) return;
        const lockedTrackIds = new Set(tl.tracks.filter((t) => t.locked).map((t) => t.id));
        for (const id of selected) {
          // Check if this item is on a locked track
          const isLocked = tl.tracks.some(
            (t) => lockedTrackIds.has(t.id) && t.items.some((i) => i.id === id)
          );
          if (!isLocked) {
            state.removeItem(id);
          }
        }
        state.setSelectedItemIds([]);
        return;
      }

      // Transport
      if (key === " " || key === "k") {
        e.preventDefault();
        togglePlayback();
        return;
      }
      if (key === "arrowleft") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        setCurrentTime(Math.max(0, currentTime - step));
        return;
      }
      if (key === "arrowright") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        setCurrentTime(Math.min(duration, currentTime + step));
        return;
      }
      if (key === "home") {
        e.preventDefault();
        setCurrentTime(0);
        return;
      }
      if (key === "end") {
        e.preventDefault();
        setCurrentTime(duration);
        return;
      }

      // Mark in/out
      if (key === "i") {
        e.preventDefault();
        setInPoint(currentTime);
        return;
      }
      if (key === "o") {
        e.preventDefault();
        setOutPoint(currentTime);
        return;
      }

      // Tools (guard with !meta so Cmd+C/Cmd+V etc. are not intercepted)
      if (!meta && key === "v") {
        setActiveTool("select");
        return;
      }
      if (!meta && key === "c") {
        setActiveTool("razor");
        return;
      }
      if (!meta && key === "b") {
        setActiveTool("ripple");
        return;
      }
      if (!meta && key === "n") {
        setActiveTool("roll");
        return;
      }
      if (!meta && key === "y") {
        setActiveTool("slip");
        return;
      }
      if (!meta && key === "u") {
        setActiveTool("slide");
        return;
      }
      if (!meta && key === "h") {
        setActiveTool("hand");
        return;
      }
      if (!meta && key === "z") {
        setActiveTool("zoom");
        return;
      }
      if (!meta && key === "m") {
        setActiveTool("marker");
        return;
      }

      // Snap
      if (!meta && key === "s") {
        setSnapEnabled(!snapEnabled);
        return;
      }

      // Zoom (guard with !meta so Cmd+=/Cmd+- browser zoom is not intercepted)
      if (!meta && (key === "=" || key === "+")) {
        zoomIn();
        return;
      }
      if (!meta && key === "-") {
        zoomOut();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentTime,
    duration,
    snapEnabled,
    togglePlayback,
    setCurrentTime,
    setInPoint,
    setOutPoint,
    clearInOutPoints,
    setActiveTool,
    setSnapEnabled,
    zoomIn,
    zoomOut,
    undo,
    redo,
  ]);

  // ---- Timeline divider drag ----
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingDivider.current = true;

      const startY = e.clientY;
      const startHeight = timelineHeight;

      const onMove = (me: MouseEvent) => {
        if (!isDraggingDivider.current) return;
        const delta = startY - me.clientY;
        setTimelineHeight(Math.max(120, Math.min(600, startHeight + delta)));
      };

      const onUp = () => {
        isDraggingDivider.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [timelineHeight]
  );

  // ---- Handle init timeline ----
  const handleInitTimeline = useCallback(() => {
    if (!podcastId || !episodeId) return;
    initTimeline(podcastId, episodeId);
  }, [podcastId, episodeId, initTimeline]);

  // ---- Playback speed cycle ----
  const speeds = [0.25, 0.5, 1, 1.5, 2];
  const handleSpeedCycle = useCallback(() => {
    const idx = speeds.indexOf(playbackSpeed);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackSpeed(next);
  }, [playbackSpeed, setPlaybackSpeed]);

  // ---- Format timecode ----
  const formatTimecode = useCallback(
    (seconds: number) => {
      const fps = timeline?.fps ?? 30;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const f = Math.floor((seconds % 1) * fps);
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
    },
    [timeline?.fps]
  );

  // ---- Calculate time from click position on timeline ----
  const getTimeFromClickX = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
      const clickX = e.clientX - rect.left + scrollLeft;
      return Math.max(0, Math.min(duration, clickX / zoomLevel));
    },
    [duration, zoomLevel]
  );

  // ---- Handle timeline item click ----
  const handleItemClick = useCallback(
    (e: React.MouseEvent, itemId: string, trackLocked: boolean) => {
      e.stopPropagation();

      if (activeTool === "razor") {
        if (trackLocked) return;
        // Set playhead at click position and split
        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
        const clickX = e.clientX - rect.left + scrollLeft;
        const time = Math.max(0, clickX / zoomLevel);
        setCurrentTime(time);
        // Need a microtask so currentTime updates before split reads it
        queueMicrotask(() => {
          useNleStore.getState().splitItemAtPlayhead(itemId);
        });
        return;
      }

      // Select tool: click to select, shift+click to multi-select
      if (e.shiftKey) {
        const current = useNleStore.getState().selectedItemIds;
        if (current.includes(itemId)) {
          setSelectedItemIds(current.filter((id) => id !== itemId));
        } else {
          setSelectedItemIds([...current, itemId]);
        }
      } else {
        setSelectedItemIds([itemId]);
      }
      setSelectedTrackIds([]);
    },
    [activeTool, zoomLevel, setCurrentTime, setSelectedItemIds, setSelectedTrackIds]
  );

  // ---- Handle track header click ----
  const handleTrackHeaderClick = useCallback(
    (trackId: string) => {
      setSelectedTrackIds([trackId]);
      setSelectedItemIds([]);
    },
    [setSelectedTrackIds, setSelectedItemIds]
  );

  // ---- Handle drop on track row ----
  const handleTrackDrop = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.preventDefault();
      setDragOverTrackId(null);
      dragEnterCountRef.current[trackId] = 0;

      const raw = e.dataTransfer.getData("application/x-nle-media");
      if (!raw) return;

      try {
        const mediaItem: MediaItem = JSON.parse(raw);
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
        const dropX = e.clientX - rect.left + scrollLeft;
        const startTime = Math.max(0, dropX / zoomLevel);

        const itemType = resolveItemType(mediaItem);
        const itemDuration = mediaItem.durationSeconds ?? 5; // Default 5s for images

        addItem(trackId, {
          type: itemType,
          startTime,
          duration: itemDuration,
          sourceIn: 0,
          sourceOut: itemDuration,
          mediaSourceId: mediaItem.sourceId,
          mediaSourceType: mediaItem.source as
            | "video-source"
            | "media-asset"
            | "episode-audio"
            | "branding",
          resolvedUrl: getMediaUrl(mediaItem.proxyBlobUrl || mediaItem.blobUrl),
        });
      } catch {
        // Invalid drag data, ignore
      }
    },
    [zoomLevel, addItem]
  );

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[hsl(var(--bg-primary))]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--cyan))]" />
          <p className="text-sm text-[hsl(var(--text-secondary))]">Loading timeline...</p>
        </div>
      </div>
    );
  }

  // ---- No timeline state ----
  if (!timeline) {
    return (
      <div className="flex h-full items-center justify-center bg-[hsl(var(--bg-primary))]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--surface))]">
            <VideoIcon className="h-8 w-8 text-[hsl(var(--text-muted))]" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--text-primary))]">
            Episode Editor
          </h2>
          <p className="mb-4 max-w-sm text-sm text-[hsl(var(--text-secondary))]">
            {currentProject?.audioPath || (currentProject?.videoSources?.length ?? 0) > 0
              ? "Initialize a timeline from your episode media to start editing."
              : "Upload audio or video in the Production step first."}
          </p>
          {(currentProject?.audioPath || (currentProject?.videoSources?.length ?? 0) > 0) && (
            <Button onClick={handleInitTimeline}>Initialize Timeline</Button>
          )}
          {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
        </div>
      </div>
    );
  }

  // ---- Group media items by category ----
  const mediaByCategory = mediaItems.reduce<Record<string, MediaItem[]>>((acc, item) => {
    const cat = item.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // ---- Main Editor Layout ----
  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col overflow-hidden bg-[hsl(var(--bg-primary))]"
    >
      {/* ===== Top Toolbar ===== */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))] px-3">
        {/* Left: Tools */}
        <div className="flex items-center gap-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-xs transition-colors",
                activeTool === tool.id
                  ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
                  : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text-secondary))]"
              )}
            >
              {tool.id === "select" && <CursorArrowIcon className="h-3.5 w-3.5" />}
              {tool.id === "razor" && <ScissorsIcon className="h-3.5 w-3.5" />}
              {tool.id !== "select" && tool.id !== "razor" && (
                <span className="text-[10px] font-medium uppercase">{tool.shortcut}</span>
              )}
            </button>
          ))}

          <div className="mx-2 h-4 w-px bg-[hsl(var(--border))]" />

          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo (Cmd+Z)"
            className="flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))] disabled:opacity-30"
          >
            <ResetIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo (Cmd+Shift+Z)"
            className="flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))] disabled:opacity-30"
          >
            <ResetIcon className="h-3.5 w-3.5 -scale-x-100" />
          </button>
        </div>

        {/* Center: Sequence name + save status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[hsl(var(--text-primary))]">
            {currentProject?.name || "Untitled Episode"}
          </span>
          {isDirty && <span className="text-[10px] text-[hsl(var(--text-muted))]">Unsaved</span>}
          {saveError && <span className="text-[10px] text-red-400">Save failed</span>}
        </div>

        {/* Right: Export + panels */}
        <div className="flex items-center gap-1">
          {renderStatus === "rendering" && (
            <div className="mr-2 flex items-center gap-1.5">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[hsl(var(--surface))]">
                <div
                  className="h-full rounded-full bg-[hsl(var(--cyan))] transition-all"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <span className="text-[10px] text-[hsl(var(--text-muted))]">{renderProgress}%</span>
            </div>
          )}
          <button
            onClick={() => setProjectPanelOpen(!projectPanelOpen)}
            title="Toggle Project Panel"
            className={cn(
              "flex h-7 items-center justify-center rounded px-2 text-xs transition-colors",
              projectPanelOpen
                ? "bg-[hsl(var(--surface))] text-[hsl(var(--text-secondary))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))]"
            )}
          >
            <FileIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            title="Toggle Inspector"
            className={cn(
              "flex h-7 items-center justify-center rounded px-2 text-xs transition-colors",
              inspectorOpen
                ? "bg-[hsl(var(--surface))] text-[hsl(var(--text-secondary))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))]"
            )}
          >
            <MixerHorizontalIcon className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-[hsl(var(--border))]" />
          <Button
            className="h-7 text-xs"
            title="Export Episode"
            onClick={() =>
              alert(
                "Episode export is not yet available. Use the Publish step to render individual clips."
              )
            }
          >
            <DownloadIcon className="mr-1 h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* ===== Monitor + Panels Area ===== */}
      <div className="flex min-h-0 flex-1">
        {/* Project Panel (left sidebar) — shows all episode media assets */}
        {projectPanelOpen && (
          <div className="flex w-56 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))]">
            <div className="flex h-8 items-center justify-between border-b border-[hsl(var(--border))] px-3">
              <span className="text-[11px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
                Project
              </span>
              <span className="text-[10px] text-[hsl(var(--text-muted))]">
                {mediaItems.length} items
              </span>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {isLoadingMedia ? (
                <div className="mt-8 text-center">
                  <div className="mx-auto mb-2 h-4 w-4 animate-spin rounded-full border border-[hsl(var(--border))] border-t-[hsl(var(--cyan))]" />
                  <p className="text-xs text-[hsl(var(--text-muted))]">Loading media...</p>
                </div>
              ) : mediaItems.length === 0 ? (
                <div className="mt-8 text-center">
                  <p className="text-xs text-[hsl(var(--text-muted))]">No media items</p>
                  <p className="mt-1 text-[10px] text-[hsl(var(--text-muted))]">
                    Upload media in the Production step
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {Object.entries(mediaByCategory).map(([category, items]) => (
                    <div key={category} className="mb-2">
                      <div className="mb-1 text-[10px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
                        {category.replace(/-/g, " ")}
                      </div>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-nle-media", JSON.stringify(item));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => setSelectedMediaItemId(item.id)}
                          className={cn(
                            "flex cursor-grab items-center gap-2 rounded px-2 py-1.5 text-xs text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface))] active:cursor-grabbing",
                            selectedMediaItemId === item.id && "bg-[hsl(var(--surface))]"
                          )}
                        >
                          <div className="h-6 w-10 shrink-0 overflow-hidden rounded bg-[hsl(var(--surface))]">
                            {item.thumbnailUrl ? (
                              <img
                                src={getMediaUrl(item.thumbnailUrl)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate">{item.name}</span>
                          </div>
                          <span className="shrink-0 text-[10px] text-[hsl(var(--text-muted))]">
                            {item.durationSeconds ? formatTimestamp(item.durationSeconds) : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Monitors Area (center) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {/* Source Monitor */}
            <div className="flex flex-1 flex-col border-r border-[hsl(var(--border))]">
              <div className="flex h-8 items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))] px-3">
                <span className="text-[11px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
                  Source
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center bg-black">
                {selectedMediaItem ? (
                  selectedMediaItem.contentType?.startsWith("video") ? (
                    <video
                      key={selectedMediaItem.id}
                      src={getMediaUrl(selectedMediaItem.proxyBlobUrl || selectedMediaItem.blobUrl)}
                      controls
                      className="max-h-full max-w-full"
                    />
                  ) : selectedMediaItem.contentType?.startsWith("audio") ? (
                    <audio
                      key={selectedMediaItem.id}
                      src={getMediaUrl(selectedMediaItem.proxyBlobUrl || selectedMediaItem.blobUrl)}
                      controls
                      className="w-full px-4"
                    />
                  ) : selectedMediaItem.contentType?.startsWith("image") ? (
                    <img
                      key={selectedMediaItem.id}
                      src={getMediaUrl(selectedMediaItem.proxyBlobUrl || selectedMediaItem.blobUrl)}
                      alt={selectedMediaItem.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-xs text-neutral-500">Unsupported media type</p>
                  )
                ) : (
                  <p className="text-xs text-neutral-500">
                    {multicamRecordMode ? "Multicam Record Mode" : "Select media to preview"}
                  </p>
                )}
              </div>
            </div>

            {/* Program Monitor */}
            <div className="flex flex-1 flex-col">
              <div className="flex h-8 items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))] px-3">
                <span className="text-[11px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
                  Program
                </span>
                <span className="ml-auto font-mono text-[11px] text-[hsl(var(--text-muted))]">
                  {formatTimecode(currentTime)}
                </span>
              </div>
              <div className="relative flex-1 overflow-hidden bg-black">
                {timeline ? (
                  <ProgramMonitor
                    timeline={timeline}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    playbackSpeed={playbackSpeed}
                    mediaUrlMap={mediaUrlMap}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs text-neutral-500">No timeline loaded</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inspector Panel (right sidebar) */}
        {inspectorOpen && (
          <div className="flex w-64 shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))]">
            <div className="flex h-8 items-center justify-between border-b border-[hsl(var(--border))] px-3">
              <span className="text-[11px] font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
                Inspector
              </span>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <InspectorPanel />
            </div>
          </div>
        )}
      </div>

      {/* ===== Timeline Divider (drag to resize) ===== */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-[hsl(var(--bg-secondary))] hover:bg-[hsl(var(--cyan)/0.2)]"
      >
        <div className="h-px w-8 rounded-full bg-[hsl(var(--border))]" />
      </div>

      {/* ===== Timeline Toolbar ===== */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))] px-3">
        {/* Left: Add track + markers */}
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowAddTrackMenu(!showAddTrackMenu)}
            title="Add Track"
            className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text-secondary))]"
          >
            <PlusIcon className="h-3 w-3" />
            Track
          </button>
          {showAddTrackMenu && (
            <div className="absolute top-full left-0 z-50 mt-1 w-44 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))] py-1 shadow-lg">
              {TRACK_TYPES.map((tt) => (
                <button
                  key={tt.type}
                  onClick={() => {
                    addTrack(tt.type, tt.label);
                    setShowAddTrackMenu(false);
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-xs text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface))]"
                >
                  {tt.label}
                </button>
              ))}
            </div>
          )}

          <div className="mx-1 h-4 w-px bg-[hsl(var(--border))]" />

          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            title={`Snap ${snapEnabled ? "On" : "Off"} (S)`}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors",
              snapEnabled
                ? "bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))]"
            )}
          >
            Snap
          </button>
        </div>

        {/* Center: Transport */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentTime(0)}
            title="Go to Start (Home)"
            className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))]"
          >
            <TrackPreviousIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={togglePlayback}
            title={`${isPlaying ? "Pause" : "Play"} (Space)`}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--cyan))] text-[hsl(var(--bg-primary))] transition-colors hover:bg-[hsl(var(--cyan)/0.8)]"
          >
            {isPlaying ? (
              <PauseIcon className="h-3.5 w-3.5" />
            ) : (
              <PlayIcon className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => setCurrentTime(duration)}
            title="Go to End (End)"
            className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))]"
          >
            <TrackNextIcon className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1 h-4 w-px bg-[hsl(var(--border))]" />

          {/* Timecode */}
          <span className="font-mono text-xs text-[hsl(var(--text-primary))]">
            {formatTimecode(currentTime)}
          </span>
          <span className="text-[10px] text-[hsl(var(--text-muted))]">
            / {formatTimecode(duration)}
          </span>

          <div className="mx-1 h-4 w-px bg-[hsl(var(--border))]" />

          {/* Speed */}
          <button
            onClick={handleSpeedCycle}
            title="Playback Speed"
            className="flex h-6 items-center rounded px-1.5 text-[11px] text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))]"
          >
            {playbackSpeed}x
          </button>
        </div>

        {/* Right: Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            title="Zoom Out (-)"
            className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))]"
          >
            <MinusIcon className="h-3 w-3" />
          </button>
          <div className="flex h-1 w-16 items-center">
            <div className="relative h-full w-full rounded-full bg-[hsl(var(--surface))]">
              <div
                className="absolute h-full rounded-full bg-[hsl(var(--text-muted))]"
                style={{ width: `${((zoomLevel - 1) / 99) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={zoomIn}
            title="Zoom In (+)"
            className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))]"
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ===== Timeline Area ===== */}
      <div
        className="shrink-0 overflow-hidden bg-[hsl(var(--bg-primary))]"
        style={{ height: timelineHeight }}
      >
        {timeline.tracks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-[hsl(var(--text-muted))]">
                No tracks yet. Click "+ Track" to add one.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full">
            {/* Track Headers */}
            <div
              ref={trackHeadersRef}
              className="w-40 shrink-0 overflow-y-auto border-r border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))]"
              onScroll={(e) => {
                const contentEl = timelineScrollRef.current;
                if (contentEl) contentEl.scrollTop = e.currentTarget.scrollTop;
              }}
            >
              {/* Spacer matching the time ruler height */}
              <div className="sticky top-0 z-10 h-6 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))]" />
              {[...timeline.tracks]
                .sort((a, b) => a.order - b.order)
                .map((track) => (
                  <div
                    key={track.id}
                    onClick={() => handleTrackHeaderClick(track.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 border-b border-[hsl(var(--border))] px-2",
                      selectedTrackIds.includes(track.id)
                        ? "bg-[hsl(var(--cyan)/0.05)]"
                        : "hover:bg-[hsl(var(--surface)/0.3)]"
                    )}
                    style={{ height: track.height }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[11px] font-medium text-[hsl(var(--text-secondary))]">
                        {track.name}
                      </span>
                      <span className="text-[9px] text-[hsl(var(--text-muted))] uppercase">
                        {track.type.replace(/-/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {/* Mute button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTrack(track.id, { muted: !track.muted });
                        }}
                        title={track.muted ? "Unmute" : "Mute"}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded text-[9px] transition-colors",
                          track.muted
                            ? "bg-red-400/20 text-red-400"
                            : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-secondary))]"
                        )}
                      >
                        M
                      </button>
                      {/* Solo button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTrack(track.id, { solo: !track.solo });
                        }}
                        title={track.solo ? "Unsolo" : "Solo"}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded text-[9px] transition-colors",
                          track.solo
                            ? "bg-yellow-400/20 text-yellow-400"
                            : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-secondary))]"
                        )}
                      >
                        S
                      </button>
                      {/* Lock button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTrack(track.id, { locked: !track.locked });
                        }}
                        title={track.locked ? "Unlock" : "Lock"}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded text-[9px] transition-colors",
                          track.locked
                            ? "bg-[hsl(var(--cyan)/0.2)] text-[hsl(var(--cyan))]"
                            : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-secondary))]"
                        )}
                      >
                        L
                      </button>
                      {/* Delete track button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            track.items.length > 0 &&
                            !window.confirm(
                              `Delete "${track.name}" and its ${track.items.length} item${track.items.length > 1 ? "s" : ""}?`
                            )
                          )
                            return;
                          removeTrack(track.id);
                        }}
                        title="Delete Track"
                        className="flex h-5 w-5 items-center justify-center rounded text-[9px] text-[hsl(var(--text-muted))] transition-colors hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* Timeline Content (scrollable) */}
            <div
              ref={timelineScrollRef}
              className="flex-1 overflow-auto"
              onScroll={(e) => {
                const headerEl = trackHeadersRef.current;
                if (headerEl) headerEl.scrollTop = e.currentTarget.scrollTop;
              }}
            >
              {/* Time Ruler */}
              <div className="sticky top-0 z-10 h-6 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))]">
                <div
                  className="relative h-full cursor-pointer"
                  style={{ width: `${duration * zoomLevel}px`, minWidth: "100%" }}
                  onMouseDown={handleRulerMouseDown}
                >
                  {/* Ruler marks */}
                  {Array.from(
                    { length: Math.ceil(duration / getRulerInterval(zoomLevel)) + 1 },
                    (_, i) => {
                      const time = i * getRulerInterval(zoomLevel);
                      if (time > duration) return null;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 h-full border-l border-[hsl(var(--border)/0.5)]"
                          style={{ left: `${time * zoomLevel}px` }}
                        >
                          <span className="ml-1 text-[9px] text-[hsl(var(--text-muted))]">
                            {formatTimestamp(time)}
                          </span>
                        </div>
                      );
                    }
                  )}

                  {/* Playhead on ruler */}
                  <div
                    className="absolute top-0 z-20 h-full w-0.5 bg-[hsl(var(--cyan))]"
                    style={{ left: `${currentTime * zoomLevel}px` }}
                  >
                    <div
                      className="absolute -top-0.5 -left-1 h-2 w-2.5 bg-[hsl(var(--cyan))]"
                      style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
                    />
                  </div>

                  {/* In/Out markers */}
                  {inPoint !== null && (
                    <div
                      className="absolute top-0 h-full w-0.5 bg-yellow-400"
                      style={{ left: `${inPoint * zoomLevel}px` }}
                    />
                  )}
                  {outPoint !== null && (
                    <div
                      className="absolute top-0 h-full w-0.5 bg-yellow-400"
                      style={{ left: `${outPoint * zoomLevel}px` }}
                    />
                  )}
                  {inPoint !== null && outPoint !== null && (
                    <div
                      className="absolute top-0 h-full bg-yellow-400/10"
                      style={{
                        left: `${Math.min(inPoint, outPoint) * zoomLevel}px`,
                        width: `${Math.abs(outPoint - inPoint) * zoomLevel}px`,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Track rows */}
              {[...timeline.tracks]
                .sort((a, b) => a.order - b.order)
                .map((track) => (
                  <div
                    key={track.id}
                    className={cn(
                      "relative border-b border-[hsl(var(--border)/0.3)]",
                      track.locked ? "opacity-60" : "",
                      dragOverTrackId === track.id && !track.locked
                        ? "ring-1 ring-[hsl(var(--cyan)/0.5)] ring-inset"
                        : ""
                    )}
                    style={{
                      height: track.height,
                      width: `${duration * zoomLevel}px`,
                      minWidth: "100%",
                    }}
                    // Click on empty track background to seek
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        const time = getTimeFromClickX(e);
                        setCurrentTime(time);
                      }
                    }}
                    // Drag-and-drop handlers
                    onDragOver={(e) => {
                      if (!track.locked) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (track.locked) return;
                      const count = (dragEnterCountRef.current[track.id] ?? 0) + 1;
                      dragEnterCountRef.current[track.id] = count;
                      if (count === 1) setDragOverTrackId(track.id);
                    }}
                    onDragLeave={() => {
                      const count = (dragEnterCountRef.current[track.id] ?? 0) - 1;
                      dragEnterCountRef.current[track.id] = Math.max(0, count);
                      if (count <= 0) {
                        setDragOverTrackId((prev) => (prev === track.id ? null : prev));
                      }
                    }}
                    onDrop={(e) => handleTrackDrop(e, track.id)}
                  >
                    {/* Items */}
                    {track.items.map((item) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const trackColor = getTrackColor(track.type);
                      return (
                        <div
                          key={item.id}
                          onClick={(e) => handleItemClick(e, item.id, track.locked)}
                          onMouseDown={(e) => handleItemMouseDown(e, item, track.locked)}
                          onMouseMove={(e) => {
                            if (track.locked || activeTool === "razor") return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const localX = e.clientX - rect.left;
                            const isEdge = localX <= 6 || rect.width - localX <= 6;
                            e.currentTarget.style.cursor = isEdge ? "col-resize" : "";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.cursor = "";
                          }}
                          className={cn(
                            "absolute top-1 rounded border transition-colors",
                            activeTool === "razor" ? "cursor-crosshair" : "cursor-pointer",
                            isSelected
                              ? "border-[hsl(var(--cyan))] ring-1 ring-[hsl(var(--cyan)/0.3)]"
                              : "border-transparent hover:border-[hsl(var(--text-muted)/0.3)]"
                          )}
                          style={{
                            left: `${item.startTime * zoomLevel}px`,
                            width: `${item.duration * zoomLevel}px`,
                            height: `${track.height - 8}px`,
                            backgroundColor: trackColor,
                            opacity: dragGhost?.itemId === item.id ? 0.3 : 1,
                          }}
                        >
                          <div className="flex h-full items-center overflow-hidden px-1.5">
                            <span className="truncate text-[10px] font-medium text-white/80">
                              {item.mediaSourceId
                                ? mediaNameMap.get(item.mediaSourceId) || item.type
                                : item.type}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Drag ghost overlay */}
                    {dragGhost && track.items.some((i) => i.id === dragGhost.itemId) && (
                      <div
                        className="pointer-events-none absolute top-1 rounded border border-dashed border-[hsl(var(--cyan))] bg-[hsl(var(--cyan)/0.1)]"
                        style={{
                          left: `${dragGhost.left}px`,
                          width: `${dragGhost.width}px`,
                          height: `${track.height - 8}px`,
                        }}
                      />
                    )}

                    {/* Playhead line */}
                    <div
                      className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-[hsl(var(--cyan))]"
                      style={{ left: `${currentTime * zoomLevel}px` }}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
