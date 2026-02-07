import React, { useRef, useMemo, useCallback } from "react";
import { Cross2Icon, DragHandleDots2Icon } from "@radix-ui/react-icons";
import type { Clip, TextSnippet, VideoFormat } from "../../lib/types";
import { VIDEO_FORMATS } from "../../lib/types";
import {
  type Post,
  type PostValidation,
  PLATFORM_CONFIGS,
  buildPostText,
  validatePost,
} from "../../lib/publish";
import { usePublishStore } from "../../stores/publishStore";
import { ClipSelector } from "./ClipSelector";
import { TextEditor } from "./TextEditor";
import { DestinationBadge } from "./DestinationBadge";
import { cn } from "../../lib/utils";

interface PostCardProps {
  post: Post;
  clips: Clip[];
  snippets: TextSnippet[];
  isConnected: boolean;
  onConnect?: () => void;
  isPublishing: boolean;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  clips,
  snippets,
  isConnected,
  onConnect,
  isPublishing,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const config = PLATFORM_CONFIGS[post.destination];

  // Get store actions
  const {
    removePost,
    togglePost,
    setPostClip,
    setPostText,
    setPostTitle,
    setPostDescription,
    setPostFormat,
    setPostRenderScale,
  } = usePublishStore();

  // Resolve clip for this post
  const clip = useMemo(
    () => (post.clipId ? clips.find((c) => c.id === post.clipId) : undefined),
    [clips, post.clipId]
  );

  // Memoized validation
  const validation: PostValidation = useMemo(
    () => validatePost(post, clip, config, isConnected),
    [post, clip, config, isConnected]
  );

  // Handlers
  const handleRemove = useCallback(() => {
    removePost(post.id);
  }, [removePost, post.id]);

  const handleToggle = useCallback(() => {
    togglePost(post.id);
  }, [togglePost, post.id]);

  const handleClipChange = useCallback(
    (clipId: string | undefined) => {
      setPostClip(post.id, clipId);
    },
    [setPostClip, post.id]
  );

  const handleTextChange = useCallback(
    (text: string, fromSnippetId?: string) => {
      setPostText(post.id, text, fromSnippetId);
    },
    [setPostText, post.id]
  );

  const handleTitleChange = useCallback(
    (text: string) => {
      setPostTitle(post.id, text);
    },
    [setPostTitle, post.id]
  );

  const handleDescriptionChange = useCallback(
    (text: string, fromSnippetId?: string) => {
      setPostDescription(post.id, text, fromSnippetId);
    },
    [setPostDescription, post.id]
  );

