import React from "react";
import { cn } from "../../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  variant?: "default" | "ghost" | "filled";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon, variant = "default", ...props }, ref) => {
    const variants = {
      default: cn(
        // Glass surface
        "bg-[hsl(var(--surface)/0.5)]",
        "backdrop-blur-sm",
        // Border
        "border border-[hsl(var(--glass-border))]",
        // Focus
        "focus:bg-[hsl(var(--surface)/0.7)]",
        "focus:border-[hsl(185_100%_50%/0.5)]",
        "focus:ring-2 focus:ring-[hsl(185_100%_50%/0.15)]",
        "focus:shadow-[0_0_20px_-5px_hsl(185_100%_50%/0.3)]"
      ),
      ghost: cn(
        "bg-transparent",
        "border border-transparent",
        "focus:bg-[hsl(var(--surface)/0.3)]",
        "focus:border-[hsl(var(--glass-border))]"
      ),
      filled: cn(
        "bg-[hsl(var(--raised))]",
        "border border-[hsl(0_0%_100%/0.08)]",
        "focus:border-[hsl(185_100%_50%/0.5)]",
        "focus:ring-2 focus:ring-[hsl(185_100%_50%/0.15)]"
      ),
    };

    return (
      <div className="w-full">
        {label && (
          <label
            className={cn(
              "mb-2 block text-[13px] font-medium",
              "text-[hsl(var(--text))]",
              "font-[family-name:var(--font-display)]"
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute top-1/2 left-3 -translate-y-1/2 text-[hsl(var(--text-subtle))]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              // Base
              "h-10 w-full px-3.5 text-sm",
              "rounded-xl",
              // Typography
              "text-[hsl(var(--text))]",
              "placeholder:text-[hsl(var(--text-ghost))]",
              // Focus
              "focus:outline-none",
              // Transitions
              "transition-all duration-200 ease-out",
              // Disabled
              "disabled:cursor-not-allowed disabled:opacity-40",
              // Error
              error &&
                cn(
                  "border-[hsl(var(--error)/0.6)]",
                  "focus:border-[hsl(var(--error))]",
                  "focus:ring-[hsl(var(--error)/0.15)]",
                  "focus:shadow-[0_0_20px_-5px_hsl(var(--error)/0.3)]"
                ),
              // Variant
              variants[variant],
              // Icon padding
              icon && "pl-10",
              className
            )}
            {...props}
          />
        </div>
        {(error || hint) && (
          <p
            className={cn(
              "mt-2 text-[12px] font-medium",
              error ? "text-[hsl(var(--error))]" : "text-[hsl(var(--text-subtle))]"
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  variant?: "default" | "ghost" | "filled";
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, variant = "default", ...props }, ref) => {
    const variants = {
      default: cn(
        "bg-[hsl(var(--surface)/0.5)]",
        "backdrop-blur-sm",
        "border border-[hsl(var(--glass-border))]",
        "focus:bg-[hsl(var(--surface)/0.7)]",
        "focus:border-[hsl(185_100%_50%/0.5)]",
        "focus:ring-2 focus:ring-[hsl(185_100%_50%/0.15)]",
        "focus:shadow-[0_0_20px_-5px_hsl(185_100%_50%/0.3)]"
      ),
      ghost: cn(
        "bg-transparent",
        "border border-transparent",
        "focus:bg-[hsl(var(--surface)/0.3)]",
        "focus:border-[hsl(var(--glass-border))]"
      ),
      filled: cn(
        "bg-[hsl(var(--raised))]",
        "border border-[hsl(0_0%_100%/0.08)]",
        "focus:border-[hsl(185_100%_50%/0.5)]",
        "focus:ring-2 focus:ring-[hsl(185_100%_50%/0.15)]"
      ),
    };

    return (
      <div className="w-full">
        {label && (
          <label
            className={cn(
              "mb-2 block text-[13px] font-medium",
              "text-[hsl(var(--text))]",
              "font-[family-name:var(--font-display)]"
            )}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            // Base
            "w-full px-3.5 py-3 text-sm",
            "rounded-xl",
            // Typography
            "text-[hsl(var(--text))]",
            "placeholder:text-[hsl(var(--text-ghost))]",
            // Focus
            "focus:outline-none",
            // Transitions
            "transition-all duration-200 ease-out",
            // Disabled
            "disabled:cursor-not-allowed disabled:opacity-40",
            // Resize
            "min-h-[120px] resize-none",
            // Error
            error &&
              cn(
                "border-[hsl(var(--error)/0.6)]",
                "focus:border-[hsl(var(--error))]",
                "focus:ring-[hsl(var(--error)/0.15)]"
              ),
            // Variant
            variants[variant],
            className
          )}
          {...props}
        />
        {(error || hint) && (
          <p
            className={cn(
              "mt-2 text-[12px] font-medium",
              error ? "text-[hsl(var(--error))]" : "text-[hsl(var(--text-subtle))]"
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

type SearchInputProps = Omit<InputProps, "icon" | "variant">;

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        className={cn("pl-11", className)}
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        }
        {...props}
      />
    );
  }
);

SearchInput.displayName = "SearchInput";
