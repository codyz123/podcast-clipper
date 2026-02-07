import { useId } from "react";
import { cn } from "../../lib/utils";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  /** Current selected value */
  value: T;
  /** Callback when value changes */
  onChange: (value: T) => void;
  /** Available options */
  options: SelectOption<T>[];
  /** Label text above the select */
  label?: string;
  /** Placeholder text when no value is selected */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Error message to display */
  error?: string;
  /** Hint text to display below */
  hint?: string;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS classes for the select element */
  className?: string;
}

/**
 * Styled native select component matching Input styling.
 * Uses native <select> for accessibility and keyboard support.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  label,
  placeholder,
  disabled = false,
  error,
  hint,
  size = "md",
  className,
}: SelectProps<T>) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-10 px-3.5 text-sm",
  };

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className={cn(
            "mb-2 block text-[13px] font-medium",
            "text-[hsl(var(--text))]",
            "font-[family-name:var(--font-display)]"
          )}
        >
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={cn(
          // Base
          "w-full appearance-none rounded-xl",
          sizes[size],
          // Background image for custom arrow
          "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-10",
          // Glass surface
          "bg-[hsl(var(--surface)/0.5)]",
          "backdrop-blur-sm",
          // Border
          "border border-[hsl(var(--glass-border))]",
          // Typography
          "text-[hsl(var(--text))]",
          // Focus
          "focus:bg-[hsl(var(--surface)/0.7)]",
          "focus:border-[hsl(var(--cyan)/0.5)]",
          "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.15)]",
          "focus:shadow-[0_0_20px_-5px_hsl(var(--cyan)/0.3)]",
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
          // Cursor
          "cursor-pointer",
          className
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {(error || hint) && (
        <p
          id={error ? errorId : hintId}
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

Select.displayName = "Select";
