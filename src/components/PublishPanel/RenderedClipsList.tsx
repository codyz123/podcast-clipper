import React, { useState, useCallback, useRef } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  DownloadIcon,
  RocketIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { Card, CardContent } from "../ui";
import { Spinner } from "../ui/Progress";
import { formatFileSize, cn } from "../../lib/utils";
import { formatRelativeTime } from "../../lib/formats";
import { getProxiedMediaUrl } from "../../lib/api";
import {
  type PublishDestinationType,
  PLATFORM_CONFIGS,
  DEFAULT_DESTINATIONS,
} from "../../lib/publish";
import { usePublishStore } from "../../stores/publishStore";
import { PlatformIcon } from "./PlatformIcon";
import type { RenderedClipEntry } from "../../hooks/useRenderedClips";

interface RenderedClipsListProps {
  renderedClips: RenderedClipEntry[];
  isLoading: boolean;
  onDelete?: (id: string) => Promise<void>;
}

export const RenderedClipsList: React.FC<RenderedClipsListProps> = ({
  renderedClips,
  isLoading,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(renderedClips.length > 0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishMenuId, setPublishMenuId] = useState<string | null>(null);
  const publishMenuRef = useRef<HTMLDivElement>(null);

  const createPost = usePublishStore((s) => s.createPost);
  const setPostClip = usePublishStore((s) => s.setPostClip);
  const setPostFormat = usePublishStore((s) => s.setPostFormat);

  const handleDownload = useCallback(async (entry: RenderedClipEntry) => {
    setDownloadingId(entry.id);
    try {
      const downloadUrl = getProxiedMediaUrl(entry.blobUrl) || entry.blobUrl;
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.clipName || "clip"}-${entry.format}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(entry.blobUrl, "_blank");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleDelete = useCallback(
    async (entry: RenderedClipEntry) => {
      if (!onDelete) return;
      if (!confirm(`Delete rendered clip "${entry.clipName || "Untitled"}" (${entry.format})?`)) {
        return;
      }
      setDeletingId(entry.id);
      try {
        await onDelete(entry.id);
      } catch {
        // Error handled upstream
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete]
  );

  const handlePublish = useCallback(
    (entry: RenderedClipEntry, destination: PublishDestinationType) => {
      const post = createPost(destination);
      setPostClip(post.id, entry.clipId);
      // Set format to match the rendered clip's format
      const config = PLATFORM_CONFIGS[destination];
      const format = config.supportedFormats.includes(entry.format as never)
        ? entry.format
        : config.defaultFormat;
      setPostFormat(post.id, format as import("../../lib/types").VideoFormat);
      setPublishMenuId(null);
    },
    [createPost, setPostClip, setPostFormat]
  );

  const togglePublishMenu = useCallback((entryId: string) => {
    setPublishMenuId((prev) => (prev === entryId ? null : entryId));
  }, []);

  // Close publish menu on click outside
  React.useEffect(() => {
    if (!publishMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (publishMenuRef.current && !publishMenuRef.current.contains(e.target as Node)) {
        setPublishMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [publishMenuId]);

  if (isLoading && renderedClips.length === 0) {
    return (
      <div className="mb-4 flex items-center justify-center py-4">
        <Spinner size="sm" />
        <span className="ml-2 text-xs text-[hsl(var(--text-muted))]">
          Loading rendered clips...
        </span>
      </div>
    );
  }

  if (renderedClips.length === 0) return null;

  const allDestinations: PublishDestinationType[] = [...DEFAULT_DESTINATIONS, "local"];

  return (
    <Card variant="default" className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-[hsl(var(--surface)/0.5)]"
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
        )}
        <VideoIcon className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
        <span className="text-xs font-medium text-[hsl(var(--text))]">Rendered Clips</span>
        <span className="rounded-full bg-[hsl(var(--surface))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--text-muted))]">
          {renderedClips.length}
        </span>
      </button>

      {isExpanded && (
        <CardContent className="border-t border-[hsl(var(--glass-border))] px-3 py-2">
          <div className="space-y-1">
            {renderedClips.map((entry) => (
              <div
                key={entry.id}
                className="group/clip flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[hsl(var(--surface)/0.5)]"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-xs text-[hsl(var(--text))]">
                    {entry.clipName || "Untitled"}
                  </span>
                </div>
                <span className="shrink-0 rounded bg-[hsl(var(--surface))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--text-muted))]">
                  {entry.format}
                </span>
                {entry.sizeBytes && (
                  <span className="shrink-0 text-[10px] text-[hsl(var(--text-muted))]">
                    {formatFileSize(Number(entry.sizeBytes))}
                  </span>
                )}
                <span className="shrink-0 text-[10px] text-[hsl(var(--text-muted))]">
                  {formatRelativeTime(entry.renderedAt)}
                </span>

                {/* Publish button with destination dropdown */}
                <div
                  className="relative"
                  ref={publishMenuId === entry.id ? publishMenuRef : undefined}
                >
                  <button
                    onClick={() => togglePublishMenu(entry.id)}
                    className="shrink-0 rounded-full border border-[hsl(var(--glass-border))] p-1 text-[hsl(var(--text-muted))] transition-colors hover:border-[hsl(var(--cyan)/0.5)] hover:text-[hsl(var(--cyan))] disabled:opacity-50"
                    title="Publish"
                  >
                    <RocketIcon className="h-3 w-3" />
                  </button>

                  {publishMenuId === entry.id && (
                    <div
                      className={cn(
                        "absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border shadow-lg",
                        "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
                        "overflow-hidden"
                      )}
                    >
                      <div className="p-1">
                        {allDestinations.map((destination) => {
                          const config = PLATFORM_CONFIGS[destination];
                          return (
                            <button
                              key={destination}
                              type="button"
                              onClick={() => handlePublish(entry, destination)}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                                "hover:bg-[hsl(var(--surface-hover))]"
                              )}
                            >
                              <PlatformIcon
                                platform={destination}
                                className="h-4 w-4"
                                style={{ color: config.brandColor }}
                              />
                              <span className="font-medium">{config.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Download button */}
                <button
                  onClick={() => handleDownload(entry)}
                  disabled={downloadingId === entry.id}
                  className="shrink-0 rounded-full border border-[hsl(var(--glass-border))] p-1 text-[hsl(var(--text-muted))] transition-colors hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))] disabled:opacity-50"
                  title="Download"
                >
                  {downloadingId === entry.id ? (
                    <Spinner size="sm" />
                  ) : (
                    <DownloadIcon className="h-3 w-3" />
                  )}
                </button>

                {/* Delete button */}
                {onDelete && (
                  <button
                    onClick={() => handleDelete(entry)}
                    disabled={deletingId === entry.id}
                    className={cn(
                      "shrink-0 rounded-full border border-[hsl(var(--glass-border))] p-1 transition-colors",
                      "text-[hsl(var(--text-muted))] hover:border-[hsl(var(--error)/0.5)] hover:text-[hsl(var(--error))]",
                      "opacity-0 group-hover/clip:opacity-100 focus:opacity-100",
                      "disabled:opacity-50"
                    )}
                    title="Delete rendered clip"
                  >
                    {deletingId === entry.id ? (
                      <Spinner size="sm" />
                    ) : (
                      <Cross2Icon className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
