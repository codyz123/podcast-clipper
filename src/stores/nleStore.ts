import { create } from "zustand";
import { enablePatches, produceWithPatches, applyPatches, Patch } from "immer";
import type {
  EpisodeTimeline,
  NleTrack,
  NleTimelineItem,
  NleTrackType,
  NleTool,
  TimelineMarker,
  ClipMarker,
  MulticamConfig,
} from "../lib/nleTypes";
import { createDefaultTrack, createDefaultTimelineItem } from "../lib/nleTypes";
import { generateId } from "../lib/utils";
import { fetchTimeline, saveTimelineApi, initTimelineApi } from "../lib/queries";

// Enable immer patches for efficient undo/redo
enablePatches();

// ============ Types ============

interface UndoEntry {
  patches: Patch[];
  inversePatches: Patch[];
  description: string;
}

interface NleState {
  // Timeline data
  timeline: EpisodeTimeline | null;
  isLoading: boolean;
  isDirty: boolean;
  lastSavedAt: number | null;
  saveError: string | null;

  // Context (set when loading)
  podcastId: string | null;
  episodeId: string | null;

  // Playback
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number; // 0.25, 0.5, 1, 1.5, 2

  // In/Out points
  inPoint: number | null;
  outPoint: number | null;

  // Timeline UI
  zoomLevel: number; // pixels per second (1-100 for episodes, default 10)
  scrollX: number;
  scrollY: number;

  // Selection
  selectedTrackIds: string[];
  selectedItemIds: string[];

  // Tools
  activeTool: NleTool;
  snapEnabled: boolean;

  // Multicam
  multicamRecordMode: boolean;
  pendingSwitches: Array<{ time: number; videoSourceId: string }>;

  // Undo/Redo
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Render state
  renderJobId: string | null;
  renderProgress: number;
  renderStatus: "idle" | "rendering" | "completed" | "failed";

  // Actions — Loading
  loadTimeline: (podcastId: string, episodeId: string) => Promise<void>;
  initTimeline: (podcastId: string, episodeId: string) => Promise<void>;
  saveTimeline: () => Promise<void>;

  // Actions — Playback
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setInPoint: (time: number | null) => void;
  setOutPoint: (time: number | null) => void;
  clearInOutPoints: () => void;

  // Actions — Timeline UI
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;

  // Actions — Selection
  setSelectedTrackIds: (ids: string[]) => void;
  setSelectedItemIds: (ids: string[]) => void;
  clearSelection: () => void;

  // Actions — Tools
  setActiveTool: (tool: NleTool) => void;
  setSnapEnabled: (enabled: boolean) => void;

  // Actions — Track CRUD
  addTrack: (type: NleTrackType, name: string) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<NleTrack>) => void;
  reorderTracks: (trackIds: string[]) => void;

  // Actions — Item CRUD
  addItem: (
    trackId: string,
    item: Partial<NleTimelineItem> & Pick<NleTimelineItem, "type">
  ) => void;
  removeItem: (itemId: string) => void;
  updateItem: (itemId: string, updates: Partial<NleTimelineItem>) => void;
  moveItem: (itemId: string, newStartTime: number, newTrackId?: string) => void;
  splitItemAtPlayhead: (itemId: string) => void;

  // Actions — Markers
  addMarker: (marker: Omit<TimelineMarker, "id">) => void;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<TimelineMarker>) => void;

  // Actions — Clip Markers
  addClipMarker: (marker: Omit<ClipMarker, "id">) => void;
  removeClipMarker: (markerId: string) => void;
  updateClipMarker: (markerId: string, updates: Partial<ClipMarker>) => void;

  // Actions — Multicam
  setMulticamConfig: (config: MulticamConfig | undefined) => void;
  setMulticamRecordMode: (active: boolean) => void;
  addPendingSwitch: (time: number, videoSourceId: string) => void;
  commitPendingSwitches: () => void;

  // Actions — Undo/Redo
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Actions — Render
  setRenderJobId: (id: string | null) => void;
  setRenderProgress: (progress: number) => void;
  setRenderStatus: (status: "idle" | "rendering" | "completed" | "failed") => void;

  // Actions — Reset
  resetStore: () => void;
}

