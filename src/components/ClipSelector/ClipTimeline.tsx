import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "../../lib/utils";
import { formatTimestamp } from "../../lib/formats";
import { Word } from "../../lib/types";
import { STOP_WORDS } from "../../lib/constants";

const BUFFER_SECONDS = 10; // Show 10 seconds before and after clip
const ANIMATION_DURATION = 300; // ms

interface ClipTimelineProps {
  startTime: number;
  endTime: number;
  audioDuration: number;
  currentTime?: number;
  isPlaying?: boolean;
  words?: Word[];
  onBoundaryChange: (newStart: number, newEnd: number) => void;
  onSeek?: (time: number) => void;
  disabled?: boolean;
}

export const ClipTimeline: React.FC<ClipTimelineProps> = ({
  startTime,
  endTime,
  audioDuration,
  currentTime = 0,
  isPlaying: _isPlaying = false,
  words = [],
  onBoundaryChange,
  onSeek,
  disabled = false,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // Store the visible window bounds at the moment drag starts
  const [dragStartWindow, setDragStartWindow] = useState<{ start: number; end: number } | null>(
    null
  );

  // Animation state for smooth window transitions
  const [animatedWindow, setAnimatedWindow] = useState<{ start: number; end: number } | null>(null);
  const animationRef = useRef<{
    startTime: number;
    from: { start: number; end: number };
    to: { start: number; end: number };
  } | null>(null);

  // Calculate the base visible window (target when not dragging)
  const baseVisibleStart = Math.max(0, startTime - BUFFER_SECONDS);
  const baseVisibleEnd = Math.min(audioDuration, endTime + BUFFER_SECONDS);

  // Determine the actual visible window to use
  // Priority: dragging > animating > base
  const visibleStart = dragStartWindow?.start ?? animatedWindow?.start ?? baseVisibleStart;
  const visibleEnd = dragStartWindow?.end ?? animatedWindow?.end ?? baseVisibleEnd;
  const visibleDuration = visibleEnd - visibleStart;

  // Easing function for smooth animation
  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

  // Track whether an animation is active (extracted for stable dependency)
  const isAnimating = animatedWindow !== null;

  // Animation loop
  useEffect(() => {
    if (!animationRef.current) return;

    let frameId: number;

    const animate = () => {
      const anim = animationRef.current;
      if (!anim) return;

      const elapsed = Date.now() - anim.startTime;
      const progress = Math.min(1, elapsed / ANIMATION_DURATION);
      const eased = easeOutCubic(progress);

      const currentStart = anim.from.start + (anim.to.start - anim.from.start) * eased;
      const currentEnd = anim.from.end + (anim.to.end - anim.from.end) * eased;

      setAnimatedWindow({ start: currentStart, end: currentEnd });

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        // Animation complete
        setAnimatedWindow(null);
        animationRef.current = null;
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isAnimating]);

  // Calculate display positions (with drag preview)
  const displayStart = useMemo(() => {
    if (dragging === "start" && dragTime !== null) {
      return Math.max(0, Math.min(dragTime, endTime - 2));
    }
    return startTime;
  }, [dragging, dragTime, startTime, endTime]);

  const displayEnd = useMemo(() => {
    if (dragging === "end" && dragTime !== null) {
      return Math.min(audioDuration, Math.max(dragTime, startTime + 2));
    }
    return endTime;
  }, [dragging, dragTime, endTime, startTime, audioDuration]);

  // Calculate positions as percentages within the visible window
  const clipStartPercent = Math.max(
    0,
    Math.min(100, ((displayStart - visibleStart) / visibleDuration) * 100)
  );
  const clipEndPercent = Math.max(
    0,
    Math.min(100, ((displayEnd - visibleStart) / visibleDuration) * 100)
  );

  // Playhead position
  const showPlayhead = currentTime >= displayStart && currentTime <= displayEnd;
  const playheadPercent = showPlayhead
    ? ((currentTime - visibleStart) / visibleDuration) * 100
    : null;

  // Convert pixel position to time
  const getTimeFromPosition = useCallback(
    (clientX: number): number => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const percent = (clientX - rect.left) / rect.width;
      return visibleStart + percent * visibleDuration;
    },
    [visibleStart, visibleDuration]
  );

  const handleMouseDown = (handle: "start" | "end") => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    // Cancel any ongoing animation
    animationRef.current = null;
    setAnimatedWindow(null);

    // Lock the visible window at the current bounds
    setDragStartWindow({ start: baseVisibleStart, end: baseVisibleEnd });
    setDragging(handle);
    setDragTime(handle === "start" ? startTime : endTime);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (disabled || !onSeek) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const percent = (e.clientX - rect.left) / rect.width;
    const clickTime = visibleStart + percent * visibleDuration;

    // Clamp to clip boundaries
    const seekTime = Math.max(startTime, Math.min(endTime, clickTime));
    onSeek(seekTime);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newTime = getTimeFromPosition(e.clientX);
      setDragTime(newTime);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const newTime = getTimeFromPosition(e.clientX);

      // Apply constraints
      let newStart = startTime;
      let newEnd = endTime;

      if (dragging === "start") {
        newStart = Math.max(0, Math.min(newTime, endTime - 2));
      } else {
        newEnd = Math.min(audioDuration, Math.max(newTime, startTime + 2));
      }

      // Calculate new base window for the updated clip
      const newBaseStart = Math.max(0, newStart - BUFFER_SECONDS);
      const newBaseEnd = Math.min(audioDuration, newEnd + BUFFER_SECONDS);

      // Start animation from current locked window to new base window
      const fromWindow = dragStartWindow || { start: baseVisibleStart, end: baseVisibleEnd };

      // Only animate if there's a significant change
      const startDiff = Math.abs(fromWindow.start - newBaseStart);
      const endDiff = Math.abs(fromWindow.end - newBaseEnd);

      if (startDiff > 0.1 || endDiff > 0.1) {
        animationRef.current = {
          startTime: Date.now(),
          from: fromWindow,
          to: { start: newBaseStart, end: newBaseEnd },
        };
        setAnimatedWindow(fromWindow);
      }

      onBoundaryChange(newStart, newEnd);
      setDragging(null);
      setDragTime(null);
      setDragStartWindow(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragging,
    startTime,
    endTime,
    audioDuration,
    getTimeFromPosition,
    onBoundaryChange,
    dragStartWindow,
    baseVisibleStart,
    baseVisibleEnd,
  ]);

  return (
    <div className="space-y-1">
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        className={cn(
          "relative h-10 cursor-pointer overflow-hidden rounded-md",
          "bg-[hsl(var(--bg-base))]",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {/* Background track (unselected region) */}
        <div className="absolute inset-0 bg-[hsl(var(--bg-surface))]" />

        {/* Selected region */}
        <div
          className={cn(
            "absolute top-0 bottom-0",
            dragging ? "bg-[hsl(var(--cyan)/0.4)]" : "bg-[hsl(var(--cyan)/0.25)]"
          )}
          style={{
            left: `${clipStartPercent}%`,
            width: `${Math.max(0, clipEndPercent - clipStartPercent)}%`,
            transition: animatedWindow ? "none" : undefined,
          }}
        />

        {/* Transcript words overlay */}
        {words.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-5">
            <div className="relative h-full w-full">
              {(() => {
                // Filter and space out words to avoid overlap
                const MIN_PERCENT_GAP = 5; // Minimum gap between words as percentage
                let lastShownPercent = -Infinity;

                return words.map((word, i) => {
                  const wordMidpoint = (word.start + word.end) / 2;
                  const wordPercent = ((wordMidpoint - visibleStart) / visibleDuration) * 100;

                  // Only render words that are within the visible window
                  if (wordPercent < -5 || wordPercent > 105) return null;

                  // Highlight word at current playhead position
                  const isActive = currentTime >= word.start && currentTime < word.end;
                  const isStopWord = STOP_WORDS.has(word.text.toLowerCase().replace(/[^a-z]/g, ""));

                  // Always show active word, otherwise check spacing and importance
                  if (!isActive) {
                    if (isStopWord && wordPercent - lastShownPercent < MIN_PERCENT_GAP * 1.5) {
                      return null;
                    }
                    if (wordPercent - lastShownPercent < MIN_PERCENT_GAP) {
                      return null;
                    }
                  }

                  lastShownPercent = wordPercent;

                  return (
                    <span
                      key={i}
                      className={cn(
                        "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-medium whitespace-nowrap",
                        isActive
                          ? "z-10 rounded bg-[hsl(var(--text))] px-1 py-0.5 text-[hsl(var(--bg-base))]"
                          : "text-[hsl(var(--text-tertiary))] opacity-70"
                      )}
                      style={{ left: `${wordPercent}%` }}
                    >
                      {word.text}
                    </span>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Playhead */}
        {playheadPercent !== null && (
          <div
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-[hsl(var(--text))]"
            style={{ left: `${playheadPercent}%` }}
          />
        )}

        {/* Start handle */}
        <div
          className={cn(
            "group/handle absolute top-1/2 z-20 -translate-y-1/2 cursor-ew-resize rounded",
            "flex items-center justify-center",
            "transition-all duration-150",
            dragging === "start" ? "h-8 w-4" : "h-8 w-1 hover:w-4",
            disabled && "cursor-not-allowed"
          )}
          style={{ left: `calc(${clipStartPercent}% - ${dragging === "start" ? 8 : 2}px)` }}
          onMouseDown={handleMouseDown("start")}
        >
          <div
            className={cn(
              "h-full rounded transition-all duration-150",
              dragging === "start"
                ? "w-4 bg-[hsl(var(--cyan))] shadow-md"
                : "w-1 bg-[hsl(var(--cyan)/0.8)] group-hover/handle:w-4 group-hover/handle:bg-[hsl(var(--cyan))] group-hover/handle:shadow-md"
            )}
          />
        </div>

        {/* End handle */}
        <div
          className={cn(
            "group/handle absolute top-1/2 z-20 -translate-y-1/2 cursor-ew-resize rounded",
            "flex items-center justify-center",
            "transition-all duration-150",
            dragging === "end" ? "h-8 w-4" : "h-8 w-1 hover:w-4",
            disabled && "cursor-not-allowed"
          )}
          style={{ left: `calc(${clipEndPercent}% - ${dragging === "end" ? 8 : 2}px)` }}
          onMouseDown={handleMouseDown("end")}
        >
          <div
            className={cn(
              "h-full rounded transition-all duration-150",
              dragging === "end"
                ? "w-4 bg-[hsl(var(--cyan))] shadow-md"
                : "w-1 bg-[hsl(var(--cyan)/0.8)] group-hover/handle:w-4 group-hover/handle:bg-[hsl(var(--cyan))] group-hover/handle:shadow-md"
            )}
          />
        </div>

        {/* Time markers at edges of visible window */}
        <div className="absolute bottom-0.5 left-1 font-mono text-[9px] text-[hsl(var(--text-tertiary))] opacity-60">
          {formatTimestamp(visibleStart)}
        </div>
        <div className="absolute right-1 bottom-0.5 font-mono text-[9px] text-[hsl(var(--text-tertiary))] opacity-60">
          {formatTimestamp(visibleEnd)}
        </div>
      </div>
    </div>
  );
};
