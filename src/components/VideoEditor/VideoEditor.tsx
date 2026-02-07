import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  ResetIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PlusIcon,
  MinusIcon,
  CaretDownIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Button } from "../ui";
import { useProjectStore, getAudioBlob } from "../../stores/projectStore";
import { useEditorStore, createDefaultTracks } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useEpisodes } from "../../hooks/useEpisodes";
import {
  VideoFormat,
  VIDEO_FORMATS,
  Clip,
  VideoTemplate,
  Track,
  TrackType,
  TrackClip,
  CAPTION_PRESETS,
  CaptionStyle,
} from "../../lib/types";
import { generateId } from "../../lib/utils";
import { cn } from "../../lib/utils";
import { MultiTrackTimeline } from "./Timeline/MultiTrackTimeline";
import { EditorPreview } from "./Preview/EditorPreview";
import { TransportControls } from "./Controls/TransportControls";
import { AssetsPanel } from "./Panels/AssetsPanel";
import { useAudioFade } from "../../hooks/useAudioFade";

interface VideoEditorProps {
  onExport?: () => void;
  onPublish?: () => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = () => {
  const { currentProject, updateClip, removeClip } = useProjectStore();
  const { templates, settings } = useSettingsStore();
  const { brandColors } = useWorkspaceStore();
  const { saveClips } = useEpisodes();
  const {
    activeClipId,
    setActiveClip,
    selectedTrackId,
    setSelectedTrack,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    zoomLevel,
    zoomIn,
    zoomOut,
    isPanelCollapsed,
    togglePanel,
    pushSnapshot,
    undo,
    redo,
    undoStack,
    redoStack,
  } = useEditorStore();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat>("9:16");
  const [selectedTemplateId, setSelectedTemplateId] = useState(settings.defaultTemplate);
  const [showAddTrackMenu, setShowAddTrackMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColorInput, setCustomColorInput] = useState("");
  const [colorPickerPosition, setColorPickerPosition] = useState({ top: 0, left: 0 });
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const colorPickerButtonRef = useRef<HTMLButtonElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef<string>("");

  const clips = currentProject?.clips || [];
  const activeClip = clips.find((c) => c.id === activeClipId) || clips[0] || null;
  const activeClipIndex = clips.findIndex((c) => c.id === activeClipId);
  const clipDuration = activeClip ? activeClip.endTime - activeClip.startTime : 0;

  // Persist clip changes (captions, templates, tracks) with a debounce
  useEffect(() => {
    if (!currentProject?.id || clips.length === 0) return;

    const payload = clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      startTime: clip.startTime,
      endTime: clip.endTime,
      transcript: clip.transcript,
      words: clip.words,
      clippabilityScore: clip.clippabilityScore,
      isManual: clip.isManual,
      tracks: clip.tracks,
      captionStyle: clip.captionStyle,
      format: clip.format,
      templateId: clip.templateId,
      background: clip.background,
      subtitle: clip.subtitle,
    }));

