import { create } from "zustand";
import { Track, HookAnalysis, VisualSuggestion, CaptionStyle, CAPTION_PRESETS } from "../lib/types";
import { generateId } from "../lib/utils";

// Editor snapshot for undo/redo
interface EditorSnapshot {
  tracks: Track[];
  captionStyle?: CaptionStyle;
  timestamp: number;
}

// Tool types
export type EditorTool = "select" | "cut" | "add-animation" | "add-text";

interface EditorState {
  // Active clip being edited
  activeClipId: string | null;

  // Timeline UI
  selectedTrackId: string | null;
  selectedTrackClipId: string | null;
  zoomLevel: number; // pixels per second (default 50)
  scrollPosition: number; // horizontal scroll offset in pixels

  // Playback state (synced with audio element)
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 1.5, 2

  // Tools
  activeTool: EditorTool;
  isPanelCollapsed: { assets: boolean; inspector: boolean };

  // AI Features (computed on demand, not persisted)
  hookAnalysis: HookAnalysis | null;
  visualSuggestions: VisualSuggestion[];
  isAnalyzing: boolean;

  // Undo/Redo (in-memory only)
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];

  // Dragging state
  isDragging: boolean;
  dragTarget: { type: "clip" | "handle"; clipId: string; handle?: "start" | "end" } | null;

  // Actions
  setActiveClip: (clipId: string | null) => void;
  setSelectedTrack: (trackId: string | null) => void;
  setSelectedTrackClip: (clipId: string | null) => void;

  // Playback actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  togglePlayback: () => void;

  // Timeline actions
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollPosition: (position: number) => void;

  // Tool actions
  setActiveTool: (tool: EditorTool) => void;
  togglePanel: (panel: "assets" | "inspector") => void;

  // AI actions
  setHookAnalysis: (analysis: HookAnalysis | null) => void;
  setVisualSuggestions: (suggestions: VisualSuggestion[]) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  markSuggestionApplied: (suggestionId: string) => void;

  // Undo/Redo actions
  pushSnapshot: (tracks: Track[], captionStyle?: CaptionStyle) => void;
  undo: () => EditorSnapshot | null;
  redo: () => EditorSnapshot | null;
  clearHistory: () => void;

  // Drag actions
  startDrag: (target: {
    type: "clip" | "handle";
    clipId: string;
    handle?: "start" | "end";
  }) => void;
  endDrag: () => void;

  // Reset
  resetEditor: () => void;
}

const INITIAL_STATE = {
  activeClipId: null,
  selectedTrackId: null,
  selectedTrackClipId: null,
  zoomLevel: 50, // 50 pixels per second
  scrollPosition: 0,
  currentTime: 0,
  isPlaying: false,
  playbackSpeed: 1,
  activeTool: "select" as EditorTool,
  isPanelCollapsed: { assets: false, inspector: false },
  hookAnalysis: null,
  visualSuggestions: [],
  isAnalyzing: false,
  undoStack: [],
  redoStack: [],
  isDragging: false,
  dragTarget: null,
};

const MAX_UNDO_STACK = 50;

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...INITIAL_STATE,

  // Clip selection
  setActiveClip: (clipId) => {
    set({
      activeClipId: clipId,
      currentTime: 0,
      isPlaying: false,
      selectedTrackId: null,
      selectedTrackClipId: null,
      hookAnalysis: null,
      visualSuggestions: [],
    });
  },

  setSelectedTrack: (trackId) => {
    set({ selectedTrackId: trackId });
  },

  setSelectedTrackClip: (clipId) => {
    set({ selectedTrackClipId: clipId });
  },

  // Playback
  setCurrentTime: (time) => {
    set({ currentTime: time });
  },

  setIsPlaying: (isPlaying) => {
    set({ isPlaying });
  },

  setPlaybackSpeed: (speed) => {
    set({ playbackSpeed: speed });
  },

  togglePlayback: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  // Timeline zoom
  setZoomLevel: (level) => {
    // Clamp between 10 (zoomed out) and 200 (zoomed in)
    const clampedLevel = Math.max(10, Math.min(200, level));
    set({ zoomLevel: clampedLevel });
  },

  zoomIn: () => {
    const { zoomLevel } = get();
    set({ zoomLevel: Math.min(200, zoomLevel * 1.25) });
  },

  zoomOut: () => {
    const { zoomLevel } = get();
    set({ zoomLevel: Math.max(10, zoomLevel / 1.25) });
  },

  setScrollPosition: (position) => {
    set({ scrollPosition: Math.max(0, position) });
  },

  // Tools
  setActiveTool: (tool) => {
    set({ activeTool: tool });
  },

  togglePanel: (panel) => {
    set((state) => ({
      isPanelCollapsed: {
        ...state.isPanelCollapsed,
        [panel]: !state.isPanelCollapsed[panel],
      },
    }));
  },

  // AI Features
  setHookAnalysis: (analysis) => {
    set({ hookAnalysis: analysis });
  },

  setVisualSuggestions: (suggestions) => {
    set({ visualSuggestions: suggestions });
  },

  setIsAnalyzing: (isAnalyzing) => {
    set({ isAnalyzing });
  },

  markSuggestionApplied: (suggestionId) => {
    set((state) => ({
      visualSuggestions: state.visualSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, applied: true } : s
      ),
    }));
  },

  // Undo/Redo
  pushSnapshot: (tracks, captionStyle) => {
    set((state) => {
      const snapshot: EditorSnapshot = {
        tracks: JSON.parse(JSON.stringify(tracks)), // Deep clone
        captionStyle: captionStyle ? { ...captionStyle } : undefined,
        timestamp: Date.now(),
      };

      const newUndoStack = [...state.undoStack, snapshot];
      // Limit stack size
      if (newUndoStack.length > MAX_UNDO_STACK) {
        newUndoStack.shift();
      }

      return {
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new action
      };
    });
  },

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const snapshot = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, snapshot],
    });

    return snapshot;
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const snapshot = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, snapshot],
    });

    return snapshot;
  },

  clearHistory: () => {
    set({ undoStack: [], redoStack: [] });
  },

  // Drag state
  startDrag: (target) => {
    set({ isDragging: true, dragTarget: target });
  },

  endDrag: () => {
    set({ isDragging: false, dragTarget: null });
  },

  // Reset
  resetEditor: () => {
    set(INITIAL_STATE);
  },
}));

// Helper function to create default tracks for a clip
export function createDefaultTracks(clipStartTime: number, clipEndTime: number): Track[] {
  const duration = clipEndTime - clipStartTime;

  return [
    {
      id: generateId(),
      type: "podcast-audio",
      name: "Podcast Audio",
      order: 0,
      locked: true,
      muted: false,
      volume: 1,
      opacity: 1,
      clips: [
        {
          id: generateId(),
          trackId: "", // Will be set after track creation
          startTime: 0,
          duration,
          type: "audio",
          sourceStart: clipStartTime,
          sourceEnd: clipEndTime,
        },
      ],
    },
    {
      id: generateId(),
      type: "captions",
      name: "Captions",
      order: 1,
      locked: false,
      muted: false,
      volume: 1,
      opacity: 1,
      clips: [],
      captionStyle: { ...CAPTION_PRESETS.hormozi, preset: "hormozi" },
    },
    {
      id: generateId(),
      type: "video-overlay",
      name: "B-Roll",
      order: 2,
      locked: false,
      muted: false,
      volume: 1,
      opacity: 1,
      clips: [],
    },
  ];
}
