import React from "react";
import { ChevronDownIcon, FileTextIcon } from "@radix-ui/react-icons";
import type { TextSnippet } from "../../lib/types";
import { useDropdown } from "../../hooks/useDropdown";
import { cn } from "../../lib/utils";

interface SnippetPickerProps {
  snippets: TextSnippet[];
  onSelect: (snippet: TextSnippet) => void;
  disabled?: boolean;
  currentSnippetId?: string | null;
}

export const SnippetPicker: React.FC<SnippetPickerProps> = ({
  snippets,
  onSelect,
  disabled = false,
  currentSnippetId,
}) => {
  const { isOpen, close, containerRef, triggerProps, menuProps, getItemProps } = useDropdown();

  const handleSelect = (snippet: TextSnippet) => {
    onSelect(snippet);
    close();
  };

  const currentSnippet = snippets.find((s) => s.id === currentSnippetId);

  return (
    <div className="relative" ref={containerRef as React.RefObject<HTMLDivElement>}>
      <button
        type="button"
        disabled={disabled || snippets.length === 0}
        {...triggerProps}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
          "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
          "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
          disabled || snippets.length === 0
            ? "cursor-not-allowed opacity-50"
            : "hover:border-[hsl(var(--glass-border-hover))]"
        )}
        title={snippets.length === 0 ? "No snippets available" : "Load from snippet"}
      >
        <FileTextIcon className="h-3 w-3" />
        <span>{currentSnippet ? `Snippet ${currentSnippet.index}` : "Snippets"}</span>
        <ChevronDownIcon className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && snippets.length > 0 && (
        <div
          {...menuProps}
          className={cn(
            "absolute top-full right-0 z-50 mt-1 max-w-[300px] min-w-[200px] rounded-lg border shadow-lg",
            "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
            "max-h-60 overflow-y-auto"
          )}
        >
          {snippets.map((snippet, index) => {
            const isSelected = snippet.id === currentSnippetId;
            const preview =
              snippet.content.length > 60
                ? snippet.content.substring(0, 60) + "..."
                : snippet.content;

            return (
              <button
                key={snippet.id}
                type="button"
                onClick={() => handleSelect(snippet)}
                {...getItemProps(index)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
                  "hover:bg-[hsl(var(--surface-hover))]",
                  isSelected && "bg-[hsl(var(--cyan)/0.1)]"
                )}
              >
                <span className="text-xs font-medium">
                  Snippet {snippet.index}
                  {snippet.name && (
                    <span className="ml-1 font-normal text-[hsl(var(--text-muted))]">
                      - {snippet.name}
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-xs text-[hsl(var(--text-muted))]">
                  {preview}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
