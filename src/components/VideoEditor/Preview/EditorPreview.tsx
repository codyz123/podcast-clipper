import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Lottie from "lottie-react";
import {
  Clip,
  VideoFormat,
  VideoTemplate,
  VIDEO_FORMATS,
  CaptionStyle,
  CAPTION_PRESETS,
  TrackClip,
} from "../../../lib/types";
import { cn } from "../../../lib/utils";
import { fetchLottieData } from "../../../services/assets/lottieService";

// Component to render a single Lottie animation with lazy loading
const LottieOverlay: React.FC<{ url: string }> = ({ url }) => {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchLottieData(url).then((data) => {
      if (mounted && data) {
        setAnimationData(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, [url]);

  if (!animationData) return null;

  return (
    <Lottie animationData={animationData} loop={true} autoplay={true} className="h-full w-full" />
  );
};

// Component to render GIF/WebP stickers (for GIPHY and Tenor)
const StickerOverlay: React.FC<{ url: string }> = ({ url }) => {
  return (
    <img
      src={url}
      alt=""
      className="h-full w-full object-contain"
      style={{ pointerEvents: "none" }}
    />
  );
};

// Unified animation overlay that renders based on source type
const AnimationOverlay: React.FC<{
  url: string;
  source?: "lottie" | "giphy" | "tenor";
}> = ({ url, source = "lottie" }) => {
  if (source === "giphy" || source === "tenor") {
    return <StickerOverlay url={url} />;
  }
  return <LottieOverlay url={url} />;
};

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

  // Get caption style from clip or fall back to template
  const getCaptionStyle = (): CaptionStyle | null => {
    if (clip?.captionStyle) return clip.captionStyle;
    // Find caption track and use its style
    const captionTrack = clip?.tracks?.find((t) => t.type === "captions");
    if (captionTrack?.captionStyle) return captionTrack.captionStyle;
    // Fall back to Hormozi preset if no style set
    return { ...CAPTION_PRESETS.hormozi, preset: "hormozi" };
  };

  const captionStyle = getCaptionStyle();

  // Get current position (from style or default to center)
  const currentPositionX = captionStyle?.positionX ?? 50;
  const currentPositionY = captionStyle?.positionY ?? 50;

  // Get current words to display
  const getCurrentWords = () => {
    if (!clip) return [];

    const absoluteTime = clip.startTime + currentTime;
    const wordsPerGroup = captionStyle?.wordsPerLine || template?.subtitle?.wordsPerGroup || 3;

    let currentWordIndex = clip.words.findIndex(
      (w) => w.start <= absoluteTime && w.end >= absoluteTime
    );

    if (currentWordIndex === -1) {
      currentWordIndex = clip.words.findIndex((w) => w.start > absoluteTime);
      if (currentWordIndex > 0) currentWordIndex--;
    }
    if (currentWordIndex === -1) currentWordIndex = 0;

    const groupStart = Math.floor(currentWordIndex / wordsPerGroup) * wordsPerGroup;
    return clip.words.slice(groupStart, groupStart + wordsPerGroup);
  };

  // Find the current active word for highlighting
  const getActiveWordIndex = () => {
    if (!clip) return -1;
    const absoluteTime = clip.startTime + currentTime;
    return clip.words.findIndex((w) => w.start <= absoluteTime && w.end >= absoluteTime);
  };

  const words = getCurrentWords();
  const activeWordIndex = getActiveWordIndex();
  const bg = template.background;

  // Get active animation clips (currently visible based on currentTime)
  const activeAnimations = useMemo((): TrackClip[] => {
    if (!clip?.tracks) return [];

    const overlayTracks = clip.tracks.filter((t) => t.type === "video-overlay");
    const animations: TrackClip[] = [];

    for (const track of overlayTracks) {
      for (const trackClip of track.clips) {
        if (
          trackClip.type === "animation" &&
          trackClip.assetUrl &&
          currentTime >= trackClip.startTime &&
          currentTime < trackClip.startTime + trackClip.duration
        ) {
          animations.push(trackClip);
        }
      }
    }

    return animations;
  }, [clip?.tracks, currentTime]);

  // Calculate preview dimensions to fit container while maintaining aspect ratio
  const previewMaxHeight = 380;
  const previewMaxWidth = 400;

  let previewWidth: number;
  let previewHeight: number;

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

  const backgroundStyle: React.CSSProperties = {};
  if (bg.type === "solid") {
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

      {/* Preview container */}
      <div
        ref={previewRef}
        className={cn(
          "relative overflow-hidden rounded-lg shadow-lg",
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
                  <div className="h-24 w-24">
                    <AnimationOverlay url={anim.assetUrl!} source={anim.assetSource} />
                  </div>
                </div>
              );
            })}

            {/* Subtitle - draggable when captions track selected */}
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
                  "rounded px-2 py-1",
                  isCaptionsTrackSelected && isDraggingCaption && "ring-2 ring-[hsl(var(--cyan))]"
                )}
                style={{
                  backgroundColor: captionStyle?.backgroundColor || undefined,
                }}
              >
                <p
                  style={{
                    fontFamily: captionStyle?.fontFamily || "Inter",
                    fontSize: `${(captionStyle?.fontSize || 36) * 0.35}px`,
                    fontWeight: captionStyle?.fontWeight || 600,
                    textAlign: "center",
                  }}
                >
                  {words.map((w, i) => {
                    const globalIndex = clip.words.indexOf(w);
                    const isActive = globalIndex === activeWordIndex;
                    return (
                      <span
                        key={i}
                        style={{
                          color: isActive
                            ? captionStyle?.highlightColor || "#FFD700"
                            : captionStyle?.primaryColor || "#FFFFFF",
                          transition: "color 0.1s ease-out",
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

            {/* Drag hint when captions track selected */}
            {isCaptionsTrackSelected && !isDragging && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/80">
                Drag captions to reposition
              </div>
            )}

            {/* Drag hint when video track selected */}
            {isVideoTrackSelected && !isDragging && activeAnimations.length > 0 && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/80">
                Drag animations to reposition
              </div>
            )}

            {/* Progress bar */}
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
          </>
        )}
      </div>

      {/* Format info */}
      <div className="mt-3 text-center">
        <p className="text-xs text-[hsl(var(--text-muted))]">
          {formatConfig.name} ({formatConfig.width} x {formatConfig.height})
        </p>
        <p className="mt-0.5 text-[10px] text-[hsl(var(--text-tertiary))]">
          {formatConfig.useCases.join(", ")}
        </p>
      </div>
    </div>
  );
};