    const signature = JSON.stringify(payload);
    if (signature === lastSavedSignatureRef.current) return;
    lastSavedSignatureRef.current = signature;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveClips(currentProject.id, payload).catch((err) => {
        console.error("[VideoEditor] Failed to sync clips:", err);
      });
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [clips, currentProject?.id, saveClips]);

  // Keep selected template in sync with the active clip
  useEffect(() => {
    if (!activeClip) return;
    const nextTemplateId = activeClip.templateId || settings.defaultTemplate;
    setSelectedTemplateId(nextTemplateId);
  }, [activeClip?.id, activeClip?.templateId, settings.defaultTemplate]);

  // Initialize template snapshot on clips that don't have one yet
  useEffect(() => {
    if (!activeClip) return;
    const fallbackTemplate =
      templates.find((t) => t.id === (activeClip.templateId || settings.defaultTemplate)) ||
      templates[0];
    if (!fallbackTemplate) return;

    const updates: Partial<Clip> = {};
    if (!activeClip.templateId) updates.templateId = fallbackTemplate.id;
    if (!activeClip.background) updates.background = fallbackTemplate.background;
    if (!activeClip.subtitle) updates.subtitle = fallbackTemplate.subtitle;

    if (Object.keys(updates).length > 0) {
      updateClip(activeClip.id, updates);
    }
  }, [
    activeClip?.id,
    activeClip?.templateId,
    activeClip?.background,
    activeClip?.subtitle,
    settings.defaultTemplate,
    templates,
    updateClip,
  ]);

  // Get the podcast audio track for fade settings
  const podcastTrack = useMemo(
    () => activeClip?.tracks?.find((t) => t.type === "podcast-audio"),
    [activeClip?.tracks]
  );

  // Apply audio fade-in/fade-out using Web Audio API
  useAudioFade({
    audioElement: audioRef.current,
    track: podcastTrack,
    clipDuration,
    currentTime,
    isPlaying,
  });

  // Initialize tracks if not present
  useEffect(() => {
    if (activeClip && !activeClip.tracks) {
      const defaultTracks = createDefaultTracks(activeClip.startTime, activeClip.endTime);
      // Set trackId on clips
      defaultTracks.forEach((track) => {
        track.clips.forEach((clip) => {
          clip.trackId = track.id;
        });
      });
      updateClip(activeClip.id, { tracks: defaultTracks });
    }
  }, [activeClip, updateClip]);

  // Migrate old track names (B-Roll -> Video)
  useEffect(() => {
    if (activeClip?.tracks) {
      const needsMigration = activeClip.tracks.some(
        (t) => t.type === "video-overlay" && t.name === "B-Roll"
      );
      if (needsMigration) {
        const migratedTracks = activeClip.tracks.map((t) =>
          t.type === "video-overlay" && t.name === "B-Roll" ? { ...t, name: "Video" } : t
        );
        updateClip(activeClip.id, { tracks: migratedTracks });
      }
    }
  }, [activeClip?.id, activeClip?.tracks, updateClip]);

  // Set active clip on mount
  useEffect(() => {
    if (!activeClipId && clips.length > 0) {
      setActiveClip(clips[0].id);
    }
  }, [activeClipId, clips, setActiveClip]);

  // Load audio from IndexedDB
  useEffect(() => {
    if (!currentProject?.id) return;

    const loadAudio = async () => {
      const blob = await getAudioBlob(currentProject.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    };

    loadAudio();
  }, [currentProject?.id]);

  // Smooth playhead animation
  useEffect(() => {
    if (!audioRef.current || !activeClip || !isPlaying) return;

    const audio = audioRef.current;
    const clipDuration = activeClip.endTime - activeClip.startTime;

    const updatePlayhead = () => {
      const elapsed = audio.currentTime - activeClip.startTime;

      if (elapsed >= clipDuration) {
        audio.pause();
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      }

      setCurrentTime(elapsed);
      animationRef.current = requestAnimationFrame(updatePlayhead);
    };

    animationRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, activeClip, setCurrentTime, setIsPlaying]);

  // Update playback speed when it changes during playback
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Sync track mute state with audio element
  // The podcast-audio track controls whether the main audio is muted
  useEffect(() => {
    if (!audioRef.current || !activeClip?.tracks) return;

    const podcastTrack = activeClip.tracks.find((t) => t.type === "podcast-audio");
    if (podcastTrack) {
      // Mute if either global mute OR track mute is enabled
      audioRef.current.muted = isMuted || podcastTrack.muted;
    }
  }, [activeClip?.tracks, isMuted]);

  // Delete selected timeline clip
  const handleDeleteTimelineClip = useCallback(() => {
    if (!selectedTimelineClipId || !activeClip?.tracks) return;

    const currentTracks = activeClip.tracks;
    pushSnapshot(currentTracks, activeClip.captionStyle);

    // Find and remove the clip from its track
    const updatedTracks = currentTracks.map((track) => ({
      ...track,
      clips: track.clips.filter((c) => c.id !== selectedTimelineClipId),
    }));

    updateClip(activeClip.id, { tracks: updatedTracks });
    setSelectedTimelineClipId(null);
  }, [selectedTimelineClipId, activeClip, updateClip, pushSnapshot]);

  // Keyboard shortcuts (spacebar play/pause, delete clip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (audioRef.current && activeClip) {
          if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
          } else {
            audioRef.current.currentTime = activeClip.startTime + currentTime;
            audioRef.current.playbackRate = playbackSpeed;
            audioRef.current.play();
            setIsPlaying(true);
          }
        }
      }

      // Delete or Backspace to delete selected clip
      if ((e.code === "Delete" || e.code === "Backspace") && selectedTimelineClipId) {
        e.preventDefault();
        handleDeleteTimelineClip();
      }

      // Escape to deselect
      if (e.code === "Escape") {
        setSelectedTimelineClipId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeClip,
    currentTime,
    isPlaying,
    playbackSpeed,
    setIsPlaying,
    selectedTimelineClipId,
    handleDeleteTimelineClip,
  ]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (!audioRef.current || !activeClip) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = activeClip.startTime + currentTime;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, activeClip, currentTime, playbackSpeed, setIsPlaying]);

  // Handle seek
  const handleSeek = useCallback(
    (time: number) => {
      if (!audioRef.current || !activeClip) return;

      const clampedTime = Math.max(0, Math.min(time, activeClip.endTime - activeClip.startTime));
      setCurrentTime(clampedTime);
      audioRef.current.currentTime = activeClip.startTime + clampedTime;
    },
    [activeClip, setCurrentTime]
  );

  // Handle clip navigation
  const goToClip = useCallback(
    (index: number) => {
      if (index >= 0 && index < clips.length) {
        setActiveClip(clips[index].id);
        setCurrentTime(0);
        if (audioRef.current && isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    },
    [clips, setActiveClip, setCurrentTime, isPlaying, setIsPlaying]
  );

  // Handle clip deletion
  const handleDeleteClip = useCallback(() => {
    if (!activeClip) return;

    // Stop playback
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    // Navigate to previous or next clip before deleting
    if (clips.length > 1) {
      const newIndex = activeClipIndex > 0 ? activeClipIndex - 1 : 0;
      setActiveClip(clips[newIndex === activeClipIndex ? newIndex + 1 : newIndex].id);
    }

    removeClip(activeClip.id);
    setShowDeleteConfirm(false);
  }, [activeClip, activeClipIndex, clips, isPlaying, removeClip, setActiveClip, setIsPlaying]);

  // Handle track changes
  const handleTracksChange = useCallback(
    (tracks: Track[]) => {
      if (!activeClip) return;
      pushSnapshot(activeClip.tracks || [], activeClip.captionStyle);
      updateClip(activeClip.id, { tracks });
    },
    [activeClip, updateClip, pushSnapshot]
  );

  // Handle undo
  const handleUndo = useCallback(() => {
    const snapshot = undo();
    if (snapshot && activeClip) {
      updateClip(activeClip.id, {
        tracks: snapshot.tracks,
        captionStyle: snapshot.captionStyle,
      });
    }
  }, [undo, activeClip, updateClip]);

  // Handle redo
  const handleRedo = useCallback(() => {
    const snapshot = redo();
    if (snapshot && activeClip) {
      updateClip(activeClip.id, {
        tracks: snapshot.tracks,
        captionStyle: snapshot.captionStyle,
      });
    }
  }, [redo, activeClip, updateClip]);

  // Handle adding a new track
  const handleAddTrack = useCallback(
    (trackType: TrackType) => {
      if (!activeClip) return;

      const currentTracks = activeClip.tracks || [];
      pushSnapshot(currentTracks, activeClip.captionStyle);

      // Determine track name and order
      const trackNames: Record<TrackType, string> = {
        "podcast-audio": "Podcast Audio",
        music: "Music",
        sfx: "Sound Effects",
        "video-overlay": "Video",
        "text-graphics": "Text Graphics",
        captions: "Captions",
      };

      // Count existing tracks of this type
      const existingCount = currentTracks.filter((t) => t.type === trackType).length;
      const baseName = trackNames[trackType];
      const name = existingCount > 0 ? `${baseName} ${existingCount + 1}` : baseName;

      // Find highest order and add 1
      const maxOrder = currentTracks.reduce((max, t) => Math.max(max, t.order), -1);

      const newTrack: Track = {
        id: generateId(),
        type: trackType,
        name,
        order: maxOrder + 1,
        locked: false,
        muted: false,
        volume: 1,
        opacity: 1,
        clips: [],
        ...(trackType === "captions" && {
          captionStyle: { ...CAPTION_PRESETS.hormozi, preset: "hormozi" as const },
        }),
      };

      updateClip(activeClip.id, { tracks: [...currentTracks, newTrack] });
      setShowAddTrackMenu(false);
    },
    [activeClip, updateClip, pushSnapshot]
  );

  // Get current caption style from clip or use default
  const currentCaptionStyle: CaptionStyle = useMemo(() => {
    return activeClip?.captionStyle || { ...CAPTION_PRESETS.hormozi, preset: "hormozi" as const };
  }, [activeClip?.captionStyle]);

  // Check if highlight is enabled (highlightColor differs from primaryColor)
  const isHighlightEnabled =
    currentCaptionStyle.highlightColor !== currentCaptionStyle.primaryColor;

  // Handle caption style updates
  const handleCaptionStyleChange = useCallback(
    (updates: Partial<CaptionStyle>) => {
      if (!activeClip) return;
      pushSnapshot(activeClip.tracks || [], activeClip.captionStyle);
      const newStyle = { ...currentCaptionStyle, ...updates };
      updateClip(activeClip.id, { captionStyle: newStyle });
    },
    [activeClip, currentCaptionStyle, updateClip, pushSnapshot]
  );

  // Toggle highlight on/off
  const handleToggleHighlight = useCallback(() => {
    if (isHighlightEnabled) {
      // Turn off highlight by setting highlightColor to primaryColor
      handleCaptionStyleChange({ highlightColor: currentCaptionStyle.primaryColor });
    } else {
      // Turn on highlight with a default highlight color
      handleCaptionStyleChange({ highlightColor: "#FFD700" });
    }
  }, [isHighlightEnabled, currentCaptionStyle.primaryColor, handleCaptionStyleChange]);

  // Check if captions track is selected
  const isCaptionsTrackSelected = useMemo(() => {
    if (!selectedTrackId || !activeClip?.tracks) return false;
    const track = activeClip.tracks.find((t) => t.id === selectedTrackId);
    return track?.type === "captions";
  }, [selectedTrackId, activeClip?.tracks]);

  // Check if video track is selected
  const isVideoTrackSelected = useMemo(() => {
    if (!selectedTrackId || !activeClip?.tracks) return false;
    const track = activeClip.tracks.find((t) => t.id === selectedTrackId);
    return track?.type === "video-overlay";
  }, [selectedTrackId, activeClip?.tracks]);

  // Handle caption position change from preview drag
  const handleCaptionPositionChange = useCallback(
    (positionX: number, positionY: number) => {
      handleCaptionStyleChange({ positionX, positionY });
    },
    [handleCaptionStyleChange]
  );

  // Handle animation position change from preview drag
  const handleAnimationPositionChange = useCallback(
    (clipId: string, positionX: number, positionY: number) => {
      if (!activeClip) return;

      const currentTracks = activeClip.tracks || [];
      pushSnapshot(currentTracks, activeClip.captionStyle);

      // Update the clip's position in the tracks
      const updatedTracks = currentTracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => (c.id === clipId ? { ...c, positionX, positionY } : c)),
      }));

      updateClip(activeClip.id, { tracks: updatedTracks });
    },
    [activeClip, updateClip, pushSnapshot]
  );

  // Handle adding an animation from the assets panel
  const handleAddAnimation = useCallback(
    (
      animationUrl: string,
      _name: string,
      duration: number,
      source: "lottie" | "giphy" | "tenor" = "lottie"
    ) => {
      if (!activeClip) return;

      const currentTracks = activeClip.tracks || [];
      pushSnapshot(currentTracks, activeClip.captionStyle);

      // Deep copy tracks to avoid mutating snapshot
      const tracksCopy = currentTracks.map((t) => ({
        ...t,
        clips: [...t.clips],
      }));

      // Find or create a video-overlay track
      let overlayTrack = tracksCopy.find((t) => t.type === "video-overlay");

      if (!overlayTrack) {
        // Create a new video-overlay track
        const maxOrder = tracksCopy.reduce((max, t) => Math.max(max, t.order), -1);
        overlayTrack = {
          id: generateId(),
          type: "video-overlay" as TrackType,
          name: "Video",
          order: maxOrder + 1,
          locked: false,
          muted: false,
          volume: 1,
          opacity: 1,
          clips: [],
        };
        tracksCopy.push(overlayTrack);
      }

      // Create the animation clip
      const newClip: TrackClip = {
        id: generateId(),
        trackId: overlayTrack.id,
        startTime: currentTime, // Place at current playhead position
        duration: duration,
        type: "animation",
        assetUrl: animationUrl,
        assetSource: source,
      };

      // Add the clip to the track
      overlayTrack.clips = [...overlayTrack.clips, newClip];

      updateClip(activeClip.id, { tracks: tracksCopy });
    },
    [activeClip, currentTime, updateClip, pushSnapshot]
  );

  const selectedTemplate = useMemo<VideoTemplate>(() => {
    const fallback = templates.find((t) => t.id === selectedTemplateId) || templates[0]!;
    if (activeClip?.background || activeClip?.subtitle) {
      return {
        ...fallback,
        id: activeClip.templateId || fallback.id,
        background: activeClip.background || fallback.background,
        subtitle: activeClip.subtitle || fallback.subtitle,
      };
    }
    return fallback;
  }, [
    activeClip?.background,
    activeClip?.subtitle,
    activeClip?.templateId,
    selectedTemplateId,
    templates,
  ]);

  const handleTemplateSelect = useCallback(
    (template: VideoTemplate) => {
      if (!template || !activeClip) return;
      setSelectedTemplateId(template.id);
      updateClip(activeClip.id, {
        templateId: template.id,
        background: template.background,
        subtitle: template.subtitle,
      });
    },
    [activeClip, updateClip]
  );

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--bg-base))]">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" muted={isMuted} className="hidden" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-4 py-2">
        {/* Left: Undo/Redo */}
        <div className="flex w-32 items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              undoStack.length === 0
                ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            )}
            title="Undo (Cmd+Z)"
          >
            <ResetIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              redoStack.length === 0
                ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            )}
            title="Redo (Cmd+Shift+Z)"
          >
            <ResetIcon className="h-3.5 w-3.5 -scale-x-100" />
          </button>
        </div>

        {/* Center: Clip selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToClip(activeClipIndex - 1)}
            disabled={activeClipIndex <= 0}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeClipIndex <= 0
                ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            )}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="min-w-[100px] text-center text-xs text-[hsl(var(--text-muted))]">
            {activeClip?.name || "No clip"} ({activeClipIndex + 1}/{clips.length})
          </span>
          <button
            onClick={() => goToClip(activeClipIndex + 1)}
            disabled={activeClipIndex >= clips.length - 1}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeClipIndex >= clips.length - 1
                ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            )}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Delete button */}
        <div className="flex w-32 items-center justify-end">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!activeClip}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded px-2 transition-colors",
              !activeClip
                ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
            )}
            title="Delete clip"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            <span className="text-xs">Delete</span>
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="fixed top-1/2 left-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-elevated))] p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Delete Clip</h3>
            <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
              Are you sure you want to delete "{activeClip?.name}"? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.9)]"
                onClick={handleDeleteClip}
              >
                Delete
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Assets (placeholder) */}
        <div
          className={cn(
            "flex flex-col border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] transition-all",
            isPanelCollapsed.assets ? "w-10" : "w-56"
          )}
        >
          <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] p-2">
            {!isPanelCollapsed.assets && (
              <span className="text-xs font-medium text-[hsl(var(--text-muted))]">Assets</span>
            )}
            <button
              onClick={() => togglePanel("assets")}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            >
              {isPanelCollapsed.assets ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronLeftIcon className="h-4 w-4" />
              )}
            </button>
          </div>
          {!isPanelCollapsed.assets && <AssetsPanel onAddAnimation={handleAddAnimation} />}
        </div>

        {/* Center - Preview */}
        <div className="flex flex-1 flex-col">
          <EditorPreview
            clip={activeClip}
            currentTime={currentTime}
            format={selectedFormat}
            template={selectedTemplate}
            onFormatChange={setSelectedFormat}
            isCaptionsTrackSelected={isCaptionsTrackSelected}
            isVideoTrackSelected={isVideoTrackSelected}
            onCaptionPositionChange={handleCaptionPositionChange}
            onAnimationPositionChange={handleAnimationPositionChange}
            selectedClipId={selectedTimelineClipId}
            onSelectClip={setSelectedTimelineClipId}
          />
        </div>

        {/* Right panel - Inspector (placeholder) */}
        <div
          className={cn(
            "flex flex-col border-l border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] transition-all",
            isPanelCollapsed.inspector ? "w-10" : "w-64"
          )}
        >
          <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] p-2">
            <button
              onClick={() => togglePanel("inspector")}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            >
              {isPanelCollapsed.inspector ? (
                <ChevronLeftIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </button>
            {!isPanelCollapsed.inspector && (
              <span className="text-xs font-medium text-[hsl(var(--text-muted))]">Inspector</span>
            )}
          </div>
          {!isPanelCollapsed.inspector && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-4">
                {/* Format selector */}
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                    Format
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.values(VIDEO_FORMATS).map((format) => (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={cn(
                          "rounded-md border p-2 text-left transition-colors",
                          selectedFormat === format.id
                            ? "border-[hsl(var(--cyan)/0.5)] bg-[hsl(var(--cyan)/0.1)]"
                            : "border-[hsl(var(--border-subtle))] hover:border-[hsl(var(--border))]"
                        )}
                      >
                        <span className="block text-[10px] font-medium text-[hsl(var(--text))]">
                          {format.name}
                        </span>
                        <span className="block text-[9px] text-[hsl(var(--text-muted))]">
                          {format.aspectRatio}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template selector */}
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                    Template
                  </h3>
                  <div className="space-y-1.5">
                    {templates.slice(0, 4).map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateSelect(template)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors",
                          selectedTemplateId === template.id
                            ? "border-[hsl(var(--cyan)/0.5)] bg-[hsl(var(--cyan)/0.1)]"
                            : "border-[hsl(var(--border-subtle))] hover:border-[hsl(var(--border))]"
                        )}
                      >
                        <div
                          className="h-6 w-6 shrink-0 rounded"
                          style={{
                            background:
                              template.background.type === "gradient"
                                ? `linear-gradient(135deg, ${template.background.gradientColors?.[0]}, ${template.background.gradientColors?.[1]})`
                                : template.background.color,
                          }}
                        />
                        <span className="truncate text-xs text-[hsl(var(--text))]">
                          {template.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Caption controls */}
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                    Captions
                  </h3>
                  <div className="space-y-3">
                    {/* Words per line */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-[10px] text-[hsl(var(--text-muted))]">
                          Words on screen
                        </label>
                        <span className="text-[10px] font-medium text-[hsl(var(--text))]">
                          {currentCaptionStyle.wordsPerLine}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="8"
                        value={currentCaptionStyle.wordsPerLine}
                        onChange={(e) =>
                          handleCaptionStyleChange({ wordsPerLine: parseInt(e.target.value) })
                        }
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface))] accent-[hsl(var(--cyan))]"
                      />
                      <div className="mt-1 flex justify-between text-[8px] text-[hsl(var(--text-ghost))]">
                        <span>1</span>
                        <span>8</span>
                      </div>
                    </div>

                    {/* Highlight toggle */}
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-[hsl(var(--text-muted))]">
                        Highlight active word
                      </label>
                      <button
                        onClick={handleToggleHighlight}
                        className={cn(
                          "relative h-5 w-9 rounded-full transition-colors",
                          isHighlightEnabled ? "bg-[hsl(var(--cyan))]" : "bg-[hsl(var(--surface))]"
                        )}
                      >
                        <div
                          className={cn(
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                            isHighlightEnabled ? "translate-x-4" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>

                    {/* Highlight color (only shown when highlight is enabled) */}
                    {isHighlightEnabled && (
                      <div>
                        <label className="mb-1.5 block text-[10px] text-[hsl(var(--text-muted))]">
                          Highlight color
                        </label>
                        <div className="flex gap-1.5">
                          {/* Brand colors (primary, secondary) + off-white as fallback */}
                          {[
                            brandColors?.primary || "#FFD700",
                            brandColors?.secondary || "#FF00FF",
                            "#FAFAFA",
                          ].map((color, index) => (
                            <button
                              key={color}
                              onClick={() => handleCaptionStyleChange({ highlightColor: color })}
                              className={cn(
                                "h-6 w-6 rounded-md border-2 transition-all",
                                currentCaptionStyle.highlightColor === color
                                  ? "scale-110 border-white"
                                  : "border-transparent hover:scale-105"
                              )}
                              style={{ backgroundColor: color }}
                              title={
                                index === 0
                                  ? "Brand Primary"
                                  : index === 1
                                    ? "Brand Secondary"
                                    : "Light"
                              }
                            />
                          ))}
                          {/* Custom color picker button */}
                          <div className="relative">
                            <button
                              ref={colorPickerButtonRef}
                              onClick={() => {
                                if (!showColorPicker && colorPickerButtonRef.current) {
                                  const rect = colorPickerButtonRef.current.getBoundingClientRect();
                                  setColorPickerPosition({
                                    top: rect.bottom + 8,
                                    left: Math.max(8, rect.right - 192), // 192px = popover width (w-48)
                                  });
                                }
                                setCustomColorInput(currentCaptionStyle.highlightColor);
                                setShowColorPicker(!showColorPicker);
                              }}
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all",
                                showColorPicker ||
                                  ![
                                    brandColors?.primary || "#FFD700",
                                    brandColors?.secondary || "#FF00FF",
                                    "#FAFAFA",
                                  ].includes(currentCaptionStyle.highlightColor)
                                  ? "scale-110 border-white"
                                  : "border-transparent hover:scale-105",
                                "bg-gradient-to-br from-red-500 via-green-500 to-blue-500"
                              )}
                              title="Custom color"
                            >
                              <PlusIcon className="h-3 w-3 text-white drop-shadow-md" />
                            </button>
                            {/* Color picker popover */}
                            {showColorPicker && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setShowColorPicker(false)}
                                />
                                <div
                                  className="fixed z-50 w-48 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-elevated))] p-3 shadow-xl"
                                  style={{
                                    top: colorPickerPosition.top,
                                    left: colorPickerPosition.left,
                                  }}
                                >
                                  <label className="mb-2 block text-[10px] text-[hsl(var(--text-muted))]">
                                    Custom color
                                  </label>
                                  {/* Color wheel input */}
                                  <input
                                    type="color"
                                    value={customColorInput || currentCaptionStyle.highlightColor}
                                    onChange={(e) => {
                                      setCustomColorInput(e.target.value);
                                      handleCaptionStyleChange({ highlightColor: e.target.value });
                                    }}
                                    className="mb-2 h-8 w-full cursor-pointer rounded border-0 bg-transparent"
                                  />
                                  {/* Hex input */}
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={customColorInput || currentCaptionStyle.highlightColor}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        setCustomColorInput(value);
                                        // Only apply if it's a valid hex color
                                        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                                          handleCaptionStyleChange({ highlightColor: value });
                                        }
                                      }}
                                      placeholder="#FFFFFF"
                                      className="flex-1 rounded border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface))] px-2 py-1 text-[10px] text-[hsl(var(--text))] placeholder-[hsl(var(--text-ghost))] focus:border-[hsl(var(--cyan))] focus:outline-none"
                                    />
                                    <button
                                      onClick={() => setShowColorPicker(false)}
                                      className="rounded bg-[hsl(var(--cyan))] px-2 py-1 text-[10px] font-medium text-[hsl(var(--bg-base))]"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline section */}
      <div className="border-t border-[hsl(var(--border-subtle))]">
        {/* Timeline controls */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] px-4 py-2">
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setShowAddTrackMenu(!showAddTrackMenu)}
              className="flex h-7 items-center gap-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface))] px-2 text-xs text-[hsl(var(--text-muted))] hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))]"
            >
              <PlusIcon className="h-3 w-3" />
              Add Track
              <CaretDownIcon className="h-3 w-3" />
            </button>
            {showAddTrackMenu && (
              <>
                {/* Backdrop to close menu */}
                <div className="fixed inset-0 z-40" onClick={() => setShowAddTrackMenu(false)} />
                {/* Dropdown menu */}
                <div className="absolute top-full left-0 z-50 mt-1 w-40 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-elevated))] py-1 shadow-lg">
                  <button
                    onClick={() => handleAddTrack("video-overlay")}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  >
                    Video
                  </button>
                  <button
                    onClick={() => handleAddTrack("music")}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  >
                    Music
                  </button>
                  <button
                    onClick={() => handleAddTrack("sfx")}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  >
                    Sound Effects
                  </button>
                  <button
                    onClick={() => handleAddTrack("text-graphics")}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  >
                    Text Graphics
                  </button>
                  <button
                    onClick={() => handleAddTrack("captions")}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  >
                    Captions
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Transport controls */}
          <TransportControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={clipDuration}
            playbackSpeed={playbackSpeed}
            isMuted={isMuted}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSpeedChange={setPlaybackSpeed}
            onMuteToggle={() => setIsMuted(!isMuted)}
          />

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              className="flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            >
              <MinusIcon className="h-3.5 w-3.5" />
            </button>
            <span className="w-12 text-center text-[10px] text-[hsl(var(--text-muted))]">
              {Math.round(zoomLevel)}%
            </span>
            <button
              onClick={zoomIn}
              className="flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Multi-track timeline */}
        <MultiTrackTimeline
          tracks={activeClip?.tracks || []}
          clipDuration={clipDuration}
          currentTime={currentTime}
          zoomLevel={zoomLevel}
          selectedTrackId={selectedTrackId}
          selectedClipId={selectedTimelineClipId}
          onTracksChange={handleTracksChange}
          onSeek={handleSeek}
          onSelectTrack={setSelectedTrack}
          onSelectClip={setSelectedTimelineClipId}
          words={activeClip?.words || []}
          clipStartTime={activeClip?.startTime || 0}
        />
      </div>
    </div>
  );
};
