import React, { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent } from "../ui";
import type { Clip } from "../../lib/types";
import {
  PLATFORM_CONFIGS,
  type PublishInstance,
  type PublishDestinationType,
  type SocialPlatform,
} from "../../lib/publish";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { usePublishStore } from "../../stores/publishStore";
import { formatDuration } from "../../lib/formats";
import { cn } from "../../lib/utils";
import { CaptionEditor } from "./CaptionEditor";
import { DestinationRow } from "./DestinationRow";

interface ClipPublishCardProps {
  clip: Clip;
  instances: PublishInstance[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onConnect: (platform: SocialPlatform) => void;
  isPublishing: boolean;
}

export const ClipPublishCard: React.FC<ClipPublishCardProps> = ({
  clip,
  instances,
  isExpanded,
  onToggleExpand,
  onConnect,
  isPublishing,
}) => {
  const connections = useWorkspaceStore((s) => s.connections);
  const {
    toggleInstance,
    removeInstance,
    setInstanceFormat,
    setInstanceCaption,
    setInstanceHashtags,
    addInstance,
    retryInstance,
    getAvailableDestinations,
  } = usePublishStore();

  const [showAddMenu, setShowAddMenu] = useState(false);

  // Get a shared caption from the first instance or default to clip transcript
  const sharedCaption = instances[0]?.caption || "";
  const sharedHashtags = instances[0]?.hashtags || [];

  // Get shortest max caption length from all enabled destinations
  const minCaptionLength = instances
    .filter((i) => i.enabled)
    .map((i) => PLATFORM_CONFIGS[i.destination].maxCaptionLength)
    .filter((l): l is number => l !== null)
    .reduce((min, l) => Math.min(min, l), Infinity);

  const handleSharedCaptionChange = (caption: string) => {
    // Update caption for all instances of this clip
    instances.forEach((instance) => {
      setInstanceCaption(instance.id, caption);
    });
  };

  const handleSharedHashtagsChange = (hashtags: string[]) => {
    instances.forEach((instance) => {
      setInstanceHashtags(instance.id, hashtags);
    });
  };

  const isConnected = (destination: PublishDestinationType) => {
    const config = PLATFORM_CONFIGS[destination];
    if (!config.connectionPlatform) return true;
    return connections.find((c) => c.platform === config.connectionPlatform)?.connected || false;
  };

  const handleAddDestination = (destination: PublishDestinationType) => {
    addInstance(clip.id, destination);
    setShowAddMenu(false);
  };

  const availableDestinations = getAvailableDestinations(clip.id);
  const duration = clip.endTime - clip.startTime;
  const enabledCount = instances.filter((i) => i.enabled).length;

  return (
    <Card variant="default" className="animate-fadeIn">
      <CardContent className="p-0">
        {/* Header - always visible */}
        <button
          onClick={onToggleExpand}
          className={cn(
            "flex w-full items-center gap-3 p-4 text-left transition-colors",
            "hover:bg-[hsl(var(--surface-hover))]"
          )}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-[hsl(var(--text-muted))]" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-[hsl(var(--text-muted))]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[hsl(var(--text))]">{clip.name}</p>
            <p className="truncate text-xs text-[hsl(var(--text-muted))]">
              {clip.transcript.slice(0, 60)}...
            </p>
          </div>
          <span className="rounded-md bg-[hsl(var(--raised))] px-2 py-1 font-mono text-[10px] text-[hsl(var(--text-muted))]">
            {formatDuration(duration)}
          </span>
          <span className="rounded-md bg-[hsl(var(--cyan)/0.1)] px-2 py-1 text-[10px] font-medium text-[hsl(var(--cyan))]">
            {enabledCount} destination{enabledCount !== 1 ? "s" : ""}
          </span>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[hsl(var(--glass-border))] p-4">
            {/* Shared caption editor */}
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold text-[hsl(var(--text-muted))]">
                Caption for all destinations
              </h4>
              <CaptionEditor
                caption={sharedCaption}
                hashtags={sharedHashtags}
                onCaptionChange={handleSharedCaptionChange}
                onHashtagsChange={handleSharedHashtagsChange}
                maxLength={minCaptionLength === Infinity ? undefined : minCaptionLength}
                disabled={isPublishing}
              />
            </div>

            {/* Destinations list */}
            <div className="mb-3">
              <h4 className="mb-2 text-xs font-semibold text-[hsl(var(--text-muted))]">
                Destinations
              </h4>
              <div className="space-y-2">
                {instances.map((instance) => {
                  const config = PLATFORM_CONFIGS[instance.destination];
                  return (
                    <DestinationRow
                      key={instance.id}
                      instance={instance}
                      clip={clip}
                      config={config}
                      isConnected={isConnected(instance.destination)}
                      onToggle={() => toggleInstance(instance.id)}
                      onRemove={() => removeInstance(instance.id)}
                      onFormatChange={(format) => setInstanceFormat(instance.id, format)}
                      onConnect={() => {
                        if (config.connectionPlatform) {
                          onConnect(config.connectionPlatform);
                        }
                      }}
                      onEditCaption={() => {
                        /* TODO: Implement per-destination caption override dialog */
                      }}
                      onRetry={() => retryInstance(instance.id)}
                      isPublishing={isPublishing}
                    />
                  );
                })}
              </div>
            </div>

            {/* Add destination button */}
            {availableDestinations.length > 0 && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  disabled={isPublishing}
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" />
                  Add Destination
                </Button>

                {showAddMenu && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                    {/* Menu */}
                    <div
                      className={cn(
                        "absolute top-full left-0 z-20 mt-1 w-48 rounded-lg border p-1 shadow-lg",
                        "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))]"
                      )}
                    >
                      {availableDestinations.map((destination) => {
                        const config = PLATFORM_CONFIGS[destination];
                        return (
                          <button
                            key={destination}
                            onClick={() => handleAddDestination(destination)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                              "text-[hsl(var(--text))] transition-colors",
                              "hover:bg-[hsl(var(--surface-hover))]"
                            )}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: config.brandColor }}
                            />
                            {config.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
