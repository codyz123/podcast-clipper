import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Clip,
  VideoFormat,
  VideoTemplate,
  VIDEO_FORMATS,
  TrackClip,
  PodcastPerson,
  SpeakerNameFormat,
} from "../../../lib/types";
import { cn } from "../../../lib/utils";
import { getMediaUrl } from "../../../lib/api";
import { resolveFontFamily } from "../../../lib/fonts";
import {
  resolveCaptionStyle,
  toSubtitleConfig,
  toWordTimings,
  type CaptionStyle,
} from "../../../lib/clipTransform";
import { findActiveWord } from "../../../lib/findActiveWord";
import { MulticamPreview } from "./MulticamPreview";
import { WaveformOverlay } from "../Overlays/WaveformOverlay";
import { YouTubeCtaOverlay } from "../Overlays/YouTubeCtaOverlay";
import { ApplePodcastsCtaOverlay } from "../Overlays/ApplePodcastsCtaOverlay";
import type { VideoSource as EpisodeVideoSource } from "../../../hooks/useEpisodes";
import type {
  SpeakerSegmentLike,
  LayoutMode,
  PipPosition,
  MulticamOverride,
} from "../../../../shared/multicamTransform";

// Snap points as percentages (0-100)
const SNAP_POINTS = {
  horizontal: [
    { value: 50, label: "Center" },
    { value: 33.33, label: "Left third" },
    { value: 66.67, label: "Right third" },
  ],
  vertical: [
    { value: 50, label: "Center" },
    { value: 33.33, label: "Top third" },
    { value: 66.67, label: "Bottom third" },
    { value: 25, label: "Top quarter" },
    { value: 75, label: "Bottom quarter" },
    { value: 20, label: "Top" },
    { value: 80, label: "Bottom" },
  ],
};

const SNAP_THRESHOLD = 3; // Percentage threshold for snapping

interface EditorPreviewProps {
  clip: Clip | null;
  currentTime: number;
  format: VideoFormat;
  template: VideoTemplate;
  onFormatChange: (format: VideoFormat) => void;
  isCaptionsTrackSelected?: boolean;
  isVideoTrackSelected?: boolean;
  onCaptionPositionChange?: (positionX: number, positionY: number) => void;
  onAnimationPositionChange?: (clipId: string, positionX: number, positionY: number) => void;
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string | null) => void;
  previewScale?: number;
  showUiOverlays?: boolean;
  showFormatControls?: boolean;
  showFormatInfo?: boolean;
  showFrameDecorations?: boolean;
  // Multicam video props
  videoSources?: EpisodeVideoSource[];
  segments?: SpeakerSegmentLike[];
  layoutMode?: LayoutMode;
  pipEnabled?: boolean;
  pipPositions?: PipPosition[];
  pipScale?: number;
  defaultVideoSourceId?: string;
  multicamOverrides?: MulticamOverride[];
  transitionStyle?: "cut" | "crossfade";
  // Speaker track props
  speakerPeople?: PodcastPerson[];
  speakerDisplayMode?: "fill" | "circle";
  speakerNameFormat?: SpeakerNameFormat;
  // Podcast metadata for Apple Podcasts CTA overlay
  podcast?: { name: string; coverImageUrl?: string; author?: string; category?: string };
}

