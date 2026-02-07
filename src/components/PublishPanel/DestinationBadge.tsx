import React from "react";
import { CheckIcon, Cross2Icon, UpdateIcon } from "@radix-ui/react-icons";
import { PlatformIcon } from "./PlatformIcon";
import type { PublishDestinationType, PlatformConfig, PostStatus } from "../../lib/publish";
import { cn } from "../../lib/utils";

interface DestinationBadgeProps {
  destination: PublishDestinationType;
  config: PlatformConfig;
  isConnected: boolean;
  statusData: PostStatus;
  onConnect?: () => void;
}

export const DestinationBadge: React.FC<DestinationBadgeProps> = ({
  destination,
  config,
  isConnected,
  statusData,
  onConnect,
}) => {
  const status = statusData.status;
  const isManualOnly = !config.supportsDirectUpload;
  const isReady = isConnected || isManualOnly;

  // Determine badge appearance based on status
  const getBadgeStyle = () => {
    switch (status) {
      case "completed":
        return "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]";
      case "failed":
        return "bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))] border-[hsl(var(--error)/0.3)]";
      case "rendering":
      case "uploading":
        return "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/0.3)]";
      case "queued":
        return "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]";
      default:
        return isReady
          ? "bg-[hsl(var(--surface-hover))] text-[hsl(var(--text))] border-[hsl(var(--glass-border))]"
          : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] border-[hsl(var(--glass-border))]";
    }
  };

  // Get status indicator
  const getStatusIndicator = () => {
    switch (status) {
      case "completed":
        return <CheckIcon className="h-3 w-3" />;
      case "failed":
        return <Cross2Icon className="h-3 w-3" />;
      case "rendering":
      case "uploading":
        return <UpdateIcon className="h-3 w-3 animate-spin" />;
      case "queued":
        return <span className="text-[10px] font-medium">Q</span>;
      default:
        return null;
    }
  };

  // Get status text for tooltip
  const getStatusText = () => {
    switch (status) {
      case "completed":
        return "Published";
      case "failed":
        return statusData.status === "failed" ? statusData.error : "Failed";
      case "rendering":
        return `${
          statusData.stage === "processing" ? "Processing render" : "Rendering"
        } ${statusData.status === "rendering" ? statusData.progress : 0}%`;
      case "uploading":
        return `${
          statusData.stage === "processing"
            ? "Processing"
            : statusData.stage === "publishing"
              ? "Publishing"
              : statusData.stage === "posting"
                ? "Posting"
                : "Uploading"
        } ${statusData.status === "uploading" ? statusData.progress : 0}%`;
      case "queued":
        return "Queued";
      default:
        if (isManualOnly) return "Manual upload";
        return isConnected ? "Ready" : "Not connected";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        getBadgeStyle()
      )}
      title={getStatusText()}
    >
      <PlatformIcon
        platform={destination}
        className="h-4 w-4"
        style={{ color: status === "idle" ? config.brandColor : undefined }}
      />
      <span>{config.shortName}</span>

      {/* Status indicator or connection button */}
      {status !== "idle" ? (
        <span className="flex items-center">{getStatusIndicator()}</span>
      ) : !isConnected && config.requiresAuth && config.supportsDirectUpload && onConnect ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConnect();
          }}
          className="ml-1 text-[10px] underline hover:no-underline"
        >
          Connect
        </button>
      ) : isConnected ? (
        <CheckIcon className="h-3 w-3 text-[hsl(var(--success))]" />
      ) : null}
    </div>
  );
};
