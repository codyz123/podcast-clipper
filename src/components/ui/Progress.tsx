import React from "react";
import { cn } from "../../lib/utils";

interface ProgressProps {
  value: number; // 0-100
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  className,
  showLabel = false,
  size = "md",
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  const sizes = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "w-full bg-[hsl(var(--secondary))] rounded-full overflow-hidden",
          sizes[size]
        )}
      >
        <div
          className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 text-right">
          {Math.round(clampedValue)}%
        </p>
      )}
    </div>
  );
};
