import React, { useMemo } from "react";
import { ChevronDownIcon, VideoIcon, Cross2Icon } from "@radix-ui/react-icons";
import type { Clip } from "../../lib/types";
import { formatDuration } from "../../lib/formats";
import { useDropdown } from "../../hooks/useDropdown";
import { cn } from "../../lib/utils";

interface ClipSelectorProps {
  selectedClipId?: string;
  clips: Clip[];
  onSelect: (clipId: string | undefined) => void;
  disabled?: boolean;
  error?: string;
  allowNoClip?: boolean;
}

export const ClipSelector: React.FC<ClipSelectorProps> = ({
  selectedClipId,
  clips,
  onSelect,
  disabled = false,
  error,
  allowNoClip = true,
}) => {
  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId),
    [clips, selectedClipId]
  );

  const { isOpen, close, containerRef, triggerProps, menuProps, getItemProps } = useDropdown();

  const handleSelect = (clipId: string | undefined) => {
    onSelect(clipId);
    close();
  };

  const hasError = !!error || (selectedClipId && !selectedClip);

  return (
    <div className="relative" ref={containerRef as React.RefObject<HTMLDivElement>}>
      <button
        type="button"
        disabled={disabled}
        {...triggerProps}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
          "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
          hasError
            ? "border-[hsl(var(--error))] bg-[hsl(var(--error)/0.1)]"
            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-[hsl(var(--glass-border-hover))]"
        )}
      >
        <VideoIcon className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
        <span className={cn("flex-1 truncate", !selectedClip && "text-[hsl(var(--text-muted))]")}>
          {selectedClip ? (
            <>
              {selectedClip.name}
              <span className="ml-2 text-[hsl(var(--text-muted))]">
                ({formatDuration(selectedClip.endTime - selectedClip.startTime)})
              </span>
            </>
          ) : selectedClipId ? (
            <span className="text-[hsl(var(--error))]">Clip not found</span>
          ) : (
            "Select a clip..."
          )}
        </span>
        {selectedClipId && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSelect(undefined);
              }
            }}
            className="cursor-pointer rounded p-0.5 hover:bg-[hsl(var(--surface-hover))]"
            aria-label="Clear selection"
          >
            <Cross2Icon className="h-3 w-3" />
          </span>
        )}
        <ChevronDownIcon
          className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {error && <p className="mt-1 text-xs text-[hsl(var(--error))]">{error}</p>}

      {isOpen && (
        <div
          {...menuProps}
          className={cn(
            "absolute top-full left-0 z-50 mt-1 w-full rounded-lg border shadow-lg",
            "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
            "max-h-60 overflow-y-auto"
          )}
        >
          {clips.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-[hsl(var(--text-muted))]">
              No clips available
            </div>
          ) : (
            <>
              {allowNoClip && (
                <button
                  type="button"
                  onClick={() => handleSelect(undefined)}
                  {...getItemProps(0)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-[hsl(var(--surface-hover))]",
                    !selectedClipId && "bg-[hsl(var(--cyan)/0.1)]"
                  )}
                >
                  <span className="text-[hsl(var(--text-muted))]">No clip (text only)</span>
                </button>
              )}
              {clips.map((clip, index) => {
                const offset = allowNoClip ? 1 : 0;
                const duration = clip.endTime - clip.startTime;
                const isSelected = clip.id === selectedClipId;

                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => handleSelect(clip.id)}
                    {...getItemProps(index + offset)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      "hover:bg-[hsl(var(--surface-hover))]",
                      isSelected && "bg-[hsl(var(--cyan)/0.1)]"
                    )}
                  >
                    <VideoIcon className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
                    <span className="flex-1 truncate">{clip.name}</span>
                    <span className="shrink-0 text-xs text-[hsl(var(--text-muted))]">
                      {formatDuration(duration)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
