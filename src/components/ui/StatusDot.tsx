import { cn } from "../../lib/utils";
import { STATUS_CONFIG, type StageStatus } from "../../lib/statusConfig";

interface StatusDotProps {
  status: StageStatus;
  size?: "xs" | "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: "h-1.5 w-1.5",
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

/**
 * Reusable status indicator dot with glow effect.
 * Used throughout the app for consistent status visualization.
 */
export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = "md",
  animated = false,
  className,
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["not-started"];

  return (
    <div
      className={cn(
        "rounded-full transition-all duration-300",
        sizeClasses[size],
        config.color,
        config.glow,
        animated && status === "in-progress" && "animate-pulse",
        className
      )}
      aria-hidden="true"
    />
  );
};

export default StatusDot;