export const EditorPreview: React.FC<EditorPreviewProps> = ({
  clip,
  currentTime,
  format,
  template,
  onFormatChange,
  isCaptionsTrackSelected = false,
  isVideoTrackSelected = false,
  onCaptionPositionChange,
  onAnimationPositionChange,
  selectedClipId,
  onSelectClip,
  previewScale,
  showUiOverlays = true,
  showFormatControls = true,
  showFormatInfo = true,
  showFrameDecorations = true,
  videoSources,
  segments,
  layoutMode = "active-speaker",
  pipEnabled = false,
  pipPositions = [],
  pipScale: multicamPipScale = 0.2,
  defaultVideoSourceId,
  multicamOverrides,
  transitionStyle = "cut",
  speakerPeople,
  speakerDisplayMode = "fill",
  speakerNameFormat = "full-name",
  podcast,
}) => {
  const formatConfig = VIDEO_FORMATS[format];
  const previewRef = useRef<HTMLDivElement>(null);
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);
  const [draggingAnimationId, setDraggingAnimationId] = useState<string | null>(null);
  const [captionDragPosition, setCaptionDragPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [animationDragPosition, setAnimationDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [activeSnaps, setActiveSnaps] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [speakerPhotoFailed, setSpeakerPhotoFailed] = useState(false);

  const formatSpeakerName = useCallback(
    (name: string): string | null => {
      if (speakerNameFormat === "off") return null;
      if (speakerNameFormat === "first-name") return name.split(" ")[0];
      return name; // "full-name"
    },
    [speakerNameFormat]
  );

  const captionStyle: CaptionStyle | null = clip ? resolveCaptionStyle(clip) : null;
  const subtitleConfig = captionStyle ? toSubtitleConfig(captionStyle) : null;

  const currentPositionX = subtitleConfig?.positionX ?? 50;
  const currentPositionY = subtitleConfig?.positionY ?? 50;

  const FPS = 30;
  const wordTimings = useMemo(
    () => (clip ? toWordTimings(clip.words, clip.startTime, clip.endTime, FPS) : []),
    [clip]
  );

  // Map wordTimings to Word-compatible objects so findActiveWord can search them.
  // This ensures activeWordIndex maps to wordTimings (not clip.words, which may
  // differ if toWordTimings filters boundary words due to eps tolerance).
  const wordTimingsAsWords = useMemo(
    () =>
      wordTimings.map((wt) => ({
        text: wt.text,
        start: wt.startTime,
        end: wt.endTime,
        confidence: 1,
      })),
    [wordTimings]
  );

  const activeWordIndex = useMemo(() => {
    if (!clip || wordTimingsAsWords.length === 0) return -1;
    return findActiveWord(wordTimingsAsWords, currentTime);
  }, [clip, wordTimingsAsWords, currentTime]);

  // Get current words to display (grouped for subtitle rendering)
  const getCurrentWords = () => {
    if (!clip || wordTimings.length === 0 || activeWordIndex < 0) return [];

    const wordsPerGroup = subtitleConfig?.wordsPerGroup || 4;
    const groupStart = Math.floor(activeWordIndex / wordsPerGroup) * wordsPerGroup;
    return wordTimings.slice(groupStart, groupStart + wordsPerGroup);
  };

  const words = getCurrentWords();
  const bg = template.background;

  // Speaker color palette (matches MultiTrackTimeline)
  const SPEAKER_COLORS = [
    "hsl(200 80% 50%)",
    "hsl(340 80% 50%)",
    "hsl(130 60% 45%)",
    "hsl(40 90% 50%)",
    "hsl(270 70% 55%)",
    "hsl(15 80% 55%)",
  ];

  // Find the active speaker from the speaker track at current time
  const activeSpeaker = useMemo(() => {
    if (!clip?.tracks) return null;

    const speakerTrack = clip.tracks.find((t) => t.type === "speaker");
    if (!speakerTrack?.clips.length) return null;

    // Find which clip is active at currentTime
    const activeClip = speakerTrack.clips.find(
      (c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration
    );
    if (!activeClip?.assetId) return null;

    const speakerLabel = activeClip.assetId;

    // Build unique speaker labels in order to assign colors
    const labels: string[] = [];
    for (const c of speakerTrack.clips) {
      if (c.assetId && !labels.includes(c.assetId)) {
        labels.push(c.assetId);
      }
    }
    const speakerIndex = labels.indexOf(speakerLabel);
    const color = SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length];

    // Look up person by speakerId (stored in assetUrl)
    const person =
      activeClip.assetUrl && speakerPeople
        ? (speakerPeople.find((p) => p.id === activeClip.assetUrl) ?? null)
        : null;

    return {
      label: person?.name || speakerLabel,
      photoUrl: person?.photoUrl || null,
      color,
    };
  }, [clip?.tracks, currentTime, speakerPeople]);

  // Reset photo error state when speaker changes
  useEffect(() => {
    setSpeakerPhotoFailed(false);
  }, [activeSpeaker?.photoUrl]);

  // Get active animation clips (currently visible based on currentTime)
  const activeAnimations = useMemo((): TrackClip[] => {
    if (!clip?.tracks) return [];

    const overlayTracks = clip.tracks.filter((t) => t.type === "video-overlay");
    const animations: TrackClip[] = [];

    for (const track of overlayTracks) {
      for (const trackClip of track.clips) {
        if (
          trackClip.type === "animation" &&
          (trackClip.assetUrl || trackClip.assetSource) &&
          currentTime >= trackClip.startTime &&
          currentTime < trackClip.startTime + trackClip.duration
        ) {
          animations.push(trackClip);
        }
      }
    }

    return animations;
  }, [clip?.tracks, currentTime]);

  // Determine if someone is currently speaking (for waveform overlay)
  const isSpeaking = useMemo(() => {
    if (!clip?.words?.length) return false;
    const absoluteTime = clip.startTime + currentTime;
    return clip.words.some((w) => absoluteTime >= w.start && absoluteTime <= w.end);
  }, [clip?.words, clip?.startTime, currentTime]);

  // Calculate preview dimensions to fit container while maintaining aspect ratio
  const previewMaxHeight = 380;
  const previewMaxWidth = 400;

  let previewWidth: number;
  let previewHeight: number;

  if (typeof previewScale === "number" && Number.isFinite(previewScale)) {
    previewWidth = Math.max(1, formatConfig.width * previewScale);
    previewHeight = Math.max(1, formatConfig.height * previewScale);
  } else {
    const aspectRatio = formatConfig.width / formatConfig.height;

    if (aspectRatio > 1) {
      // Landscape
      previewWidth = Math.min(previewMaxWidth, previewMaxHeight * aspectRatio);
      previewHeight = previewWidth / aspectRatio;
    } else {
      // Portrait or square
      previewHeight = previewMaxHeight;
      previewWidth = previewHeight * aspectRatio;
    }
  }

  const resolvedPreviewScale = previewHeight / formatConfig.height;

  const isMulticam = videoSources && videoSources.length > 0;

  const backgroundStyle: React.CSSProperties = {};
  if (isMulticam) {
    backgroundStyle.backgroundColor = "#000";
  } else if (bg.type === "solid") {
    backgroundStyle.backgroundColor = bg.color;
  } else if (bg.type === "gradient") {
    backgroundStyle.background = `linear-gradient(${bg.gradientDirection || 135}deg, ${bg.gradientColors?.join(", ")})`;
  }

  // Find nearest snap point
  const findSnap = (value: number, points: typeof SNAP_POINTS.horizontal) => {
    for (const point of points) {
      if (Math.abs(value - point.value) < SNAP_THRESHOLD) {
        return point.value;
      }
    }
    return null;
  };

  // Handle caption drag start
  const handleCaptionDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!isCaptionsTrackSelected || !previewRef.current) return;

      e.preventDefault();
      setIsDraggingCaption(true);

      const rect = previewRef.current.getBoundingClientRect();
      // Track final position locally to avoid stale closure issues
      let finalPosition = { x: currentPositionX, y: currentPositionY };

      const handleMouseMove = (e: MouseEvent) => {
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        // Clamp to bounds (with some padding)
        const clampedX = Math.max(10, Math.min(90, x));
        const clampedY = Math.max(10, Math.min(90, y));

        // Find snaps
        const snapX = findSnap(clampedX, SNAP_POINTS.horizontal);
        const snapY = findSnap(clampedY, SNAP_POINTS.vertical);

        setActiveSnaps({ x: snapX, y: snapY });

        finalPosition = {
          x: snapX ?? clampedX,
          y: snapY ?? clampedY,
        };
        setCaptionDragPosition(finalPosition);
      };

      const handleMouseUp = () => {
        setIsDraggingCaption(false);
        setActiveSnaps({ x: null, y: null });

        if (onCaptionPositionChange) {
          onCaptionPositionChange(finalPosition.x, finalPosition.y);
        }
        setCaptionDragPosition(null);

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isCaptionsTrackSelected, currentPositionX, currentPositionY, onCaptionPositionChange]
  );

  // Handle animation drag start
  const handleAnimationDragStart = useCallback(
    (e: React.MouseEvent, animClip: TrackClip) => {
      if (!isVideoTrackSelected || !previewRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      setDraggingAnimationId(animClip.id);

      const rect = previewRef.current.getBoundingClientRect();
      const startPosX = animClip.positionX ?? 50;
      const startPosY = animClip.positionY ?? 50;
      let finalPosition = { x: startPosX, y: startPosY };

      const handleMouseMove = (e: MouseEvent) => {
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const clampedX = Math.max(10, Math.min(90, x));
        const clampedY = Math.max(10, Math.min(90, y));

        const snapX = findSnap(clampedX, SNAP_POINTS.horizontal);
        const snapY = findSnap(clampedY, SNAP_POINTS.vertical);

        setActiveSnaps({ x: snapX, y: snapY });

        finalPosition = {
          x: snapX ?? clampedX,
          y: snapY ?? clampedY,
        };
        setAnimationDragPosition(finalPosition);
      };

      const handleMouseUp = () => {
        setDraggingAnimationId(null);
        setActiveSnaps({ x: null, y: null });

        if (onAnimationPositionChange) {
          onAnimationPositionChange(animClip.id, finalPosition.x, finalPosition.y);
        }
        setAnimationDragPosition(null);

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isVideoTrackSelected, onAnimationPositionChange]
  );

  // Position to use for captions (drag position while dragging, otherwise saved position)
  const displayPositionX = captionDragPosition?.x ?? currentPositionX;
  const displayPositionY = captionDragPosition?.y ?? currentPositionY;

  // Check if anything is being dragged (for snap guides)
  const isDragging = isDraggingCaption || draggingAnimationId !== null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[hsl(var(--bg-elevated))] p-4">
      {/* Format selector tabs */}
      {showFormatControls && (
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-[hsl(var(--bg-surface))] p-1">
          {Object.values(VIDEO_FORMATS).map((f) => (
            <button
              key={f.id}
              onClick={() => onFormatChange(f.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                format === f.id
                  ? "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text))] shadow-sm"
                  : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
              )}
            >
              {f.aspectRatio}
            </button>
          ))}
        </div>
      )}

      {/* Preview container */}
      <div
        ref={previewRef}
        data-video-test="frame"
        className={cn(
          "relative overflow-hidden",
          showFrameDecorations && "rounded-lg shadow-lg",
          (isCaptionsTrackSelected || isVideoTrackSelected) &&
            "ring-2 ring-[hsl(var(--cyan))] ring-offset-2 ring-offset-[hsl(var(--bg-elevated))]"
        )}
        style={{
          width: previewWidth,
          height: previewHeight,
          ...backgroundStyle,
        }}
      >
        {!clip ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/60">No clip selected</p>
          </div>
        ) : (
          <>
            {/* Multicam video background layer */}
            {videoSources && videoSources.length > 0 && (
              <MulticamPreview
                videoSources={videoSources.map((s) => ({
                  id: s.id,
                  label: s.label,
                  personId: s.personId ?? null,
                  sourceType: s.sourceType,
                  syncOffsetMs: s.syncOffsetMs,
                  cropOffsetX: s.cropOffsetX,
                  cropOffsetY: s.cropOffsetY,
                  width: s.width ?? null,
                  height: s.height ?? null,
                  displayOrder: s.displayOrder,
                  proxyBlobUrl: s.proxyBlobUrl,
                }))}
                segments={segments || []}
                currentTime={currentTime}
                clipStartTime={clip.startTime}
                width={previewWidth}
                height={previewHeight}
                layoutMode={layoutMode}
                pipEnabled={pipEnabled}
                pipPositions={pipPositions}
                pipScale={multicamPipScale}
                defaultVideoSourceId={defaultVideoSourceId}
                overrides={multicamOverrides}
                transitionStyle={transitionStyle}
              />
            )}

            {/* Active speaker overlay (from speaker track) */}
            {activeSpeaker && !isMulticam && (
              <div className="absolute inset-0">
                {speakerDisplayMode === "circle" ? (
                  // Circle cutout mode
                  <div className="flex h-full w-full flex-col items-center justify-center">
                    {activeSpeaker.photoUrl && !speakerPhotoFailed ? (
                      <div
                        className="overflow-hidden rounded-full"
                        style={{
                          width: Math.min(previewWidth, previewHeight) * 0.55,
                          height: Math.min(previewWidth, previewHeight) * 0.55,
                        }}
                      >
                        <img
                          src={getMediaUrl(activeSpeaker.photoUrl)}
                          alt={activeSpeaker.label}
                          className="h-full w-full object-cover"
                          onError={() => setSpeakerPhotoFailed(true)}
                        />
                      </div>
                    ) : (
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: Math.min(previewWidth, previewHeight) * 0.55,
                          height: Math.min(previewWidth, previewHeight) * 0.55,
                          backgroundColor: `${activeSpeaker.color}30`,
                        }}
                      >
                        <span
                          className="font-bold"
                          style={{
                            fontSize: Math.min(previewWidth, previewHeight) * 0.18,
                            color: activeSpeaker.color,
                          }}
                        >
                          {activeSpeaker.label.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {formatSpeakerName(activeSpeaker.label) && (
                      <span
                        className="mt-2 font-semibold"
                        style={{
                          fontSize: Math.max(10, Math.min(previewWidth, previewHeight) * 0.06),
                          color: activeSpeaker.color,
                        }}
                      >
                        {formatSpeakerName(activeSpeaker.label)}
                      </span>
                    )}
                  </div>
                ) : (
                  // Fill mode (default)
                  <>
                    {activeSpeaker.photoUrl && !speakerPhotoFailed ? (
                      <>
                        <img
                          src={getMediaUrl(activeSpeaker.photoUrl)}
                          alt={activeSpeaker.label}
                          className="h-full w-full object-cover"
                          onError={() => setSpeakerPhotoFailed(true)}
                        />
                        {formatSpeakerName(activeSpeaker.label) && (
                          <div
                            className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full px-3 py-1"
                            style={{ backgroundColor: `${activeSpeaker.color}CC` }}
                          >
                            <span
                              className="text-xs font-semibold whitespace-nowrap text-white"
                              style={{ fontSize: Math.max(10, previewHeight * 0.035) }}
                            >
                              {formatSpeakerName(activeSpeaker.label)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className="flex h-full w-full flex-col items-center justify-center"
                        style={{ backgroundColor: `${activeSpeaker.color}20` }}
                      >
                        <div
                          className="flex items-center justify-center rounded-full"
                          style={{
                            width: Math.min(previewWidth, previewHeight) * 0.5,
                            height: Math.min(previewWidth, previewHeight) * 0.5,
                            backgroundColor: `${activeSpeaker.color}30`,
                          }}
                        >
                          <span
                            className="font-bold"
                            style={{
                              fontSize: Math.min(previewWidth, previewHeight) * 0.18,
                              color: activeSpeaker.color,
                            }}
                          >
                            {activeSpeaker.label.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        {formatSpeakerName(activeSpeaker.label) && (
                          <span
                            className="mt-2 font-medium"
                            style={{
                              fontSize: Math.min(previewWidth, previewHeight) * 0.06,
                              color: activeSpeaker.color,
                            }}
                          >
                            {formatSpeakerName(activeSpeaker.label)}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Snap guides (shown while dragging) */}
            {isDragging && (
              <>
                {/* Vertical guides */}
                {SNAP_POINTS.horizontal.map((point) => (
                  <div
                    key={`v-${point.value}`}
                    className={cn(
                      "absolute top-0 bottom-0 w-px transition-opacity",
                      activeSnaps.x === point.value
                        ? "bg-[hsl(var(--cyan))] opacity-100"
                        : "bg-white/20 opacity-50"
                    )}
                    style={{ left: `${point.value}%` }}
                  />
                ))}
                {/* Horizontal guides */}
                {SNAP_POINTS.vertical.map((point) => (
                  <div
                    key={`h-${point.value}`}
                    className={cn(
                      "absolute right-0 left-0 h-px transition-opacity",
                      activeSnaps.y === point.value
                        ? "bg-[hsl(var(--cyan))] opacity-100"
                        : "bg-white/20 opacity-50"
                    )}
                    style={{ top: `${point.value}%` }}
                  />
                ))}
              </>
            )}

            {/* Animation overlays */}
            {activeAnimations.map((anim) => {
              const isDraggingThis = draggingAnimationId === anim.id;
              const isAnimSelected = selectedClipId === anim.id;
              const animPosX = isDraggingThis
                ? (animationDragPosition?.x ?? anim.positionX ?? 50)
                : (anim.positionX ?? 50);
              const animPosY = isDraggingThis
                ? (animationDragPosition?.y ?? anim.positionY ?? 50)
                : (anim.positionY ?? 50);

              return (
                <div
                  key={anim.id}
                  className={cn(
                    "absolute",
                    isVideoTrackSelected && "cursor-move",
                    (isDraggingThis || isAnimSelected) &&
                      "rounded-lg ring-2 ring-[hsl(var(--cyan))]"
                  )}
                  style={{
                    left: `${animPosX}%`,
                    top: `${animPosY}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectClip) {
                      onSelectClip(isAnimSelected ? null : anim.id);
                    }
                  }}
                  onMouseDown={
                    isVideoTrackSelected ? (e) => handleAnimationDragStart(e, anim) : undefined
                  }
                >
                  <div
                    style={{
                      width: 200 * resolvedPreviewScale,
                      height: 200 * resolvedPreviewScale,
                    }}
                  >
                    {anim.assetSource === "waveform" ? (
                      <WaveformOverlay isActive={isSpeaking} />
                    ) : anim.assetSource === "youtube-cta" ? (
                      <YouTubeCtaOverlay />
                    ) : anim.assetSource === "apple-podcasts-cta" ? (
                      <ApplePodcastsCtaOverlay podcast={podcast} />
                    ) : null}
                  </div>
                </div>
              );
            })}

            {/* Subtitle - hidden when no active word, draggable when captions track selected */}
            {words.length > 0 && (
              <div
                className={cn(
                  "absolute flex items-center justify-center px-4",
                  isCaptionsTrackSelected && "cursor-move"
                )}
                style={{
                  left: `${displayPositionX}%`,
                  top: `${displayPositionY}%`,
                  transform: "translate(-50%, -50%)",
                  width: "90%",
                  maxWidth: "90%",
                }}
                onMouseDown={handleCaptionDragStart}
              >
                <div
                  className={cn(
                    "",
                    isCaptionsTrackSelected && isDraggingCaption && "ring-2 ring-[hsl(var(--cyan))]"
                  )}
                  style={{
                    backgroundColor: subtitleConfig?.backgroundColor || undefined,
                    padding: `${4 * resolvedPreviewScale}px ${8 * resolvedPreviewScale}px`,
                    borderRadius: `${4 * resolvedPreviewScale}px`,
                  }}
                >
                  <p
                    style={{
                      fontFamily: resolveFontFamily(subtitleConfig?.fontFamily),
                      fontSize: `${(subtitleConfig?.fontSize || 36) * resolvedPreviewScale}px`,
                      fontWeight: subtitleConfig?.fontWeight || 600,
                      lineHeight: 1.2,
                      textAlign: "center",
                      WebkitFontSmoothing: "antialiased",
                      MozOsxFontSmoothing: "grayscale",
                      textRendering: "geometricPrecision",
                    }}
                  >
                    {words.map((w, i) => {
                      const globalIndex = wordTimings.indexOf(w);
                      const isActive = globalIndex === activeWordIndex;
                      return (
                        <span
                          key={i}
                          style={{
                            color: isActive
                              ? subtitleConfig?.highlightColor || subtitleConfig?.color || "#FFD700"
                              : subtitleConfig?.color || "#FFFFFF",
                          }}
                        >
                          {w.text}
                          {i < words.length - 1 ? " " : ""}
                        </span>
                      );
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Drag hint when captions track selected */}
            {showUiOverlays && isCaptionsTrackSelected && !isDragging && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/80">
                Drag captions to reposition
              </div>
            )}

            {/* Drag hint when video track selected */}
            {showUiOverlays &&
              isVideoTrackSelected &&
              !isDragging &&
              activeAnimations.length > 0 && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/80">
                  Drag animations to reposition
                </div>
              )}

            {/* Progress bar */}
            {showUiOverlays && (
              <div className="absolute right-3 bottom-3 left-3">
                <div className="h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white/80 transition-all duration-100"
                    style={{
                      width: `${(currentTime / (clip.endTime - clip.startTime)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Format info */}
      {showFormatInfo && (
        <div className="mt-3 text-center">
          <p className="text-xs text-[hsl(var(--text-muted))]">
            {formatConfig.name} ({formatConfig.width} x {formatConfig.height})
          </p>
          <p className="mt-0.5 text-[10px] text-[hsl(var(--text-tertiary))]">
            {formatConfig.useCases.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
};
