import React from "react";
import { CheckIcon, StarFilledIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { formatTimestamp, formatDuration } from "../../lib/formats";
import { Clip } from "../../lib/types";

interface ClipStackItemProps {
  clip: Clip;
  index: number;
  isActive: boolean;
  isAccepted: boolean;
  onClick: () => void;
}

export const ClipStackItem: React.FC<ClipStackItemProps> = ({
  clip,
  index,
  isActive,
  isAccepted,
  onClick,
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-[hsl(var(--success))]";
    if (score >= 6) return "text-[hsl(var(--primary))]";
    return "text-[hsl(var(--text-tertiary))]";
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg p-3 text-left transition-all",
        "border",
        isActive
          ? "border-[hsl(var(--cyan))] bg-[hsl(var(--cyan)/0.1)]"
          : "border-transparent bg-[hsl(var(--bg-surface))] hover:border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--bg-elevated))]",
        isAccepted && !isActive && "border-l-2 border-l-[hsl(var(--success))]"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Number badge */}
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded",
            isActive
              ? "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))]"
              : "bg-[hsl(var(--bg-base))]"
          )}
        >
          <span className="text-[10px] font-bold tabular-nums">{index + 1}</span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-xs font-medium",
                isActive ? "text-[hsl(var(--text))]" : "text-[hsl(var(--text-secondary))]"
              )}
            >
              {clip.name}
            </span>
            {isAccepted && <CheckIcon className="h-3 w-3 shrink-0 text-[hsl(var(--success))]" />}
          </div>

          {/* Time info */}
          <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--text-tertiary))]">
            {formatTimestamp(clip.startTime)} · {formatDuration(clip.endTime - clip.startTime)}
          </div>

          {/* Transcript preview */}
          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[hsl(var(--text-tertiary))]">
            {clip.transcript}
          </p>
        </div>

        {/* Score badge */}
        {clip.clippabilityScore && (
          <div className="shrink-0">
            <div className="flex items-center gap-1 rounded bg-[hsl(var(--bg-base))] px-1.5 py-0.5">
              <StarFilledIcon
                className={cn("h-2.5 w-2.5", getScoreColor(clip.clippabilityScore.overall))}
              />
              <span
                className={cn(
                  "font-mono text-[10px] font-medium",
                  getScoreColor(clip.clippabilityScore.overall)
                )}
              >
                {clip.clippabilityScore.overall.toFixed(1)}
              </span>
            </div>
          </div>
        )}
      </div>
    </button>
  );
};
