import { cn } from "../../lib/utils";
import type { StageStatus } from "../EpisodePipeline/EpisodePipeline";

interface StageStatusIndicatorProps {
  status: StageStatus;
  stageName: string;
  onClick: () => void;
  disabled?: boolean;
}

const statusConfig: Record<StageStatus, { color: string; glow: string; label: string }> = {
  "not-started": {
    color: "bg-[hsl(var(--text-ghost)/0.4)]",
    glow: "",
    label: "Not Started",
  },
  "in-progress": {
    color: "bg-amber-400",
    glow: "shadow-[0_0_8px_2px_rgba(251,191,36,0.6)]",
    label: "In Progress",
  },
  complete: {
    color: "bg-emerald-400",
    glow: "shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]",
    label: "Complete",
  },
};

// Capitalize stage name for display
function formatStageName(stage: string): string {
  return stage
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const StageStatusIndicator: React.FC<StageStatusIndicatorProps> = ({
  status,
  stageName,
  onClick,
  disabled,
}) => {
  const config = statusConfig[status] || statusConfig["not-started"];
  const displayStageName = formatStageName(stageName);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5",
        "text-xs",
        "hover:bg-[hsl(var(--surface))]",
        "transition-all duration-200",
        disabled && "cursor-not-allowed opacity-50"
      )}
      title="Click to cycle status"
    >
      <div
        className={cn(
          "h-2.5 w-2.5 rounded-full transition-all duration-300",
          config.color,
          config.glow
        )}
      />
      <span className="text-[hsl(var(--text-muted))]">
        <span className="font-medium text-[hsl(var(--text))]">{displayStageName}</span>{" "}
        {config.label}
      </span>
    </button>
  );
};
