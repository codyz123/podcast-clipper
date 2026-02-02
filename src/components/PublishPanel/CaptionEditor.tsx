import React, { useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";

interface CaptionEditorProps {
  caption: string;
  hashtags: string[];
  onCaptionChange: (caption: string) => void;
  onHashtagsChange: (hashtags: string[]) => void;
  maxLength?: number;
  disabled?: boolean;
  compact?: boolean;
}

export const CaptionEditor: React.FC<CaptionEditorProps> = ({
  caption,
  hashtags,
  onCaptionChange,
  onHashtagsChange,
  maxLength,
  disabled,
  compact = false,
}) => {
  const [hashtagInput, setHashtagInput] = useState("");

  const handleAddHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, "");
    if (tag && !hashtags.includes(tag)) {
      onHashtagsChange([...hashtags, tag]);
    }
    setHashtagInput("");
  };

  const handleRemoveHashtag = (tag: string) => {
    onHashtagsChange(hashtags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddHashtag();
    }
  };

  // Calculate character count including hashtags
  const hashtagsText = hashtags.length > 0 ? `\n\n${hashtags.map((t) => `#${t}`).join(" ")}` : "";
  const charCount = caption.length + hashtagsText.length;

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-[hsl(var(--text-muted))]">Caption</label>
          {maxLength && (
            <span
              className={cn(
                "text-[10px]",
                charCount > maxLength
                  ? "text-[hsl(var(--error))]"
                  : charCount > maxLength * 0.9
                    ? "text-[hsl(var(--warning))]"
                    : "text-[hsl(var(--text-ghost))]"
              )}
            >
              {charCount}/{maxLength}
            </span>
          )}
        </div>
        <textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          disabled={disabled}
          placeholder="Write a caption for this clip..."
          className={cn(
            "w-full resize-none rounded-md border px-3 py-2 text-sm",
            "border-[hsl(var(--glass-border))] bg-[hsl(var(--bg-base))]",
            "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
            "focus:border-[hsl(var(--cyan))] focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            compact ? "h-16" : "h-20"
          )}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-muted))]">
          Hashtags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                "bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))]"
              )}
            >
              #{tag}
              <button
                onClick={() => handleRemoveHashtag(tag)}
                disabled={disabled}
                className="transition-colors hover:text-[hsl(var(--error))] disabled:cursor-not-allowed"
              >
                <Cross2Icon className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleAddHashtag}
            disabled={disabled}
            placeholder="Add..."
            className={cn(
              "w-20 rounded-full border border-dashed px-2 py-0.5 text-xs",
              "border-[hsl(var(--glass-border))] bg-transparent",
              "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
              "focus:border-[hsl(var(--cyan))] focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
        </div>
      </div>
    </div>
  );
};
