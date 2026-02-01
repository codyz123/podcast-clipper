import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  PlayIcon,
  PauseIcon,
  CheckIcon,
  Cross2Icon,
  Pencil1Icon,
  TrackPreviousIcon,
  TrackNextIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { formatTimestamp, formatDuration } from "../../lib/formats";
import { Clip, Word } from "../../lib/types";

// Stop words that are less important and can be omitted
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "been",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "our",
  "their",
  "mine",
  "yours",
  "hers",
  "ours",
  "theirs",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "where",
  "when",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
  "now",
  "here",
  "there",
  "then",
  "once",
  "if",
  "because",
  "unless",
  "until",
  "while",
  "although",
  "though",
  "after",
  "before",
  "since",
  "during",
  "about",
  "into",
  "through",
  "above",
  "below",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "um",
  "uh",
  "like",
  "yeah",
  "okay",
  "ok",
  "well",
  "right",
  "actually",
  "basically",
  "literally",
  "really",
  "just",
  "kind",
  "sort",
  "thing",
]);

interface ClipEditorProps {
  clip: Clip;
  index: number;
  totalClips: number;
  isPlaying: boolean;
  isAccepted: boolean;
  isMuted: boolean;
  currentTime: number;
  audioDuration: number;
  transcriptWords: Word[];
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onAccept: () => void;
  onReject: () => void;
  onBoundaryChange: (newStart: number, newEnd: number, newWords: Word[]) => void;
  onTranscriptEdit: (newTranscript: string) => void;
  onPrevClip: () => void;
  onNextClip: () => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onMuteToggle: () => void;
}

