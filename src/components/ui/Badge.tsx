import React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps {
  /** Visual variant determining color scheme */
  variant?: "default" | "success" | "warning" | "error" | "info";
  /** Size of the badge */
  size?: "sm" | "md";
  /** Badge content */
  children: React.ReactNode;
  /** Optional icon to display before children */
  icon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Badge component for status indicators and labels.
 * Uses existing CSS variables for consistent theming.
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  size = "md",
  children,
  icon,
  className,
}) => {
  const variants = {
    default: cn(
      "bg-[hsl(var(--surface-hover))]",
      "text-[hsl(var(--text-muted))]",
      "border-[hsl(var(--glass-border))]"
    ),
    success: cn(
      "bg-[hsl(var(--success)/0.15)]",
      "text-[hsl(var(--success))]",
      "border-[hsl(var(--success)/0.3)]"
    ),
    warning: cn(
      "bg-[hsl(var(--warning)/0.15)]",
      "text-[hsl(var(--warning))]",
      "border-[hsl(var(--warning)/0.3)]"
    ),
    error: cn(
      "bg-[hsl(var(--error)/0.15)]",
      "text-[hsl(var(--error))]",
      "border-[hsl(var(--error)/0.3)]"
    ),
    info: cn(
      "bg-[hsl(var(--cyan)/0.15)]",
      "text-[hsl(var(--cyan))]",
      "border-[hsl(var(--cyan)/0.3)]"
    ),
  };

  const sizes = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
  };

  return (
    <span
      className={cn(
        // Base styles
        "inline-flex items-center gap-1 rounded-full border font-medium",
        // Size
        sizes[size],
        // Variant
        variants[variant],
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};

Badge.displayName = "Badge";