// ============ Constants ============

const MAX_UNDO_DEPTH = 100;
const MIN_ZOOM = 1;
const MAX_ZOOM = 100;

// ============ Initial State ============

const INITIAL_STATE = {
  timeline: null as EpisodeTimeline | null,
  isLoading: false,
  isDirty: false,
  lastSavedAt: null as number | null,
  saveError: null as string | null,
  podcastId: null as string | null,
  episodeId: null as string | null,
  currentTime: 0,
  isPlaying: false,
  playbackSpeed: 1,
  inPoint: null as number | null,
  outPoint: null as number | null,
  zoomLevel: 10,
  scrollX: 0,
  scrollY: 0,
  selectedTrackIds: [] as string[],
  selectedItemIds: [] as string[],
  activeTool: "select" as NleTool,
  snapEnabled: true,
  multicamRecordMode: false,
  pendingSwitches: [] as Array<{ time: number; videoSourceId: string }>,
  undoStack: [] as UndoEntry[],
  redoStack: [] as UndoEntry[],
  renderJobId: null as string | null,
  renderProgress: 0,
  renderStatus: "idle" as const,
};

// ============ Helper: Recalculate timeline duration from all items ============

function recalculateDuration(tl: EpisodeTimeline) {
  tl.duration = tl.tracks.reduce(
    (max, t) => t.items.reduce((m, i) => Math.max(m, i.startTime + i.duration), max),
    0
  );
}

// ============ Helper: Apply mutation with undo tracking ============

function applyTimelineMutation(
  get: () => NleState,
  set: (partial: Partial<NleState>) => void,
  description: string,
  mutator: (timeline: EpisodeTimeline) => void
) {
  const { timeline } = get();
  if (!timeline) return;

  const [nextTimeline, patches, inversePatches] = produceWithPatches(timeline, mutator);

  if (patches.length === 0) return; // No changes

  const undoStack = [...get().undoStack, { patches, inversePatches, description }];
  if (undoStack.length > MAX_UNDO_DEPTH) {
    undoStack.shift();
  }

  set({
    timeline: nextTimeline as EpisodeTimeline,
    isDirty: true,
    undoStack,
    redoStack: [], // Clear redo on new mutation
  });
}

// ============ Store ============

