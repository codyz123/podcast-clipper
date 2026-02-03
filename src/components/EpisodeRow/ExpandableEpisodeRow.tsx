import React from "react";
import {
  TrashIcon,
  SpeakerLoudIcon,
  PersonIcon,
  CalendarIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import { StageProgressBar } from "../ui/StageProgressBar";
import { SubStepGrid } from "./SubStepGrid";
import { Episode } from "../../hooks/useEpisodes";
import { StageId, SubStepId, StageStatus, StageStatusWithSubSteps } from "../../lib/statusConfig";
import { formatDuration } from "../../lib/formats";
import { cn } from "../../lib/utils";

interface ExpandableEpisodeRowProps {
  episode: Episode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onLoad: (episodeId: string) => void;
  onDelete: (episode: Episode) => void;
  onStageStatusChange: (stageId: StageId, status: StageStatus) => void;
  onSubStepStatusChange: (subStepId: SubStepId, status: StageStatus) => void;
  animationDelay?: number;
}

export const ExpandableEpisodeRow: React.FC<ExpandableEpisodeRowProps> = ({
  episode,
  isExpanded,
  onToggleExpand,
  onLoad,
  onDelete,
  onStageStatusChange,
  onSubStepStatusChange,
  animationDelay = 0,
}) => {
  const hasAudio = !!episode.audioBlobUrl;
  const guestName = episode.guests?.[0]?.name || null;

  const formatPublishDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleRowClick = () => {
    onLoad(episode.id);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(episode);
  };

  // Cast stageStatus to proper type
  const stageStatus = (episode.stageStatus || {}) as StageStatusWithSubSteps;

  return (
    <div
      className={cn("group", "animate-fadeInUp")}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Main Row */}
      <div
        onClick={handleRowClick}
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-lg px-4 py-3 transition-all duration-150",
          "bg-[hsl(var(--surface)/0.5)]",
          "border border-transparent",
          "hover:border-[hsl(var(--glass-border))]",
          "hover:bg-[hsl(var(--surface)/0.8)]",
          isExpanded && "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface)/0.8)]"
        )}
      >
        {/* Expand/Collapse Toggle */}
        <button
          onClick={handleExpandClick}
          className={cn(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
            "border border-[hsl(var(--glass-border)/0.5)]",
            "bg-[hsl(var(--surface)/0.5)]",
            "text-[hsl(var(--text-ghost))]",
            "hover:bg-[hsl(var(--surface))]",
            "hover:text-[hsl(var(--text-muted))]",
            "hover:border-[hsl(var(--glass-border))]",
            "transition-all",
            "focus:outline-none"
          )}
          aria-label={isExpanded ? "Collapse row" : "Expand row"}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </button>

        {/* Episode Name + Duration */}
        <div className="w-[260px] min-w-0 flex-shrink-0">
          <h3 className="truncate font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
            {episode.episodeNumber && (
              <span className="mr-2 text-[hsl(var(--text-ghost))]">#{episode.episodeNumber}</span>
            )}
            {episode.name}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--text-ghost))]">
            {hasAudio && episode.audioDuration ? (
              <span className="flex items-center gap-1">
                <SpeakerLoudIcon className="h-3 w-3" />
                {formatDuration(episode.audioDuration)}
              </span>
            ) : (
              <span>No audio</span>
            )}
          </div>
        </div>

        {/* Guest */}
        <div className="hidden w-[120px] flex-shrink-0 sm:block">
          {guestName ? (
            <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted))]">
              <PersonIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />
              <span className="truncate">{guestName}</span>
            </span>
          ) : (
            <span className="text-xs text-[hsl(var(--text-ghost))]">-</span>
          )}
        </div>

        {/* Published Date */}
        <div className="hidden w-[100px] flex-shrink-0 sm:block">
          {episode.publishDate ? (
            <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted))]">
              <CalendarIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />
              <span>{formatPublishDate(episode.publishDate)}</span>
            </span>
          ) : (
            <span className="text-xs text-[hsl(var(--text-ghost))]">-</span>
          )}
        </div>

        {/* Stage Progress Bar - only show when collapsed */}
        {!isExpanded && (
          <div className="hidden flex-1 sm:block">
            <StageProgressBar
              stageStatus={episode.stageStatus}
              onStageStatusChange={(stageId, nextStatus) =>
                onStageStatusChange(stageId as StageId, nextStatus)
              }
            />
          </div>
        )}

        {/* Spacer when expanded */}
        {isExpanded && <div className="hidden flex-1 sm:block" />}

        {/* Actions */}
        <div className="flex w-[60px] items-center justify-end gap-1">
          <button
            onClick={handleDeleteClick}
            className={cn(
              "rounded-md p-1.5 opacity-0 transition-all group-hover:opacity-100",
              "text-[hsl(var(--text-ghost))]",
              "hover:text-[hsl(var(--error))]",
              "hover:bg-[hsl(var(--error)/0.1)]"
            )}
            aria-label="Delete episode"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
          <ChevronRightIcon
            className={cn(
              "h-4 w-4 transition-all",
              "text-[hsl(var(--text-ghost))]",
              "group-hover:text-[hsl(var(--text-muted))]",
              "group-hover:translate-x-0.5"
            )}
          />
        </div>
      </div>

      {/* Mobile: Show guest, date, and progress below */}
      {!isExpanded && (
        <div className="mt-2 flex flex-wrap items-center gap-3 px-4 pb-2 sm:hidden">
          {guestName && (
            <span className="flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
              <PersonIcon className="h-3 w-3" />
              {guestName}
            </span>
          )}
          {episode.publishDate && (
            <span className="flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
              <CalendarIcon className="h-3 w-3" />
              {formatPublishDate(episode.publishDate)}
            </span>
          )}
          <StageProgressBar
            stageStatus={episode.stageStatus}
            compact
            onStageStatusChange={(stageId, nextStatus) =>
              onStageStatusChange(stageId as StageId, nextStatus)
            }
          />
        </div>
      )}

      {/* Expanded: SubStepGrid */}
      {isExpanded && (
        <div className="px-4 pb-3">
          <SubStepGrid
            stageStatus={stageStatus}
            onStageStatusChange={onStageStatusChange}
            onSubStepStatusChange={onSubStepStatusChange}
          />
        </div>
      )}
    </div>
  );
};