export const ClipEditor: React.FC<ClipEditorProps> = ({
  clip,
  index,
  totalClips,
  isPlaying,
  isAccepted,
  isMuted,
  currentTime,
  audioDuration,
  transcriptWords,
  onPlay,
  onPause,
  onSeek,
  onAccept,
  onReject,
  onBoundaryChange,
  onTranscriptEdit,
  onPrevClip,
  onNextClip,
  onScrubStart,
  onScrubEnd,
  onMuteToggle,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(clip.transcript);
  const [dragging, setDragging] = useState<"start" | "end" | "scrub" | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Find the currently highlighted word during playback or scrubbing
  const activeWordIndex = useMemo(() => {
    const time = dragging === "scrub" && dragTime !== null ? dragTime : currentTime;
    if (!clip.words.length) return -1;

    const words = clip.words;
    if (time < words[0].start) return -1;

    let left = 0;
    let right = words.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (words[mid].start <= time) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }, [currentTime, clip.words, dragging, dragTime]);

  const handleBoundaryChange = useCallback(
    (newStart: number, newEnd: number) => {
      const newWords = transcriptWords.filter((w) => w.start >= newStart && w.end <= newEnd);
      onBoundaryChange(newStart, newEnd, newWords);
    },
    [transcriptWords, onBoundaryChange]
  );

  // Timeline calculations
  const clipDuration = clip.endTime - clip.startTime;
  const BUFFER_SECONDS = Math.max(5, clipDuration * 0.2); // 20% buffer or 5s min
  const visibleStart = Math.max(0, clip.startTime - BUFFER_SECONDS);
  const visibleEnd = Math.min(audioDuration, clip.endTime + BUFFER_SECONDS);
  const visibleDuration = visibleEnd - visibleStart;

  const displayStart = useMemo(() => {
    if (dragging === "start" && dragTime !== null) {
      return Math.max(0, Math.min(dragTime, clip.endTime - 2));
    }
    return clip.startTime;
  }, [dragging, dragTime, clip.startTime, clip.endTime]);

  const displayEnd = useMemo(() => {
    if (dragging === "end" && dragTime !== null) {
      return Math.min(audioDuration, Math.max(dragTime, clip.startTime + 2));
    }
    return clip.endTime;
  }, [dragging, dragTime, clip.endTime, clip.startTime, audioDuration]);

  const clipStartPercent = ((displayStart - visibleStart) / visibleDuration) * 100;
  const clipEndPercent = ((displayEnd - visibleStart) / visibleDuration) * 100;

  const displayTime = dragging === "scrub" && dragTime !== null ? dragTime : currentTime;
  const playheadPercent = ((displayTime - visibleStart) / visibleDuration) * 100;

  const getTimeFromPosition = useCallback(
    (clientX: number): number => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return visibleStart + percent * visibleDuration;
    },
    [visibleStart, visibleDuration]
  );

  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const time = getTimeFromPosition(e.clientX);
    const clampedTime = Math.max(clip.startTime, Math.min(clip.endTime, time));

    setDragging("scrub");
    setDragTime(clampedTime);
    onScrubStart();
    onSeek(clampedTime);
  };

  const handleHandleMouseDown = (handle: "start" | "end") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    setDragTime(handle === "start" ? clip.startTime : clip.endTime);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newTime = getTimeFromPosition(e.clientX);

      if (dragging === "scrub") {
        const clampedTime = Math.max(clip.startTime, Math.min(clip.endTime, newTime));
        setDragTime(clampedTime);
        onSeek(clampedTime);
      } else {
        setDragTime(newTime);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragging === "start" || dragging === "end") {
        const newTime = getTimeFromPosition(e.clientX);
        let newStart = clip.startTime;
        let newEnd = clip.endTime;

        if (dragging === "start") {
          newStart = Math.max(0, Math.min(newTime, clip.endTime - 2));
        } else {
          newEnd = Math.min(audioDuration, Math.max(newTime, clip.startTime + 2));
        }

        handleBoundaryChange(newStart, newEnd);
      } else if (dragging === "scrub") {
        onScrubEnd();
      }

      setDragging(null);
      setDragTime(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragging,
    clip.startTime,
    clip.endTime,
    audioDuration,
    getTimeFromPosition,
    handleBoundaryChange,
    onSeek,
    onScrubEnd,
  ]);

  const startEditing = () => {
    setEditText(clip.transcript);
    setIsEditing(true);
  };

  const saveEdit = () => {
    onTranscriptEdit(editText);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditText(clip.transcript);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) {
          onPause();
        } else {
          onPlay();
        }
      } else if (e.code === "ArrowLeft" && e.metaKey) {
        e.preventDefault();
        onPrevClip();
      } else if (e.code === "ArrowRight" && e.metaKey) {
        e.preventDefault();
        onNextClip();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        onSeek(Math.max(clip.startTime, currentTime - 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        onSeek(Math.min(clip.endTime, currentTime + 1));
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    isEditing,
    isPlaying,
    onPlay,
    onPause,
    onPrevClip,
    onNextClip,
    onSeek,
    currentTime,
    clip.startTime,
    clip.endTime,
  ]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevClip}
              disabled={index === 0}
              className={cn(
                "rounded-md p-2 transition-all",
                index === 0
                  ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.5)]"
                  : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
              )}
              title="Previous clip (⌘←)"
            >
              <TrackPreviousIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[60px] text-center font-mono text-sm text-[hsl(var(--text-secondary))]">
              {index + 1} / {totalClips}
            </span>
            <button
              onClick={onNextClip}
              disabled={index === totalClips - 1}
              className={cn(
                "rounded-md p-2 transition-all",
                index === totalClips - 1
                  ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.5)]"
                  : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
              )}
              title="Next clip (⌘→)"
            >
              <TrackNextIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-[hsl(var(--border-subtle))]" />

          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-[hsl(var(--text))]">{clip.name}</h2>
            {clip.isManual && (
              <span className="rounded bg-[hsl(var(--bg-surface))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-tertiary))]">
                Manual
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
              isAccepted
                ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--success)/0.1)] hover:text-[hsl(var(--success))]"
            )}
          >
            <CheckIcon className="h-4 w-4" />
            {isAccepted ? "Accepted" : "Accept"}
          </button>

          <button
            onClick={onReject}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[hsl(var(--text-secondary))] transition-all hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
          >
            <Cross2Icon className="h-4 w-4" />
            Remove
          </button>
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Timeline section */}
        <div className="flex-1 p-6">
          {/* Large timeline */}
          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            className={cn(
              "relative h-32 cursor-crosshair overflow-hidden rounded-lg",
              "bg-[hsl(var(--bg-base))]",
              "border border-[hsl(var(--border-subtle))]",
              dragging === "scrub" && "cursor-ew-resize"
            )}
          >
            {/* Background track */}
            <div className="absolute inset-0 bg-[hsl(var(--bg-surface))]" />

            {/* Selected region */}
            <div
              className={cn(
                "absolute top-0 bottom-0",
                dragging ? "bg-[hsl(var(--cyan)/0.35)]" : "bg-[hsl(var(--cyan)/0.2)]"
              )}
              style={{
                left: `${clipStartPercent}%`,
                width: `${Math.max(0, clipEndPercent - clipStartPercent)}%`,
              }}
            />

            {/* Waveform placeholder / Words overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-8">
              <div className="relative h-full w-full">
                {(() => {
                  // First pass: determine which words to show based on spacing alone
                  const MIN_PERCENT_GAP = 4;
                  let lastShownPercent = -Infinity;
                  const wordsToShow = new Set<number>();

                  clip.words.forEach((word, i) => {
                    const wordMidpoint = (word.start + word.end) / 2;
                    const wordPercent = ((wordMidpoint - visibleStart) / visibleDuration) * 100;

                    if (wordPercent < -5 || wordPercent > 105) return;

                    const isStopWord = STOP_WORDS.has(
                      word.text.toLowerCase().replace(/[^a-z]/g, "")
                    );

                    if (isStopWord && wordPercent - lastShownPercent < MIN_PERCENT_GAP * 1.5) {
                      return;
                    }
                    if (wordPercent - lastShownPercent < MIN_PERCENT_GAP) {
                      return;
                    }

                    wordsToShow.add(i);
                    lastShownPercent = wordPercent;
                  });

                  // Second pass: render the words (active word is always visible but doesn't affect layout)
                  return clip.words.map((word, i) => {
                    const wordMidpoint = (word.start + word.end) / 2;
                    const wordPercent = ((wordMidpoint - visibleStart) / visibleDuration) * 100;

                    if (wordPercent < -5 || wordPercent > 105) return null;

                    const isActive = activeWordIndex === i;
                    const shouldShow = wordsToShow.has(i) || isActive;

                    if (!shouldShow) return null;

                    return (
                      <span
                        key={i}
                        className={cn(
                          "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-medium whitespace-nowrap transition-all duration-75",
                          isActive
                            ? "z-10 rounded-md bg-[hsl(var(--text))] px-2 py-1 text-sm text-[hsl(var(--bg-base))]"
                            : "text-xs text-[hsl(var(--text-tertiary))] opacity-60"
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

            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-[hsl(var(--text))]"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm bg-[hsl(var(--text))]" />
            </div>

            {/* Start handle */}
            <div
              className={cn(
                "group/handle absolute top-0 bottom-0 z-30 cursor-ew-resize",
                "flex items-center justify-center",
                "transition-all duration-150",
                dragging === "start" ? "w-5" : "w-1.5 hover:w-5"
              )}
              style={{ left: `calc(${clipStartPercent}% - ${dragging === "start" ? 10 : 3}px)` }}
              onMouseDown={handleHandleMouseDown("start")}
            >
              <div
                className={cn(
                  "h-full transition-all duration-150",
                  dragging === "start"
                    ? "w-5 bg-[hsl(var(--cyan))] shadow-lg"
                    : "w-1.5 bg-[hsl(var(--cyan)/0.8)] group-hover/handle:w-5 group-hover/handle:bg-[hsl(var(--cyan))] group-hover/handle:shadow-lg"
                )}
              />
              <div
                className={cn(
                  "absolute h-12 w-1 rounded-full bg-[hsl(var(--bg-base))] opacity-50",
                  "transition-opacity duration-150",
                  dragging === "start" ? "opacity-50" : "opacity-0 group-hover/handle:opacity-50"
                )}
              />
            </div>

            {/* End handle */}
            <div
              className={cn(
                "group/handle absolute top-0 bottom-0 z-30 cursor-ew-resize",
                "flex items-center justify-center",
                "transition-all duration-150",
                dragging === "end" ? "w-5" : "w-1.5 hover:w-5"
              )}
              style={{ left: `calc(${clipEndPercent}% - ${dragging === "end" ? 10 : 3}px)` }}
              onMouseDown={handleHandleMouseDown("end")}
            >
              <div
                className={cn(
                  "h-full transition-all duration-150",
                  dragging === "end"
                    ? "w-5 bg-[hsl(var(--cyan))] shadow-lg"
                    : "w-1.5 bg-[hsl(var(--cyan)/0.8)] group-hover/handle:w-5 group-hover/handle:bg-[hsl(var(--cyan))] group-hover/handle:shadow-lg"
                )}
              />
              <div
                className={cn(
                  "absolute h-12 w-1 rounded-full bg-[hsl(var(--bg-base))] opacity-50",
                  "transition-opacity duration-150",
                  dragging === "end" ? "opacity-50" : "opacity-0 group-hover/handle:opacity-50"
                )}
              />
            </div>

            {/* Time markers */}
            <div className="absolute bottom-2 left-3 font-mono text-xs text-[hsl(var(--text-tertiary))] opacity-60">
              {formatTimestamp(visibleStart)}
            </div>
            <div className="absolute right-3 bottom-2 font-mono text-xs text-[hsl(var(--text-tertiary))] opacity-60">
              {formatTimestamp(visibleEnd)}
            </div>
          </div>

          {/* Time display row */}
          <div className="mt-4 flex items-center justify-between">
            <div className="font-mono text-lg text-[hsl(var(--text-secondary))]">
              <span className="text-[hsl(var(--text))]">{formatTimestamp(displayTime)}</span>
              <span className="mx-2 text-[hsl(var(--text-tertiary))]">/</span>
              <span>{formatDuration(clip.endTime - clip.startTime)}</span>
            </div>

            {/* Transport controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSeek(clip.startTime)}
                className="rounded-md p-2 text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                title="Go to start"
              >
                <TrackPreviousIcon className="h-5 w-5" />
              </button>

              <button
                onClick={isPlaying ? onPause : onPlay}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-all",
                  isPlaying
                    ? "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))] hover:bg-[hsl(var(--cyan)/0.85)]"
                    : "bg-[hsl(var(--bg-surface))] text-[hsl(var(--text))] hover:bg-[hsl(var(--bg-elevated))]"
                )}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? (
                  <PauseIcon className="h-6 w-6" />
                ) : (
                  <PlayIcon className="h-6 w-6 translate-x-0.5" />
                )}
              </button>

              <button
                onClick={() => onSeek(clip.endTime)}
                className="rounded-md p-2 text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                title="Go to end"
              >
                <TrackNextIcon className="h-5 w-5" />
              </button>

              <div className="mx-2 h-5 w-px bg-[hsl(var(--border-subtle))]" />

              <button
                onClick={onMuteToggle}
                className={cn(
                  "rounded-md p-2 transition-all",
                  isMuted
                    ? "text-[hsl(var(--error))]"
                    : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                )}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <SpeakerOffIcon className="h-5 w-5" />
                ) : (
                  <SpeakerLoudIcon className="h-5 w-5" />
                )}
              </button>
            </div>

            <div className="font-mono text-sm text-[hsl(var(--text-tertiary))]">
              {formatTimestamp(clip.startTime)} — {formatTimestamp(clip.endTime)}
            </div>
          </div>
        </div>

        {/* Transcript section */}
        <div className="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface)/0.5)] p-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
              Transcript
            </span>
            {!isEditing && (
              <button
                onClick={startEditing}
                className="rounded p-1 text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
              >
                <Pencil1Icon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isEditing ? (
            <div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className={cn(
                  "w-full resize-none rounded-md p-3 text-sm",
                  "border border-[hsl(var(--border-default))] bg-[hsl(var(--bg-base))]",
                  "text-[hsl(var(--text-secondary))]",
                  "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                )}
                rows={4}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={saveEdit}
                  className="rounded-md bg-[hsl(var(--cyan))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--bg-base))] transition-colors hover:bg-[hsl(var(--cyan)/0.85)]"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))]"
                >
                  Cancel
                </button>
                <span className="text-[10px] text-[hsl(var(--text-tertiary))]">
                  Enter to save, Esc to cancel
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
              "
              {clip.words.map((word, i) => (
                <span
                  key={i}
                  className={cn(
                    "transition-colors",
                    activeWordIndex === i &&
                      "rounded bg-[hsl(var(--cyan)/0.3)] px-0.5 text-[hsl(var(--text))]"
                  )}
                >
                  {word.text}
                  {i < clip.words.length - 1 ? " " : ""}
                </span>
              ))}
              "
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
