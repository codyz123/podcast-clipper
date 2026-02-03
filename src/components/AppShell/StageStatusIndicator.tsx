import { cn } from "../../lib/utils";
import { StatusDot } from "../ui/StatusDot";
import { STATUS_CONFIG, type StageStatus } from "../../lib/statusConfig";

interface StageStatusIndicatorProps {
  status: StageStatus;
  stageName: string;
  displayName?: string; // Optional custom display name (e.g., "Guest" instead of "Planning")
  onClick: () => void;
  disabled?: boolean;
}

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
  displayName,
  onClick,
  disabled,
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["not-started"];
  const name = displayName || formatStageName(stageName);

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
      <StatusDot status={status} size="sm" animated={status === "in-progress"} />
      <span className="text-[hsl(var(--text-muted))]">
        <span className="font-medium text-[hsl(var(--text))]">{name}</span> {config.label}
      </span>
    </button>
  );
};
