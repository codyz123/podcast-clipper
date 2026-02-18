/**
 * Transparent overlay on top of the Remotion Player that handles all
 * interactive features: caption drag, animation drag/resize, snap guides,
 * selection rings, resize handles, drag hints, and progress bar.
 *
 * Does NOT render any visual content (captions, animations, backgrounds, etc.)
 * — those are rendered by the Remotion composition underneath.
 */

import React, { useState, useCallback, useMemo } from "react";
import { Clip, TrackClip } from "../../../lib/types";
import { cn } from "../../../lib/utils";
import type { SubtitleConfig } from "../../../lib/clipTransform";

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

interface InteractiveOverlayProps {
  clip: Clip;
  currentTime: number;
  clipDuration: number;
  subtitleConfig: SubtitleConfig | null;
  isCaptionsTrackSelected: boolean;
  isVideoTrackSelected: boolean;
  onCaptionPositionChange?: (positionX: number, positionY: number) => void;
  onAnimationPositionChange?: (clipId: string, positionX: number, positionY: number) => void;
  onAnimationScaleChange?: (clipId: string, scale: number) => void;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  showUiOverlays: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  displayScale: number;
}

export const InteractiveOverlay: React.FC<InteractiveOverlayProps> = ({
  clip,
  currentTime,
  clipDuration,
  subtitleConfig,
  isCaptionsTrackSelected,
  isVideoTrackSelected,
  onCaptionPositionChange,
  onAnimationPositionChange,
  onAnimationScaleChange,
  selectedClipId,
  onSelectClip,
  showUiOverlays,
  containerRef,
  displayScale,
}) => {
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);
  const [draggingAnimationId, setDraggingAnimationId] = useState<string | null>(null);
  const [resizingAnimationId, setResizingAnimationId] = useState<string | null>(null);
  const [resizingScale, setResizingScale] = useState<number | null>(null);
  const [captionDragPosition, setCaptionDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [animationDragPosition, setAnimationDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [activeSnaps, setActiveSnaps] = useState<{
    x: number | null;
    y: number | null;
  }>({ x: null, y: null });

  // Current caption position from config
  const currentPositionX = subtitleConfig?.positionX ?? 50;
  const currentPositionY = subtitleConfig?.positionY ?? 50;

  // Active animation clips (currently visible based on currentTime)
  const activeAnimations = useMemo((): TrackClip[] => {
    if (!clip?.tracks) return [];

    const overlayTracks = clip.tracks.filter((t) => t.type === "video-overlay");
    const animations: TrackClip[] = [];

    for (const track of overlayTracks) {
      for (const trackClip of track.clips) {
        if (
          ((trackClip.type === "animation" && (trackClip.assetUrl || trackClip.assetSource)) ||
            (trackClip.type === "image" &&
              trackClip.assetSource === "branding" &&
              trackClip.assetUrl)) &&
          currentTime >= trackClip.startTime &&
          currentTime < trackClip.startTime + trackClip.duration
        ) {
          animations.push(trackClip);
        }
      }
    }

    return animations;
  }, [clip?.tracks, currentTime]);

  // Has any words to show captions
  const hasWords = clip?.words?.length > 0;

  // Find nearest snap point
  const findSnap = (value: number, points: typeof SNAP_POINTS.horizontal): number | null => {
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
      if (!isCaptionsTrackSelected || !containerRef.current) return;

      e.preventDefault();
      setIsDraggingCaption(true);

      const rect = containerRef.current.getBoundingClientRect();
      let finalPosition = { x: currentPositionX, y: currentPositionY };

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
    [
      isCaptionsTrackSelected,
      currentPositionX,
      currentPositionY,
      onCaptionPositionChange,
      containerRef,
    ]
  );

  // Handle animation drag start
  const handleAnimationDragStart = useCallback(
    (e: React.MouseEvent, animClip: TrackClip) => {
      if (!isVideoTrackSelected || !containerRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      setDraggingAnimationId(animClip.id);

      const rect = containerRef.current.getBoundingClientRect();
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
    [isVideoTrackSelected, onAnimationPositionChange, containerRef]
  );

  // Handle animation resize via corner drag
  const handleAnimationResizeStart = useCallback(
    (e: React.MouseEvent, animClip: TrackClip) => {
      if (!containerRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + ((animClip.positionX ?? 50) / 100) * rect.width;
      const centerY = rect.top + ((animClip.positionY ?? 50) / 100) * rect.height;
      const initialDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      const startScale = animClip.scale ?? 1;
      let latestScale = startScale;

      setResizingAnimationId(animClip.id);

      const handleMouseMove = (e: MouseEvent) => {
        const currentDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
        const newScale = Math.max(0.1, Math.min(5.0, startScale * (currentDist / initialDist)));
        latestScale = newScale;
        setResizingScale(newScale);
      };

      const handleMouseUp = () => {
        if (onAnimationScaleChange) {
          onAnimationScaleChange(animClip.id, latestScale);
        }
        setResizingAnimationId(null);
        setResizingScale(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onAnimationScaleChange, containerRef]
  );

  // Position to use for captions (drag position while dragging, otherwise saved position)
  const displayPositionX = captionDragPosition?.x ?? currentPositionX;
  const displayPositionY = captionDragPosition?.y ?? currentPositionY;

  // Check if anything is being dragged (for snap guides)
  const isDragging = isDraggingCaption || draggingAnimationId !== null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
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

      {/* Animation overlay drag targets */}
      {activeAnimations.map((anim) => {
        const isDraggingThis = draggingAnimationId === anim.id;
        const isAnimSelected = selectedClipId === anim.id;
        const animPosX = isDraggingThis
          ? (animationDragPosition?.x ?? anim.positionX ?? 50)
          : (anim.positionX ?? 50);
        const animPosY = isDraggingThis
          ? (animationDragPosition?.y ?? anim.positionY ?? 50)
          : (anim.positionY ?? 50);
        const overlayScale =
          resizingAnimationId === anim.id && resizingScale !== null
            ? resizingScale
            : (anim.scale ?? 1);

        return (
          <div
            key={anim.id}
            className={cn(
              "absolute",
              isVideoTrackSelected && "cursor-move",
              (isDraggingThis || isAnimSelected) && "rounded-lg ring-2 ring-[hsl(var(--cyan))]"
            )}
            style={{
              left: `${animPosX}%`,
              top: `${animPosY}%`,
              transform: "translate(-50%, -50%)",
              width: 200 * displayScale * overlayScale,
              height: 200 * displayScale * overlayScale,
              pointerEvents: isVideoTrackSelected ? "auto" : "none",
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
            {/* Corner resize handles */}
            {isAnimSelected && isVideoTrackSelected && (
              <>
                {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                  <div
                    key={corner}
                    className="absolute h-3 w-3 rounded-full border-2 border-white bg-[hsl(var(--cyan))]"
                    style={{
                      ...(corner.includes("n") ? { top: -6 } : { bottom: -6 }),
                      ...(corner.includes("w") ? { left: -6 } : { right: -6 }),
                      cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                      pointerEvents: "auto",
                    }}
                    onMouseDown={(e) => handleAnimationResizeStart(e, anim)}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}

      {/* Caption drag target — invisible, positioned over the composition's captions */}
      {hasWords && (
        <div
          className={cn(
            "absolute",
            isCaptionsTrackSelected && "cursor-move",
            isCaptionsTrackSelected && isDraggingCaption && "ring-2 ring-[hsl(var(--cyan))]"
          )}
          style={{
            left: `${displayPositionX}%`,
            top: `${displayPositionY}%`,
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: "90%",
            height: 60 * displayScale, // Approximate caption hit area
            pointerEvents: isCaptionsTrackSelected ? "auto" : "none",
          }}
          onMouseDown={handleCaptionDragStart}
        />
      )}

      {/* Drag hint when captions track selected */}
      {showUiOverlays && isCaptionsTrackSelected && !isDragging && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/80"
          style={{ pointerEvents: "none" }}
        >
          Drag captions to reposition
        </div>
      )}

      {/* Drag hint when video track selected */}
      {showUiOverlays && isVideoTrackSelected && !isDragging && activeAnimations.length > 0 && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/80"
          style={{ pointerEvents: "none" }}
        >
          Drag animations to reposition
        </div>
      )}

      {/* Progress bar */}
      {showUiOverlays && (
        <div className="absolute right-3 bottom-3 left-3" style={{ pointerEvents: "none" }}>
          <div className="h-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white/80 transition-all duration-100"
              style={{
                width: `${clipDuration > 0 ? (currentTime / clipDuration) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
