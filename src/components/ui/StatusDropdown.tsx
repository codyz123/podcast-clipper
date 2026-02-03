import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { cycleStatus, type StageStatus } from "../../lib/statusConfig";
import { StatusDot } from "./StatusDot";

interface StatusItem {
  id: string;
  label: string;
  status: StageStatus;
}

interface StatusDropdownProps {
  label: string;
  items: StatusItem[];
  onStatusChange: (id: string, status: StageStatus) => void;
  className?: string;
}

/**
 * Dropdown menu showing a list of items with cycleable status dots.
 * Used for marketing sub-steps on the Publish page.
 */
export const StatusDropdown: React.FC<StatusDropdownProps> = ({
  label,
  items,
  onStatusChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleItemClick = (item: StatusItem) => {
    onStatusChange(item.id, cycleStatus(item.status));
  };

  // Calculate summary status (show most "progressed" status)
  const getSummaryStatus = (): StageStatus => {
    const hasComplete = items.some((i) => i.status === "complete");
    const hasInProgress = items.some((i) => i.status === "in-progress");
    if (hasComplete) return "complete";
    if (hasInProgress) return "in-progress";
    return "not-started";
  };

  const completedCount = items.filter((i) => i.status === "complete").length;

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5",
          "text-sm",
          "hover:bg-[hsl(var(--surface))]",
          "transition-all duration-200",
          "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none"
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <StatusDot status={getSummaryStatus()} />
        <span className="font-medium text-[hsl(var(--text))]">{label}</span>
        <span className="text-xs text-[hsl(var(--text-ghost))]">
          {completedCount}/{items.length}
        </span>
        <ChevronDownIcon
          className={cn(
            "h-3.5 w-3.5 text-[hsl(var(--text-ghost))] transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute top-full right-0 z-50 mt-1",
            "min-w-[180px] rounded-lg",
            "bg-[hsl(var(--surface))]",
            "border border-[hsl(var(--border-subtle))]",
            "shadow-lg shadow-black/20",
            "py-1"
          )}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2",
                "text-sm text-[hsl(var(--text-muted))]",
                "hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]",
                "transition-colors"
              )}
              role="menuitem"
            >
              <span>{item.label}</span>
              <StatusDot status={item.status} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StatusDropdown;
