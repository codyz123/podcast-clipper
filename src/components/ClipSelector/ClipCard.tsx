import React, { useState, useMemo, useCallback } from "react";
import {
  PlayIcon,
  PauseIcon,
  CheckIcon,
  Cross2Icon,
  StarFilledIcon,
  Pencil1Icon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { formatTimestamp, formatDuration } from "../../lib/formats";
import { Clip, Word } from "../../lib/types";
import { ClipTimeline } from "./ClipTimeline";

interface ClipCardProps {
  clip: Clip;
  index: number;
  isPlaying: boolean;
  isAccepted: boolean;
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
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  index,
  isPlaying,
  isAccepted,
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
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(clip.transcript);

  // Find the currently highlighted word during playback
  const activeWordIndex = useMemo(() => {
    if (!isPlaying || !clip.words.length) return -1;

    // Binary search for the word at current time
    const words = clip.words;
    if (currentTime < words[0].start) return -1;

    let left = 0;
    let right = words.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (words[mid].start <= currentTime) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }, [isPlaying, currentTime, clip.words]);

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-[hsl(var(--success))]";
    if (score >= 6) return "text-[hsl(var(--primary))]";
    return "text-[hsl(var(--text-tertiary))]";
  };

  const handleBoundaryChange = useCallback(
    (newStart: number, newEnd: number) => {
      // Recalculate words array for new range
      const newWords = transcriptWords.filter((w) => w.start >= newStart && w.end <= newEnd);
      onBoundaryChange(newStart, newEnd, newWords);
    },
    [transcriptWords, onBoundaryChange]
  );

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

  return (
    <div
      className={cn(
        "group rounded-lg transition-all duration-150",
        "border bg-[hsl(var(--bg-base))]",
        isAccepted
          ? "border-l-4 border-[hsl(var(--success)/0.3)] border-l-[hsl(var(--success))]"
          : "border-[hsl(var(--border-subtle))] hover:border-[hsl(var(--border-default))]",
        "hover:bg-[hsl(var(--bg-elevated))]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        {/* Number */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--bg-surface))]">
          <span className="text-[11px] font-semibold text-[hsl(var(--text-tertiary))] tabular-nums">
            {index + 1}
          </span>
        </div>

        {/* Title */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-medium text-[hsl(var(--text-primary))]">{clip.name}</h4>
            {clip.isManual && (
              <span className="rounded bg-[hsl(var(--bg-surface))] px-1.5 py-0.5 text-[9px] font-medium text-[hsl(var(--text-tertiary))]">
                Manual
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Accept button */}
          <button
            onClick={onAccept}
            className={cn(
              "rounded-md p-1.5 transition-all",
              isAccepted
                ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--success)/0.1)] hover:text-[hsl(var(--success))]"
            )}
            title="Accept clip"
          >
            <CheckIcon className="h-4 w-4" />
          </button>

          {/* Reject button */}
          <button
            onClick={onReject}
            className="rounded-md p-1.5 text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
            title="Remove clip"
          >
            <Cross2Icon className="h-4 w-4" />
          </button>

          {/* Play/Pause button */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            className={cn(
              "rounded-md p-1.5 transition-all",
              isPlaying
                ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
                : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--cyan)/0.1)] hover:text-[hsl(var(--cyan))]"
            )}
            title={isPlaying ? "Pause" : "Play clip"}
          >
            {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>

          {/* Score */}
          {clip.clippabilityScore && (
            <div className="ml-1 flex items-center gap-1.5 rounded-md bg-[hsl(var(--bg-surface))] px-2 py-1">
              <StarFilledIcon
                className={cn("h-3 w-3", getScoreColor(clip.clippabilityScore.overall))}
              />
              <span
                className={cn(
                  "font-mono text-[11px] font-medium",
                  getScoreColor(clip.clippabilityScore.overall)
                )}
              >
                {clip.clippabilityScore.overall.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 py-2">
        <ClipTimeline
          startTime={clip.startTime}
          endTime={clip.endTime}
          audioDuration={audioDuration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onBoundaryChange={handleBoundaryChange}
          onSeek={onSeek}
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-[hsl(var(--text-tertiary))]">
          <span>{formatTimestamp(clip.startTime)}</span>
          <span>{formatDuration(clip.endTime - clip.startTime)}</span>
          <span>{formatTimestamp(clip.endTime)}</span>
        </div>
      </div>

      {/* Transcript */}
      <div className="px-4 pb-3">
        {isEditing ? (
          <div className="relative">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleKeyDown}
              autoFocus
              className={cn(
                "w-full resize-none rounded-md p-2 text-[12px]",
                "border border-[hsl(var(--border-default))] bg-[hsl(var(--bg-surface))]",
                "text-[hsl(var(--text-secondary))]",
                "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
              )}
              rows={3}
            />
            <div className="mt-1 text-[10px] text-[hsl(var(--text-tertiary))]">
              Enter to save, Esc to cancel
            </div>
          </div>
        ) : (
          <div
            onClick={startEditing}
            className={cn(
              "cursor-text rounded-md p-2 transition-colors",
              "hover:bg-[hsl(var(--bg-surface))]",
              "group/transcript"
            )}
          >
            <p className="text-[12px] leading-relaxed text-[hsl(var(--text-secondary))]">
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
            <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/transcript:opacity-100">
              <Pencil1Icon className="h-3 w-3 text-[hsl(var(--text-tertiary))]" />
              <span className="text-[10px] text-[hsl(var(--text-tertiary))]">Click to edit</span>
            </div>
          </div>
        )}
      </div>

      {/* Explanation */}
      {clip.clippabilityScore?.explanation && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-[hsl(var(--primary))] italic">
            {clip.clippabilityScore.explanation}
          </p>
        </div>
      )}

      {/* Scores detail */}
      {clip.clippabilityScore && (
        <div className="border-t border-[hsl(var(--border-subtle))] px-4 pt-1 pb-3">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[hsl(var(--text-tertiary))]">
              Hook:{" "}
              <span className={getScoreColor(clip.clippabilityScore.hook)}>
                {clip.clippabilityScore.hook}
              </span>
            </span>
            <span className="text-[hsl(var(--text-tertiary))]">
              Clarity:{" "}
              <span className={getScoreColor(clip.clippabilityScore.clarity)}>
                {clip.clippabilityScore.clarity}
              </span>
            </span>
            <span className="text-[hsl(var(--text-tertiary))]">
              Emotion:{" "}
              <span className={getScoreColor(clip.clippabilityScore.emotion)}>
                {clip.clippabilityScore.emotion}
              </span>
            </span>
            <span className="text-[hsl(var(--text-tertiary))]">
              Quotable:{" "}
              <span className={getScoreColor(clip.clippabilityScore.quotable)}>
                {clip.clippabilityScore.quotable}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