export const useNleStore = create<NleState>()((set, get) => ({
  ...INITIAL_STATE,

  // ---- Loading ----

  loadTimeline: async (podcastId, episodeId) => {
    set({ isLoading: true, podcastId, episodeId, saveError: null });
    try {
      const timeline = await fetchTimeline(podcastId, episodeId);
      set({
        timeline,
        isLoading: false,
        isDirty: false,
        undoStack: [],
        redoStack: [],
      });
    } catch (error) {
      set({ isLoading: false, saveError: (error as Error).message });
    }
  },

  initTimeline: async (podcastId, episodeId) => {
    set({ isLoading: true, podcastId, episodeId, saveError: null });
    try {
      const { timeline } = await initTimelineApi(podcastId, episodeId);
      set({
        timeline,
        isLoading: false,
        isDirty: false,
        undoStack: [],
        redoStack: [],
      });
    } catch (error) {
      set({ isLoading: false, saveError: (error as Error).message });
    }
  },

  saveTimeline: async () => {
    const { timeline, podcastId, episodeId, isDirty } = get();
    if (!timeline || !podcastId || !episodeId || !isDirty) return;

    try {
      await saveTimelineApi(podcastId, episodeId, {
        tracks: timeline.tracks,
        duration: timeline.duration,
        fps: timeline.fps,
        multicamConfig: timeline.multicamConfig,
        captionStyle: timeline.captionStyle,
        background: timeline.background,
        markers: timeline.markers,
        clipMarkers: timeline.clipMarkers,
        format: timeline.format,
        version: timeline.version,
        updatedAt: timeline.updatedAt,
      });
      // Don't overwrite local timeline from server response — edits made
      // during the in-flight save would be silently lost. The server has
      // the saved version; the next autosave will pick up any new edits.
      set({
        isDirty: false,
        lastSavedAt: Date.now(),
        saveError: null,
      });
    } catch (error) {
      set({ saveError: (error as Error).message });
    }
  },

  // ---- Playback ----

  setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlayback: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setInPoint: (time) => set({ inPoint: time }),
  setOutPoint: (time) => set({ outPoint: time }),
  clearInOutPoints: () => set({ inPoint: null, outPoint: null }),

  // ---- Timeline UI ----

  setZoomLevel: (level) => set({ zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)) }),
  zoomIn: () => {
    const { zoomLevel } = get();
    set({ zoomLevel: Math.min(MAX_ZOOM, zoomLevel * 1.25) });
  },
  zoomOut: () => {
    const { zoomLevel } = get();
    set({ zoomLevel: Math.max(MIN_ZOOM, zoomLevel / 1.25) });
  },
  setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
  setScrollY: (y) => set({ scrollY: Math.max(0, y) }),

  // ---- Selection ----

  setSelectedTrackIds: (ids) => set({ selectedTrackIds: ids }),
  setSelectedItemIds: (ids) => set({ selectedItemIds: ids }),
  clearSelection: () => set({ selectedTrackIds: [], selectedItemIds: [] }),

  // ---- Tools ----

  setActiveTool: (tool) => set({ activeTool: tool }),
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),

  // ---- Track CRUD ----

  addTrack: (type, name) => {
    applyTimelineMutation(get, set, `Add track "${name}"`, (tl) => {
      const maxOrder = tl.tracks.reduce((max, t) => Math.max(max, t.order), -1);
      tl.tracks.push(
        createDefaultTrack({
          id: generateId(),
          type,
          name,
          order: maxOrder + 1,
        })
      );
    });
  },

  removeTrack: (trackId) => {
    // Capture items on this track for selection cleanup
    const removedTrack = get().timeline?.tracks.find((t) => t.id === trackId);
    const removedItemIds = new Set(removedTrack?.items.map((i) => i.id) ?? []);

    applyTimelineMutation(get, set, "Remove track", (tl) => {
      tl.tracks = tl.tracks.filter((t) => t.id !== trackId);
      recalculateDuration(tl);
    });

    // Clean up selections
    const { selectedTrackIds, selectedItemIds } = get();
    set({
      selectedTrackIds: selectedTrackIds.filter((id) => id !== trackId),
      selectedItemIds: selectedItemIds.filter((id) => !removedItemIds.has(id)),
    });
  },

  updateTrack: (trackId, updates) => {
    applyTimelineMutation(get, set, "Update track", (tl) => {
      const track = tl.tracks.find((t) => t.id === trackId);
      if (track) {
        const { id: _id, ...safeUpdates } = updates;
        Object.assign(track, safeUpdates);
      }
    });
  },

  reorderTracks: (trackIds) => {
    applyTimelineMutation(get, set, "Reorder tracks", (tl) => {
      for (let i = 0; i < trackIds.length; i++) {
        const track = tl.tracks.find((t) => t.id === trackIds[i]);
        if (track) track.order = i;
      }
    });
  },

  // ---- Item CRUD ----

  addItem: (trackId, itemData) => {
    applyTimelineMutation(get, set, "Add item", (tl) => {
      const track = tl.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const item = createDefaultTimelineItem({
        id: generateId(),
        trackId,
        ...itemData,
      });
      track.items.push(item);

      // Update timeline duration
      const itemEnd = item.startTime + item.duration;
      if (itemEnd > tl.duration) {
        tl.duration = itemEnd;
      }
    });
  },

  removeItem: (itemId) => {
    applyTimelineMutation(get, set, "Remove item", (tl) => {
      for (const track of tl.tracks) {
        const idx = track.items.findIndex((item) => item.id === itemId);
        if (idx !== -1) {
          track.items.splice(idx, 1);
          recalculateDuration(tl);
          break;
        }
      }
    });
    // Clean up selection
    const { selectedItemIds } = get();
    if (selectedItemIds.includes(itemId)) {
      set({ selectedItemIds: selectedItemIds.filter((id) => id !== itemId) });
    }
  },

  updateItem: (itemId, updates) => {
    applyTimelineMutation(get, set, "Update item", (tl) => {
      for (const track of tl.tracks) {
        const item = track.items.find((i) => i.id === itemId);
        if (item) {
          const { id: _id, trackId: _trackId, ...safeUpdates } = updates;
          Object.assign(item, safeUpdates);
          recalculateDuration(tl);
          break;
        }
      }
    });
  },

  moveItem: (itemId, newStartTime, newTrackId) => {
    applyTimelineMutation(get, set, "Move item", (tl) => {
      // Find the item
      let sourceTrack: NleTrack | undefined;
      let item: NleTimelineItem | undefined;
      for (const track of tl.tracks) {
        const found = track.items.find((i) => i.id === itemId);
        if (found) {
          sourceTrack = track;
          item = found;
          break;
        }
      }
      if (!sourceTrack || !item) return;

      item.startTime = Math.max(0, newStartTime);

      // Move to new track if specified (reject if dest track is locked)
      if (newTrackId && newTrackId !== sourceTrack.id) {
        const destTrack = tl.tracks.find((t) => t.id === newTrackId);
        if (destTrack && !destTrack.locked) {
          sourceTrack.items = sourceTrack.items.filter((i) => i.id !== itemId);
          item.trackId = newTrackId;
          destTrack.items.push(item);
        }
      }

      recalculateDuration(tl);
    });
  },

  splitItemAtPlayhead: (itemId) => {
    const { currentTime } = get();
    applyTimelineMutation(get, set, "Split item", (tl) => {
      for (const track of tl.tracks) {
        const idx = track.items.findIndex((i) => i.id === itemId);
        if (idx === -1) continue;

        const item = track.items[idx];
        const splitPoint = currentTime - item.startTime;

        // Only split if playhead is within the item
        if (splitPoint <= 0 || splitPoint >= item.duration) return;

        const sourceSplitPoint = item.sourceIn + splitPoint * item.speed;

        // Modify existing item (left half)
        const originalDuration = item.duration;
        item.duration = splitPoint;
        item.sourceOut = sourceSplitPoint;

        // Create new item (right half)
        const rightItem = createDefaultTimelineItem({
          id: generateId(),
          trackId: track.id,
          type: item.type,
          startTime: item.startTime + splitPoint,
          duration: originalDuration - splitPoint,
          sourceIn: sourceSplitPoint,
          sourceOut: item.sourceIn + originalDuration * item.speed,
          mediaSourceId: item.mediaSourceId,
          mediaSourceType: item.mediaSourceType,
          resolvedUrl: item.resolvedUrl,
          positionX: item.positionX,
          positionY: item.positionY,
          scale: item.scale,
          rotation: item.rotation,
          opacity: item.opacity,
          volume: item.volume,
          fadeIn: 0,
          fadeOut: item.fadeOut,
          speed: item.speed,
          textConfig: item.textConfig ? { ...item.textConfig } : undefined,
          transitionIn: undefined,
          transitionOut: item.transitionOut,
        });

        // Clear fadeOut and transitionOut from left half (they belong on the right)
        item.fadeOut = 0;
        item.transitionOut = undefined;

        track.items.splice(idx + 1, 0, rightItem);
        break;
      }
    });
  },

  // ---- Markers ----

  addMarker: (marker) => {
    applyTimelineMutation(get, set, "Add marker", (tl) => {
      tl.markers.push({ ...marker, id: generateId() });
    });
  },

  removeMarker: (markerId) => {
    applyTimelineMutation(get, set, "Remove marker", (tl) => {
      tl.markers = tl.markers.filter((m) => m.id !== markerId);
    });
  },

  updateMarker: (markerId, updates) => {
    applyTimelineMutation(get, set, "Update marker", (tl) => {
      const marker = tl.markers.find((m) => m.id === markerId);
      if (marker) Object.assign(marker, updates);
    });
  },

  // ---- Clip Markers ----

  addClipMarker: (marker) => {
    applyTimelineMutation(get, set, "Add clip marker", (tl) => {
      tl.clipMarkers.push({ ...marker, id: generateId() });
    });
  },

  removeClipMarker: (markerId) => {
    applyTimelineMutation(get, set, "Remove clip marker", (tl) => {
      tl.clipMarkers = tl.clipMarkers.filter((m) => m.id !== markerId);
    });
  },

  updateClipMarker: (markerId, updates) => {
    applyTimelineMutation(get, set, "Update clip marker", (tl) => {
      const marker = tl.clipMarkers.find((m) => m.id === markerId);
      if (marker) Object.assign(marker, updates);
    });
  },

  // ---- Multicam ----

  setMulticamConfig: (config) => {
    applyTimelineMutation(get, set, "Update multicam config", (tl) => {
      tl.multicamConfig = config;
    });
  },

  setMulticamRecordMode: (active) => {
    if (!active) {
      // Commit any pending switches on exit
      get().commitPendingSwitches();
    }
    set({ multicamRecordMode: active, pendingSwitches: active ? [] : get().pendingSwitches });
  },

  addPendingSwitch: (time, videoSourceId) => {
    set((s) => ({
      pendingSwitches: [...s.pendingSwitches, { time, videoSourceId }],
    }));
  },

  commitPendingSwitches: () => {
    const { pendingSwitches, timeline } = get();
    if (pendingSwitches.length === 0 || !timeline?.multicamConfig) return;

    applyTimelineMutation(get, set, "Commit camera switches", (tl) => {
      if (!tl.multicamConfig) return;

      // Sort pending switches by time
      const sorted = [...pendingSwitches].sort((a, b) => a.time - b.time);

      // Merge into existing switching timeline
      const existing = [...tl.multicamConfig.switchingTimeline];

      for (const sw of sorted) {
        // Find which segment this switch falls into
        const segIdx = existing.findIndex(
          (seg) => sw.time >= seg.startTime && sw.time < seg.endTime
        );
        if (segIdx === -1) continue;

        // Skip if same camera
        if (existing[segIdx].videoSourceId === sw.videoSourceId) continue;

        const seg = existing[segIdx];
        const newSegments = [];

        // Left portion of split segment
        if (sw.time > seg.startTime) {
          newSegments.push({
            startTime: seg.startTime,
            endTime: sw.time,
            videoSourceId: seg.videoSourceId,
          });
        }

        // New segment from switch point to end of original
        newSegments.push({
          startTime: sw.time,
          endTime: seg.endTime,
          videoSourceId: sw.videoSourceId,
        });

        // Replace the original segment
        existing.splice(segIdx, 1, ...newSegments);
      }

      tl.multicamConfig.switchingTimeline = existing;
    });

    set({ pendingSwitches: [] });
  },

  // ---- Undo/Redo ----

  undo: () => {
    const { timeline, undoStack, redoStack } = get();
    if (!timeline || undoStack.length === 0) return;

    const entry = undoStack[undoStack.length - 1];
    const restored = applyPatches(timeline, entry.inversePatches);

    set({
      timeline: restored as EpisodeTimeline,
      isDirty: true,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
    });
  },

  redo: () => {
    const { timeline, undoStack, redoStack } = get();
    if (!timeline || redoStack.length === 0) return;

    const entry = redoStack[redoStack.length - 1];
    const restored = applyPatches(timeline, entry.patches);

    set({
      timeline: restored as EpisodeTimeline,
      isDirty: true,
      undoStack: [...undoStack, entry],
      redoStack: redoStack.slice(0, -1),
    });
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  // ---- Render ----

  setRenderJobId: (id) => set({ renderJobId: id }),
  setRenderProgress: (progress) => set({ renderProgress: progress }),
  setRenderStatus: (status) => set({ renderStatus: status }),

  // ---- Reset ----

  resetStore: () => set(INITIAL_STATE),
}));
