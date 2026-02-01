import React from "react";
import { cn } from "../../lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "cyan" | "magenta" | "gradient" | "success";
  animated?: boolean;
  glow?: boolean;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  className,
  showLabel = false,
  size = "md",
  variant = "cyan",
  animated = true,
  glow = false,
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const isComplete = clampedValue >= 100;

  const sizes = {
    sm: "h-1",
    md: "h-1.5",
    lg: "h-2.5",
  };

  const variants = {
    cyan: cn("bg-[hsl(var(--cyan))]"),
    magenta: cn("bg-[hsl(var(--magenta))]"),
    gradient: cn(
      "bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--violet))] to-[hsl(var(--magenta))]"
    ),
    success: cn("bg-[hsl(var(--success))]"),
  };

  const glowColors = {
    cyan: "shadow-[0_0_12px_hsl(var(--cyan)/0.5),0_0_24px_hsl(var(--cyan)/0.25)]",
    magenta: "shadow-[0_0_12px_hsl(var(--magenta)/0.5),0_0_24px_hsl(var(--magenta)/0.25)]",
    gradient: "shadow-[0_0_12px_hsl(var(--violet)/0.5),0_0_24px_hsl(var(--violet)/0.25)]",
    success: "shadow-[0_0_12px_hsl(var(--success)/0.5),0_0_24px_hsl(var(--success)/0.25)]",
  };

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-2 flex items-center justify-between">
          <span className="font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
            Progress
          </span>
          <span
            className={cn(
              "font-mono text-[12px] font-semibold tabular-nums",
              isComplete ? "text-[hsl(var(--success))]" : "text-[hsl(var(--text-muted))]"
            )}
          >
            {Math.round(clampedValue)}%
          </span>
        </div>
      )}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full",
          "bg-[hsl(var(--surface))]",
          "border border-[hsl(var(--glass-border))]",
          sizes[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            variants[variant],
            glow && glowColors[variant],
            animated && !isComplete && "relative overflow-hidden"
          )}
          style={{ width: `${clampedValue}%` }}
        >
          {animated && !isComplete && clampedValue > 0 && (
            <div
              className="absolute inset-0 h-full w-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
                animation: "shimmer 1.8s infinite",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
  variant?: "cyan" | "magenta" | "gradient";
  glow?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 48,
  strokeWidth = 3,
  className,
  showLabel = true,
  variant = "cyan",
  glow = false,
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clampedValue / 100) * circumference;

  const gradientIds = {
    cyan: "progress-gradient-cyan",
    magenta: "progress-gradient-magenta",
    gradient: "progress-gradient-multi",
  };

  const glowFilters = {
    cyan: "drop-shadow(0 0 6px hsl(var(--cyan) / 0.6))",
    magenta: "drop-shadow(0 0 6px hsl(var(--magenta) / 0.6))",
    gradient: "drop-shadow(0 0 6px hsl(var(--violet) / 0.6))",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ filter: glow ? glowFilters[variant] : undefined }}
      >
        <defs>
          <linearGradient id="progress-gradient-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(185 100% 45%)" />
            <stop offset="100%" stopColor="hsl(185 100% 60%)" />
          </linearGradient>
          <linearGradient id="progress-gradient-magenta" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(325 90% 50%)" />
            <stop offset="100%" stopColor="hsl(325 100% 65%)" />
          </linearGradient>
          <linearGradient id="progress-gradient-multi" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(185 100% 50%)" />
            <stop offset="50%" stopColor="hsl(270 80% 60%)" />
            <stop offset="100%" stopColor="hsl(325 100% 58%)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--surface))"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientIds[variant]})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {showLabel && (
        <span className="absolute font-mono text-[11px] font-semibold text-[hsl(var(--text-muted))] tabular-nums">
          {Math.round(clampedValue)}%
        </span>
      )}
    </div>
  );
};

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "cyan" | "magenta" | "white";
}

export const Spinner: React.FC<SpinnerProps> = ({ size = "md", className, variant = "cyan" }) => {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-7 h-7",
  };

  const colors = {
    cyan: {
      track: "hsl(185 30% 20%)",
      spinner: "hsl(185 100% 50%)",
    },
    magenta: {
      track: "hsl(325 30% 20%)",
      spinner: "hsl(325 100% 58%)",
    },
    white: {
      track: "hsl(0 0% 30%)",
      spinner: "hsl(0 0% 90%)",
    },
  };

  return (
    <svg
      className={cn("animate-spin", sizes[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke={colors[variant].track} strokeWidth="2.5" />
      <path
        fill={colors[variant].spinner}
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

interface LoadingDotsProps {
  className?: string;
  variant?: "cyan" | "magenta" | "white";
}

export const LoadingDots: React.FC<LoadingDotsProps> = ({ className, variant = "cyan" }) => {
  const colors = {
    cyan: "bg-[hsl(var(--cyan))]",
    magenta: "bg-[hsl(var(--magenta))]",
    white: "bg-[hsl(0_0%_90%)]",
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", colors[variant], "animate-bounce")}
          style={{
            animationDelay: `${i * 0.15}s`,
            animationDuration: "0.6s",
          }}
        />
      ))}
    </div>
  );
};