  const handleFormatChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPostFormat(post.id, e.target.value as VideoFormat);
    },
    [setPostFormat, post.id]
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPostRenderScale(post.id, parseFloat(e.target.value));
    },
    [setPostRenderScale, post.id]
  );

  // Keyboard handling with focus scoping
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const activeElement = document.activeElement;
    const isInsideInput =
      cardRef.current?.contains(activeElement) &&
      (activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.tagName === "SELECT");

    // Don't handle keyboard shortcuts when typing
    if (isInsideInput) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      handleRemove();
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleToggle();
    }
  };

  const isInProgress =
    post.statusData.status === "rendering" || post.statusData.status === "uploading";
  const isDisabled = !post.enabled || isPublishing;
  const isYouTube = post.destination === "youtube-shorts" || post.destination === "youtube-video";
  const format = post.format || config.defaultFormat;
  const formatConfig = VIDEO_FORMATS[format];
  const renderScale = post.renderScale ?? 1;
  const resolutionOptions = useMemo(
    () =>
      [1, 1.5, 2].map((scale) => {
        const width = Math.round(formatConfig.width * scale);
        const height = Math.round(formatConfig.height * scale);
        return {
          scale,
          label:
            scale === 1
              ? `Standard (${width}×${height})`
              : scale === 1.5
                ? `High (${width}×${height})`
                : `Ultra (${width}×${height})`,
        };
      }),
    [formatConfig.height, formatConfig.width]
  );
  const fullCaption = useMemo(() => {
    if (isYouTube) return (post.description || "").trim();
    return buildPostText(post, config).trim();
  }, [post, config, isYouTube]);
  const progressLabel = useMemo(() => {
    if (post.statusData.status === "rendering") {
      return post.statusData.stage === "processing" ? "Finalizing render" : "Rendering";
    }
    if (post.statusData.status === "uploading") {
      switch (post.statusData.stage) {
        case "processing":
          return "Processing";
        case "publishing":
          return "Publishing";
        case "posting":
          return "Posting";
        default:
          return "Uploading";
      }
    }
    return "";
  }, [post.statusData]);

  const handleOpenOutput = useCallback(() => {
    if (post.statusData.status !== "completed" || !post.statusData.outputPath) return;
    window.open(post.statusData.outputPath, "_blank");
  }, [post.statusData]);

  const handleOpenUpload = useCallback(() => {
    if (post.statusData.status !== "completed") return;
    const url = post.statusData.uploadedUrl || config.manualUploadUrl;
    if (!url) return;
    window.open(url, "_blank");
  }, [post.statusData, config.manualUploadUrl]);

  const handleCopyCaption = useCallback(async () => {
    if (!fullCaption) return;
    try {
      await navigator.clipboard.writeText(fullCaption);
    } catch (error) {
      console.error("Failed to copy caption:", error);
    }
  }, [fullCaption]);

  return (
    <div
      ref={cardRef}
      role="listitem"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Post to ${config.name}, ${post.enabled ? "enabled" : "disabled"}`}
      className={cn(
        "group relative rounded-xl border transition-all",
        "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
        post.enabled
          ? "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]"
          : "border-[hsl(var(--glass-border)/0.5)] bg-[hsl(var(--surface)/0.5)] opacity-60",
        !validation.valid && "border-[hsl(var(--error)/0.5)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[hsl(var(--glass-border)/0.5)] px-4 py-3">
        {/* Drag handle */}
        <DragHandleDots2Icon className="h-4 w-4 cursor-grab text-[hsl(var(--text-muted))]" />

        {/* Enable/disable checkbox */}
        <label className="flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={post.enabled}
            onChange={handleToggle}
            disabled={isInProgress}
            className="h-4 w-4 rounded border-[hsl(var(--glass-border))] bg-transparent accent-[hsl(var(--cyan))]"
          />
        </label>

        {/* Destination badge */}
        <DestinationBadge
          destination={post.destination}
          config={config}
          isConnected={isConnected}
          statusData={post.statusData}
          onConnect={onConnect}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Format selector (only when clip is present) */}
        {post.clipId && (
          <div className="flex items-center gap-2">
            <select
              value={format}
              onChange={handleFormatChange}
              disabled={isDisabled}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
                "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
                isDisabled && "cursor-not-allowed opacity-50"
              )}
            >
              {config.supportedFormats.map((formatOption) => (
                <option key={formatOption} value={formatOption}>
                  {formatOption}
                </option>
              ))}
            </select>
            <select
              value={renderScale}
              onChange={handleResolutionChange}
              disabled={isDisabled}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
                "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.5)] focus:outline-none",
                isDisabled && "cursor-not-allowed opacity-50"
              )}
            >
              {resolutionOptions.map((option) => (
                <option key={option.scale} value={option.scale}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Remove button */}
        <button
          onClick={handleRemove}
          disabled={isInProgress}
          className={cn(
            "rounded p-1 text-[hsl(var(--text-muted))] transition-colors",
            "hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--error))]",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
            isInProgress && "cursor-not-allowed"
          )}
          aria-label="Remove post"
        >
          <Cross2Icon className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4 p-4">
        {/* Clip selector */}
        <ClipSelector
          selectedClipId={post.clipId}
          clips={clips}
          onSelect={handleClipChange}
          disabled={isDisabled}
          allowNoClip={!config.requiresClip}
          error={
            validation.errors.find((e) => e.includes("clip")) ||
            (post.clipId && !clip ? "Selected clip no longer exists" : undefined)
          }
        />

        {isYouTube ? (
          <>
            <TextEditor
              label="Title"
              text={post.title || ""}
              onTextChange={handleTitleChange}
              snippets={snippets}
              maxLength={config.titleMaxLength || 100}
              placeholder="Add a YouTube title..."
              disabled={isDisabled}
              showSnippetPicker={false}
              rows={1}
            />
            <TextEditor
              label="Description"
              text={post.description || ""}
              onTextChange={handleDescriptionChange}
              snippets={snippets}
              maxLength={config.descriptionMaxLength || 5000}
              placeholder="Write your YouTube description..."
              disabled={isDisabled}
              showSnippetPicker={snippets.length > 0}
              sourceSnippetId={post.sourceSnippetId}
              rows={4}
            />
          </>
        ) : (
          <TextEditor
            text={post.textContent || ""}
            onTextChange={handleTextChange}
            snippets={snippets}
            maxLength={config.maxCaptionLength}
            placeholder={`Write your ${config.shortName} caption...`}
            disabled={isDisabled}
            showSnippetPicker={snippets.length > 0}
            sourceSnippetId={post.sourceSnippetId}
          />
        )}

        {/* Validation messages */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="space-y-1">
            {validation.errors.map((error, i) => (
              <p key={`error-${i}`} className="text-xs text-[hsl(var(--error))]">
                {error}
              </p>
            ))}
            {validation.warnings.map((warning, i) => (
              <p key={`warning-${i}`} className="text-xs text-[hsl(var(--warning))]">
                {warning}
              </p>
            ))}
          </div>
        )}

        {/* Progress indicator for rendering/uploading */}
        {(post.statusData.status === "rendering" || post.statusData.status === "uploading") && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[hsl(var(--text-muted))]">{progressLabel}</span>
              <span className="text-[hsl(var(--cyan))]">{post.statusData.progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[hsl(var(--surface-hover))]">
              <div
                className="h-full bg-[hsl(var(--cyan))] transition-all"
                style={{ width: `${post.statusData.progress}%` }}
              />
            </div>
          </div>
        )}

        {post.statusData.status === "completed" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {post.statusData.outputPath && (
              <button
                onClick={handleOpenOutput}
                className="rounded-full border border-[hsl(var(--glass-border))] px-2.5 py-1 text-[hsl(var(--text-subtle))] transition-colors hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))]"
              >
                Download clip
              </button>
            )}
            {(post.statusData.uploadedUrl || config.manualUploadUrl) && (
              <button
                onClick={handleOpenUpload}
                className="rounded-full border border-[hsl(var(--glass-border))] px-2.5 py-1 text-[hsl(var(--text-subtle))] transition-colors hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))]"
              >
                {post.statusData.uploadedUrl ? "View post" : "Open upload"}
              </button>
            )}
            {fullCaption && (
              <button
                onClick={handleCopyCaption}
                className="rounded-full border border-[hsl(var(--glass-border))] px-2.5 py-1 text-[hsl(var(--text-subtle))] transition-colors hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))]"
              >
                {isYouTube ? "Copy description" : "Copy caption"}
              </button>
            )}
          </div>
        )}

        {post.statusData.status === "failed" && (
          <div className="rounded-lg border border-[hsl(var(--error)/0.4)] bg-[hsl(var(--error)/0.08)] px-3 py-2 text-xs text-[hsl(var(--error))]">
            {post.statusData.error}
          </div>
        )}
      </div>
    </div>
  );
};
