import React from "react";
import { cn } from "../../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "glass" | "elevated" | "interactive" | "glow" | "ghost";
  padding?: "none" | "sm" | "md" | "lg";
  glow?: "cyan" | "magenta" | "none";
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = "default",
  padding = "md",
  glow = "none",
  ...props
}) => {
  const variants = {
    default: cn(
      "bg-[hsl(var(--surface)/0.7)]",
      "backdrop-blur-lg",
      "border border-[hsl(var(--glass-border))]",
      "shadow-lg shadow-black/20"
    ),
    glass: cn(
      "bg-[hsl(var(--glass))]",
      "backdrop-blur-xl",
      "border border-[hsl(var(--glass-border))]",
      "shadow-xl shadow-black/25"
    ),
    elevated: cn(
      "bg-[hsl(var(--raised))]",
      "border border-[hsl(0_0%_100%/0.08)]",
      "shadow-xl shadow-black/30"
    ),
    interactive: cn(
      "bg-[hsl(var(--surface)/0.6)]",
      "backdrop-blur-lg",
      "border border-[hsl(var(--glass-border))]",
      "shadow-lg shadow-black/20",
      "transition-all duration-150 ease-out",
      "cursor-pointer",
      "hover:bg-[hsl(var(--raised)/0.9)]",
      "hover:border-[hsl(0_0%_100%/0.1)]",
      "hover:shadow-xl hover:shadow-black/25",
      "hover:-translate-y-0.5",
      "active:translate-y-0"
    ),
    glow: cn(
      "bg-[hsl(var(--surface)/0.7)]",
      "backdrop-blur-lg",
      "border border-[hsl(185_100%_50%/0.2)]",
      "shadow-lg shadow-black/20"
    ),
    ghost: cn("bg-transparent", "border border-[hsl(var(--glass-border))]"),
  };

  const paddings = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const glowStyles = {
    none: "",
    cyan: "ring-1 ring-[hsl(185_100%_50%/0.15)]",
    magenta: "ring-1 ring-[hsl(325_100%_58%/0.15)]",
  };

  return (
    <div
      className={cn(
        "rounded-xl",
        variants[variant],
        paddings[padding],
        glow !== "none" && glowStyles[glow],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardSubComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardHeader: React.FC<CardSubComponentProps> = ({ children, className, ...props }) => {
  return (
    <div className={cn("mb-4", className)} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<CardSubComponentProps> = ({ children, className, ...props }) => {
  return (
    <h3
      className={cn(
        "text-base font-semibold tracking-tight",
        "font-[family-name:var(--font-display)]",
        "text-[hsl(var(--text))]",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<CardSubComponentProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <p
      className={cn("mt-1 text-sm leading-relaxed", "text-[hsl(var(--text-muted))]", className)}
      {...props}
    >
      {children}
    </p>
  );
};

export const CardContent: React.FC<CardSubComponentProps> = ({ children, className, ...props }) => {
  return (
    <div className={cn("", className)} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<CardSubComponentProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        "mt-5 flex items-center gap-3 pt-4",
        "border-t border-[hsl(var(--glass-border))]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
