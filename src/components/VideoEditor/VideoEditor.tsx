import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  ResetIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PlusIcon,
  MinusIcon,
  CaretDownIcon,
} from "@radix-ui/react-icons";
import { Button } from "../ui";
import { useProjectStore, getAudioBlob } from "../../stores/projectStore";
import { useEditorStore, createDefaultTracks } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { VideoFormat, VIDEO_FORMATS, Track, TrackType, CAPTION_PRESETS } from "../../lib/types";
import { generateId } from "../../lib/utils";
import { cn } from "../../lib/utils";
import { MultiTrackTimeline } from "./Timeline/MultiTrackTimeline";
import { EditorPreview } from "./Preview/EditorPreview";
import { TransportControls } from "./Controls/TransportControls";
import { AssetsPanel } from "./Panels/AssetsPanel";
import { useAudioFade } from "../../hooks/useAudioFade";

interface VideoEditorProps {
  onExport: () => void;
  onPublish?: () => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ onExport, onPublish }) => {
  const { currentProject, updateClip } = useProjectStore();
  const { templates, settings } = useSettingsStore();
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);

  const clips = currentProject?.clips || [];
  const activeClip = clips.find((c) => c.id === activeClipId) || clips[0] || null;
  const activeClipIndex = clips.findIndex((c) => c.id === activeClipId);
  const clipDuration = activeClip ? activeClip.endTime - activeClip.startTime : 0;

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
        "video-overlay": "Video Overlay",
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

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--bg-base))]">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" muted={isMuted} className="hidden" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[hsl(var(--cyan)/0.2)]">
              <span className="text-xs font-bold text-[hsl(var(--cyan))]">4</span>
            </div>
            <h1 className="text-sm font-semibold text-[hsl(var(--text))]">
              {currentProject?.name || "Video Editor"}
            </h1>
          </div>

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
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
        </div>

        <div className="flex items-center gap-3">
          {/* Clip selector */}
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
            <span className="min-w-[80px] text-center text-xs text-[hsl(var(--text-muted))]">
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onExport}>
              Export
            </Button>
            {onPublish && (
              <Button size="sm" glow onClick={onPublish}>
                Publish
              </Button>
            )}
          </div>
        </div>
      </div>

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
          {!isPanelCollapsed.assets && <AssetsPanel />}
        </div>

        {/* Center - Preview */}
        <div className="flex flex-1 flex-col">
          <EditorPreview
            clip={activeClip}
            currentTime={currentTime}
            format={selectedFormat}
            template={selectedTemplate}
            onFormatChange={setSelectedFormat}
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
                        onClick={() => setSelectedTemplateId(template.id)}
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

                {/* Caption styles placeholder */}
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                    Captions
                  </h3>
                  <div className="rounded-lg border border-[hsl(var(--border-subtle))] p-3">
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      Caption style editor coming soon
                    </p>
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
                    Video Overlay
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
          onTracksChange={handleTracksChange}
          onSeek={handleSeek}
          onSelectTrack={setSelectedTrack}
        />
      </div>
    </div>
  );
};
