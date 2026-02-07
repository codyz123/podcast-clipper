import React from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  type PublishDestinationType,
  PLATFORM_CONFIGS,
  DEFAULT_DESTINATIONS,
} from "../../lib/publish";
import { usePublishStore } from "../../stores/publishStore";
import { useDropdown } from "../../hooks/useDropdown";
import { PlatformIcon } from "./PlatformIcon";
import { cn } from "../../lib/utils";

interface AddPostButtonProps {
  disabled?: boolean;
}

export const AddPostButton: React.FC<AddPostButtonProps> = ({ disabled = false }) => {
  const { isOpen, close, containerRef, triggerProps, menuProps, getItemProps } = useDropdown();
  const createPost = usePublishStore((s) => s.createPost);

  const handleSelect = (destination: PublishDestinationType) => {
    createPost(destination);
    close();
  };

  // All available destinations including local export
  const allDestinations: PublishDestinationType[] = [...DEFAULT_DESTINATIONS, "local"];

  return (
    <div className="relative" ref={containerRef as React.RefObject<HTMLDivElement>}>
      <button
        type="button"
        disabled={disabled}
        {...triggerProps}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
          "border-[hsl(var(--cyan)/0.5)] text-[hsl(var(--cyan))]",
          "hover:border-[hsl(var(--cyan))] hover:bg-[hsl(var(--cyan)/0.1)]",
          "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <PlusIcon className="h-4 w-4" />
        <span>Add Post</span>
      </button>

      {isOpen && (
        <div
          {...menuProps}
          className={cn(
            "absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border shadow-lg",
            "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
            "overflow-hidden"
          )}
        >
          <div className="p-1">
            {allDestinations.map((destination, index) => {
              const config = PLATFORM_CONFIGS[destination];

              return (
                <button
                  key={destination}
                  type="button"
                  onClick={() => handleSelect(destination)}
                  {...getItemProps(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-[hsl(var(--surface-hover))]"
                  )}
                >
                  <PlatformIcon
                    platform={destination}
                    className="h-5 w-5"
                    style={{ color: config.brandColor }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{config.name}</div>
                    <div className="text-xs text-[hsl(var(--text-muted))]">
                      {config.requiresAuth ? "Requires connection" : "No account needed"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
