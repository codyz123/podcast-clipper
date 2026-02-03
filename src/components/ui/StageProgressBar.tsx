import type { MouseEvent } from "react";
import { cn } from "../../lib/utils";
import type { StageStatus, StageStatusWithSubSteps, StageId } from "../../lib/statusConfig";

interface StageProgressBarProps {
  stageStatus?: StageStatusWithSubSteps;
  compact?: boolean;
  fullWidth?: boolean;
  onStageStatusChange?: (stageId: string, nextStatus: StageStatus) => void;
}

const STAGES = [
  { id: "planning", label: "Plan" },
  { id: "production", label: "Prod" },
  { id: "post-production", label: "Post" },
  { id: "distribution", label: "Dist" },
  { id: "marketing", label: "Mkt" },
] as const;

const statusColors: Record<StageStatus, { bg: string; glow?: string }> = {
  "not-started": { bg: "bg-[hsl(var(--text-ghost)/0.2)]" },
  "in-progress": {
    bg: "bg-amber-400",
    glow: "shadow-[0_0_6px_1px_rgba(251,191,36,0.4)]",
  },
  complete: {
    bg: "bg-emerald-400",
    glow: "shadow-[0_0_6px_1px_rgba(52,211,153,0.3)]",
  },
};

export const StageProgressBar: React.FC<StageProgressBarProps> = ({
  stageStatus,
  compact = false,
  fullWidth = false,
  onStageStatusChange,
}) => {
  const cycleMap: Record<StageStatus, StageStatus> = {
    "not-started": "in-progress",
    "in-progress": "complete",
    complete: "not-started",
  };

  const getStatus = (stageId: string): StageStatus => {
    const stageEntry = stageStatus?.[stageId as StageId];
    const status = stageEntry?.status;
    if (status === "complete" || status === "in-progress" || status === "not-started") {
      return status;
    }
    return "not-started";
  };

  return (
    <div className={cn("flex items-center gap-0.5", fullWidth && "w-full")}>
      {STAGES.map((stage, index) => {
        const status = getStatus(stage.id);
        const colors = statusColors[status];
        const isLast = index === STAGES.length - 1;

        const isInteractive = !!onStageStatusChange;
        const handleClick = (event: MouseEvent) => {
          if (!isInteractive) return;
          event.stopPropagation();
          onStageStatusChange(stage.id, cycleMap[status]);
        };

        return (
          <div
            key={stage.id}
            className={cn("group relative flex items-center", fullWidth && "flex-1")}
          >
            {/* Stage segment */}
            {isInteractive ? (
              <button
                type="button"
                onClick={handleClick}
                className={cn(
                  "transition-all duration-300",
                  "cursor-pointer",
                  "border-0 p-0",
                  fullWidth ? "h-2.5 w-full" : compact ? "h-1.5 w-6" : "h-2 w-8",
                  index === 0 && "rounded-l-full",
                  isLast && "rounded-r-full",
                  colors.bg,
                  colors.glow
                )}
                title={`${stage.label}: ${status.replace("-", " ")}`}
                aria-label={`${stage.label}: ${status.replace("-", " ")}`}
              />
            ) : (
              <div
                className={cn(
                  "transition-all duration-300",
                  fullWidth ? "h-2.5 w-full" : compact ? "h-1.5 w-6" : "h-2 w-8",
                  index === 0 && "rounded-l-full",
                  isLast && "rounded-r-full",
                  colors.bg,
                  colors.glow
                )}
                title={`${stage.label}: ${status.replace("-", " ")}`}
              />
            )}

            {/* Tooltip on hover */}
            <div
              className={cn(
                "pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2",
                "rounded px-1.5 py-0.5 whitespace-nowrap",
                "bg-[hsl(var(--raised))] text-[10px] text-[hsl(var(--text-muted))]",
                "border border-[hsl(var(--glass-border))]",
                "opacity-0 transition-opacity group-hover:opacity-100",
                "z-10"
              )}
            >
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
