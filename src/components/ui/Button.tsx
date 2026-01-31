import React from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  glow?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = "primary",
  size = "md",
  isLoading = false,
  glow = false,
  disabled,
  ...props
}) => {
  const baseStyles = cn(
    // Layout
    "relative inline-flex items-center justify-center gap-2",
    // Typography
    "font-semibold tracking-tight",
    "font-[family-name:var(--font-display)]",
    // Shape
    "rounded-lg",
    // Transitions
    "transition-all duration-150 ease-out",
    // Focus
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "focus-visible:ring-offset-[hsl(var(--void))]",
    // Disabled
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
    // Active press effect
    "active:scale-[0.97]"
  );

  const variants = {
    primary: cn(
      // Clean cyan gradient
      "bg-gradient-to-b from-[hsl(185_100%_50%)] to-[hsl(185_90%_42%)]",
      "text-[hsl(260_30%_4%)]",
      "border border-[hsl(185_100%_60%/0.2)]",
      "shadow-sm",
      "hover:from-[hsl(185_100%_55%)] hover:to-[hsl(185_90%_47%)]",
      "hover:shadow-md",
      "focus-visible:ring-[hsl(var(--cyan))]"
    ),
    secondary: cn(
      // Clean magenta gradient
      "bg-gradient-to-b from-[hsl(325_80%_50%)] to-[hsl(325_80%_42%)]",
      "text-white",
      "border border-[hsl(325_100%_60%/0.2)]",
      "shadow-sm",
      "hover:from-[hsl(325_80%_55%)] hover:to-[hsl(325_80%_47%)]",
      "hover:shadow-md",
      "focus-visible:ring-[hsl(var(--magenta))]"
    ),
    ghost: cn(
      "bg-transparent",
      "text-[hsl(var(--text-muted))]",
      "hover:bg-[hsl(var(--surface))]",
      "hover:text-[hsl(var(--text))]",
      "focus-visible:ring-[hsl(var(--text-subtle))]"
    ),
    outline: cn(
      "bg-[hsl(var(--surface)/0.6)]",
      "text-[hsl(var(--text))]",
      "border border-[hsl(var(--glass-border))]",
      "hover:bg-[hsl(var(--raised))]",
      "hover:border-[hsl(var(--border-default))]",
      "focus-visible:ring-[hsl(var(--cyan)/0.5)]"
    ),
    danger: cn(
      "bg-gradient-to-b from-[hsl(0_75%_50%)] to-[hsl(0_70%_42%)]",
      "text-white",
      "border border-[hsl(0_100%_60%/0.2)]",
      "shadow-sm",
      "hover:from-[hsl(0_75%_55%)] hover:to-[hsl(0_70%_47%)]",
      "hover:shadow-md",
      "focus-visible:ring-[hsl(var(--error))]"
    ),
  };

  const sizes = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-11 px-5 text-sm gap-2",
    icon: "h-10 w-10 p-0",
  };

  const glowStyles = glow
    ? cn("shadow-[0_0_20px_hsl(185_100%_50%/0.3)]", "hover:shadow-[0_0_25px_hsl(185_100%_50%/0.4)]")
    : "";

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], glowStyles, className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path
              className="opacity-80"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
