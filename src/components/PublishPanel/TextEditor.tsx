import React, { useState, useRef, useCallback, useEffect } from "react";
import type { TextSnippet } from "../../lib/types";
import { SnippetPicker } from "./SnippetPicker";
import { cn } from "../../lib/utils";

interface TextEditorProps {
  text: string;
  onTextChange: (text: string, fromSnippetId?: string) => void;
  snippets: TextSnippet[];
  maxLength: number | null;
  placeholder?: string;
  disabled?: boolean;
  showSnippetPicker?: boolean;
  sourceSnippetId?: string | null;
  label?: string;
  rows?: number;
}

export const TextEditor: React.FC<TextEditorProps> = ({
  text,
  onTextChange,
  snippets,
  maxLength,
  placeholder = "Enter text content...",
  disabled = false,
  showSnippetPicker = true,
  sourceSnippetId,
  label = "Caption / Text",
  rows = 3,
}) => {
  // Local state for responsive typing
  const [localText, setLocalText] = useState(text);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextRef = useRef<string | null>(null);

  // Sync local text with prop changes (e.g., when snippet is selected)
  useEffect(() => {
    setLocalText(text);
  }, [text]);

  // Get snippet content by ID for comparison
  const getSnippetContent = useCallback(
    (snippetId: string) => {
      return snippets.find((s) => s.id === snippetId)?.content ?? "";
    },
    [snippets]
  );

  // Commit text to store
  const commitTextToStore = useCallback(
    (newText: string) => {
      // If text was from a snippet and user edited it, clear the attribution
      const snippetId =
        sourceSnippetId && newText !== getSnippetContent(sourceSnippetId)
          ? undefined
          : (sourceSnippetId ?? undefined);
      onTextChange(newText, snippetId);
    },
    [onTextChange, sourceSnippetId, getSnippetContent]
  );

  // Flush any pending saves
  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingTextRef.current !== null) {
      commitTextToStore(pendingTextRef.current);
      pendingTextRef.current = null;
    }
  }, [commitTextToStore]);

  // Handle text input changes with debounce
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;

      // Immediate local update for responsive UI
      setLocalText(newText);
      pendingTextRef.current = newText;

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounced save (500ms)
      saveTimeoutRef.current = setTimeout(() => {
        commitTextToStore(newText);
        pendingTextRef.current = null;
      }, 500);
    },
    [commitTextToStore]
  );

  // Flush on blur
  const handleBlur = () => {
    flushPendingSave();
  };

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  // Handle snippet selection
  const handleSelectSnippet = (snippet: TextSnippet) => {
    setLocalText(snippet.content);
    pendingTextRef.current = null;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    onTextChange(snippet.content, snippet.id);
  };

  const currentLength = localText.length;
  const isOverLimit = maxLength !== null && currentLength > maxLength;
  const isNearLimit = maxLength !== null && currentLength > maxLength * 0.9;

  // Find current snippet for attribution display
  const currentSnippet = sourceSnippetId ? snippets.find((s) => s.id === sourceSnippetId) : null;

  return (
    <div className="flex flex-col gap-1">
      {/* Header with snippet picker */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[hsl(var(--text-muted))]">{label}</label>
          {currentSnippet && (
            <span className="text-xs text-[hsl(var(--cyan))]">
              from Snippet {currentSnippet.index}
            </span>
          )}
        </div>
        {showSnippetPicker && snippets.length > 0 && (
          <SnippetPicker
            snippets={snippets}
            onSelect={handleSelectSnippet}
            disabled={disabled}
            currentSnippetId={sourceSnippetId}
          />
        )}
      </div>

      {/* Text area */}
      <textarea
        value={localText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full resize-none rounded-lg border px-3 py-2 text-sm transition-colors",
          "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
          "placeholder:text-[hsl(var(--text-muted))]",
          isOverLimit
            ? "border-[hsl(var(--error))] bg-[hsl(var(--error)/0.05)]"
            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
          disabled && "cursor-not-allowed opacity-50"
        )}
      />

      {/* Character count */}
      {maxLength !== null && (
        <div className="flex justify-end">
          <span
            className={cn(
              "text-xs",
              isOverLimit
                ? "text-[hsl(var(--error))]"
                : isNearLimit
                  ? "text-[hsl(var(--warning))]"
                  : "text-[hsl(var(--text-muted))]"
            )}
          >
            {currentLength}/{maxLength}
          </span>
        </div>
      )}
    </div>
  );
};
