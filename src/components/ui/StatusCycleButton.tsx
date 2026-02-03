import { cn } from "../../lib/utils";
import { STATUS_CONFIG, cycleStatus, type StageStatus } from "../../lib/statusConfig";
import { StatusDot } from "./StatusDot";

interface StatusCycleButtonProps {
  status: StageStatus;
  label: string;
  onCycle: (newStatus: StageStatus) => void;
  showLabel?: boolean;
  showStatusText?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

/**
 * Clickable button that cycles through status values.
 * Shows a status dot and optional label/status text.
 */
export const StatusCycleButton: React.FC<StatusCycleButtonProps> = ({
  status,
  label,
  onCycle,
  showLabel = true,
  showStatusText = false,
  size = "md",
  disabled = false,
  className,
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["not-started"];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onCycle(cycleStatus(status));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && !disabled) {
      e.preventDefault();
      e.stopPropagation();
      onCycle(cycleStatus(status));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 rounded-md transition-all duration-200",
        size === "sm" ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm",
        "hover:bg-[hsl(var(--surface-hover))]",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--cyan)/0.3)]",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      title={`${label}: ${config.label}. Click to cycle status.`}
      aria-label={`${label}: ${config.label}. Click to change status.`}
    >
      <StatusDot status={status} size={size === "sm" ? "sm" : "md"} />
      {showLabel && (
        <span className="text-[hsl(var(--text-muted))]">
          <span className="font-medium text-[hsl(var(--text))]">{label}</span>
          {showStatusText && (
            <span className="ml-1 text-[hsl(var(--text-ghost))]">{config.label}</span>
          )}
        </span>
      )}
    </button>
  );
};

export default StatusCycleButton;
