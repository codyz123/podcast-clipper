import React, { useMemo } from "react";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ExternalLinkIcon,
  ClipboardIcon,
  Pencil1Icon,
  Cross2Icon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { Button } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import type { Clip, VideoFormat } from "../../lib/types";
import {
  validatePublishInstance,
  buildFullCaption,
  type PublishInstance,
  type PlatformConfig,
} from "../../lib/publish";
import { PlatformIcon } from "./PlatformIcon";
import { cn } from "../../lib/utils";

interface DestinationRowProps {
  instance: PublishInstance;
  clip: Clip;
  config: PlatformConfig;
  isConnected: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onFormatChange: (format: VideoFormat) => void;
  onConnect: () => void;
  onEditCaption: () => void;
  onRetry: () => void;
  isPublishing: boolean;
}

export const DestinationRow: React.FC<DestinationRowProps> = ({
  instance,
  clip,
  config,
  isConnected,
  onToggle,
  onRemove,
  onFormatChange,
  onConnect,
  onEditCaption,
  onRetry,
  isPublishing,
}) => {
  const validation = useMemo(
    () => validatePublishInstance(instance, clip, config, isConnected),
    [instance, clip, config, isConnected]
  );

  const { status } = instance.statusData;
  const isInProgress = status === "rendering" || status === "uploading";
  const isComplete = status === "completed";
  const isFailed = status === "failed";
  const needsManualUpload = isComplete && config.requiresAuth && !isConnected;

  const handleCopyCaption = () => {
    const fullCaption = buildFullCaption(instance, config);
    navigator.clipboard.writeText(fullCaption);
  };

  const handleOpenPlatform = () => {
    if (config.manualUploadUrl) {
      window.open(config.manualUploadUrl, "_blank");
    }
  };

  const getProgress = () => {
    if (status === "rendering") return instance.statusData.progress;
    if (status === "uploading") return instance.statusData.progress;
    return 0;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-all",
        !instance.enabled && "opacity-50",
        isFailed && "border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error)/0.05)]",
        isComplete &&
          !needsManualUpload &&
          "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)]",
        needsManualUpload && "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]",
        !isFailed && !isComplete && "border-[hsl(var(--glass-border))]"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        disabled={isPublishing && isInProgress}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          instance.enabled
            ? "border-[hsl(var(--cyan))] bg-[hsl(var(--cyan))]"
            : "border-[hsl(var(--glass-border))] hover:border-[hsl(var(--text-muted))]",
          "disabled:cursor-not-allowed"
        )}
      >
        {instance.enabled && <CheckIcon className="h-3 w-3 text-[hsl(260_30%_6%)]" />}
      </button>

      {/* Platform badge */}
      <div className="flex min-w-[110px] items-center gap-2">
        <PlatformIcon
          platform={instance.destination}
          className="h-5 w-5"
          style={{ color: config.brandColor }}
        />
        <span className="text-sm font-medium text-[hsl(var(--text))]">{config.shortName}</span>
      </div>

      {/* Format selector */}
      <select
        value={instance.format}
        onChange={(e) => onFormatChange(e.target.value as VideoFormat)}
        disabled={isPublishing || config.supportedFormats.length === 1}
        className={cn(
          "h-7 w-16 rounded-md border px-1.5 text-xs",
          "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]",
          "text-[hsl(var(--text))]",
          "focus:border-[hsl(var(--cyan))] focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {config.supportedFormats.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {/* Status / Connection / Actions area */}
      <div className="flex flex-1 items-center gap-2">
        {/* In Progress - show progress bar */}
        {isInProgress && (
          <div className="flex flex-1 items-center gap-2">
            <Progress value={getProgress()} variant="cyan" size="sm" className="max-w-[120px]" />
            <span className="text-[10px] text-[hsl(var(--text-muted))]">
              {status === "rendering" ? "Rendering" : "Uploading"}
            </span>
          </div>
        )}

        {/* Complete - show view/copy actions */}
        {isComplete &&
          !needsManualUpload &&
          instance.statusData.status === "completed" &&
          (() => {
            const completedStatus = instance.statusData;
            return (
              <div className="flex items-center gap-1">
                <CheckCircledIcon className="h-4 w-4 text-[hsl(var(--success))]" />
                {completedStatus.uploadedUrl && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(completedStatus.uploadedUrl, "_blank")}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(completedStatus.uploadedUrl!)}
                    >
                      Copy Link
                    </Button>
                  </>
                )}
              </div>
            );
          })()}

        {/* Needs manual upload */}
        {needsManualUpload && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopyCaption}>
              <ClipboardIcon className="mr-1 h-3 w-3" />
              Copy Caption
            </Button>
            <Button variant="ghost" size="sm" onClick={handleOpenPlatform}>
              <ExternalLinkIcon className="mr-1 h-3 w-3" />
              Open {config.shortName}
            </Button>
          </div>
        )}

        {/* Failed - show error and retry */}
        {isFailed && instance.statusData.status === "failed" && (
          <div className="flex items-center gap-2">
            <div className="group relative">
              <CrossCircledIcon className="h-4 w-4 text-[hsl(var(--error))]" />
              <div className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded bg-[hsl(var(--raised))] px-2 py-1 text-xs whitespace-nowrap text-[hsl(var(--text))] shadow-lg group-hover:block">
                {instance.statusData.error}
              </div>
            </div>
            {instance.statusData.retryCount < 3 && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Idle - show connection status */}
        {status === "idle" && !isComplete && (
          <>
            {config.requiresAuth && !isConnected ? (
              <Button variant="outline" size="sm" onClick={onConnect} className="text-xs">
                Connect {config.shortName}
              </Button>
            ) : (
              <span className="text-xs text-[hsl(var(--success))]">Ready</span>
            )}
          </>
        )}

        {/* Queued */}
        {status === "queued" && (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-xs text-[hsl(var(--text-muted))]">Queued</span>
          </div>
        )}
      </div>

      {/* Validation indicators */}
      {!validation.valid && validation.errors.length > 0 && (
        <div className="group relative">
          <ExclamationTriangleIcon className="h-4 w-4 text-[hsl(var(--error))]" />
          <div className="absolute right-0 bottom-full mb-1 hidden rounded bg-[hsl(var(--raised))] px-2 py-1 text-xs whitespace-nowrap text-[hsl(var(--text))] shadow-lg group-hover:block">
            {validation.errors.join(", ")}
          </div>
        </div>
      )}

      {/* Edit caption button */}
      <button
        onClick={onEditCaption}
        disabled={isPublishing && isInProgress}
        className={cn(
          "rounded-md p-1.5 transition-colors",
          "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <Pencil1Icon className="h-3.5 w-3.5" />
      </button>

      {/* Remove button */}
      <button
        onClick={onRemove}
        disabled={isPublishing && isInProgress}
        className={cn(
          "rounded-md p-1.5 transition-colors",
          "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <Cross2Icon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
