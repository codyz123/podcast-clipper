import React, { useEffect, useState, useMemo } from "react";
import { RocketIcon, CrossCircledIcon, CheckCircledIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, StatusDropdown } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { usePublishStore } from "../../stores/publishStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useEpisodes } from "../../hooks/useEpisodes";
import type { SocialPlatform } from "../../lib/publish";
import { cn } from "../../lib/utils";
import { ConnectedAccountsBar } from "./ConnectedAccountsBar";
import { ClipPublishCard } from "./ClipPublishCard";
import { startOAuthFlow, getOAuthStatus, type OAuthPlatform } from "../../services/oauth";
import { STAGE_SUB_STEPS, SUB_STEP_LABELS, type StageStatus } from "../../lib/statusConfig";

export const PublishPanel: React.FC = () => {
  const currentProject = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const connectAccount = useWorkspaceStore((s) => s.connectAccount);
  const { updateSubStepStatus } = useEpisodes();

  // Marketing sub-steps for the dropdown
  const marketingSubSteps = STAGE_SUB_STEPS.marketing;
  const marketingItems = marketingSubSteps.map((subStepId) => {
    const subStepEntry = currentProject?.stageStatus?.subSteps?.[subStepId];
    const status = (subStepEntry?.status as StageStatus) || "not-started";
    return {
      id: subStepId,
      label: SUB_STEP_LABELS[subStepId],
      status,
    };
  });

  const handleMarketingStatusChange = async (subStepId: string, newStatus: StageStatus) => {
    if (!currentProject?.id) return;

    // Optimistically update local state
    const prevSubSteps = currentProject?.stageStatus?.subSteps || {};
    const updatedSubSteps = {
      ...prevSubSteps,
      [subStepId]: { status: newStatus, updatedAt: new Date().toISOString() },
    };

    updateProject({
      stageStatus: {
        ...currentProject.stageStatus,
        subSteps: updatedSubSteps,
      },
    });

    const result = await updateSubStepStatus(currentProject.id, subStepId, newStatus);

    if (!result) {
      // Rollback on failure
      updateProject({
        stageStatus: {
          ...currentProject.stageStatus,
          subSteps: prevSubSteps,
        },
      });
    }
  };

  const {
    isPublishing,
    initializeForClips,
    startPublishing,
    cancelPublishing,
    retryAllFailed,
    getInstancesForClip,
    getEnabledInstances,
    getFailedInstances,
    getOverallProgress,
  } = usePublishStore();

  const [expandedClipIds, setExpandedClipIds] = useState<Set<string>>(new Set());
  const [connectingPlatform, setConnectingPlatform] = useState<SocialPlatform | null>(null);

  const projectClips = currentProject?.clips || [];

  // Initialize publish instances for all clips
  useEffect(() => {
    if (projectClips.length > 0) {
      const clipIds = projectClips.map((c) => c.id);
      initializeForClips(clipIds, (clipId) => {
        const clip = projectClips.find((c) => c.id === clipId);
        return clip?.transcript.slice(0, 100) || "";
      });

      // Expand first clip by default
      if (expandedClipIds.size === 0 && clipIds.length > 0) {
        setExpandedClipIds(new Set([clipIds[0]]));
      }
    }
  }, [projectClips.length]);

  const toggleClipExpanded = (clipId: string) => {
    setExpandedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  };

  // Sync OAuth status on mount
  useEffect(() => {
    const syncStatus = async () => {
      try {
        const statuses = await getOAuthStatus();
        for (const status of statuses) {
          if (status.connected && status.accountName) {
            connectAccount(status.platform, status.accountName);
          }
        }
      } catch (err) {
        console.error("Failed to sync OAuth status:", err);
      }
    };
    syncStatus();
  }, [connectAccount]);

  const handleConnect = async (platform: SocialPlatform) => {
    // Only YouTube is supported for now
    if (platform !== "youtube") {
      console.log(`OAuth for ${platform} is not yet implemented`);
      return;
    }

    setConnectingPlatform(platform);

    try {
      const result = await startOAuthFlow(platform as OAuthPlatform);
      if (result.success && result.accountName) {
        connectAccount(platform, result.accountName);
      } else if (result.error) {
        console.error("OAuth failed:", result.error);
      }
    } catch (err) {
      console.error("OAuth error:", err);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handlePublish = () => {
    startPublishing();
    // In production, this would trigger the actual render/upload pipeline
    // For now, we'll simulate it
    simulatePublishing();
  };

  const simulatePublishing = async () => {
    const { processNextInQueue, updateInstanceStatus, markInstanceComplete, markInstanceFailed } =
      usePublishStore.getState();

    while (true) {
      const instance = processNextInQueue();
      if (!instance) break;

      // Simulate rendering
      for (let progress = 0; progress <= 100; progress += 20) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        updateInstanceStatus(instance.id, {
          status: "rendering",
          progress,
          stage: progress < 80 ? "encoding" : "processing",
        });
      }

      // Simulate uploading (50% chance of needing upload)
      if (Math.random() > 0.3) {
        updateInstanceStatus(instance.id, { status: "uploading", progress: 0 });
        for (let progress = 0; progress <= 100; progress += 25) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          updateInstanceStatus(instance.id, { status: "uploading", progress });
        }
      }

      // Complete (90% success rate)
      if (Math.random() > 0.1) {
        markInstanceComplete(
          instance.id,
          `/exports/${instance.clipId}_${instance.destination}.mp4`,
          Math.random() > 0.5 ? `https://example.com/${instance.destination}/video123` : undefined
        );
      } else {
        markInstanceFailed(instance.id, "Upload failed: Network error");
      }
    }
  };

  const enabledInstances = getEnabledInstances();
  const failedInstances = getFailedInstances();
  const progress = getOverallProgress();

  const allComplete = useMemo(() => {
    return (
      enabledInstances.length > 0 &&
      enabledInstances.every(
        (i) => i.statusData.status === "completed" || i.statusData.status === "failed"
      )
    );
  }, [enabledInstances]);

  const hasValidationErrors = useMemo(() => {
    // Check if any enabled instance has validation errors
    // This would use the validatePublishInstance function in a real implementation
    return false;
  }, [enabledInstances]);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between sm:mb-10">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
              Publish
            </h1>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              Render and upload your clips to social platforms
            </p>
          </div>
          <StatusDropdown
            label="Marketing"
            items={marketingItems}
            onStatusChange={handleMarketingStatusChange}
          />
        </div>

        {/* Connected Accounts */}
        <div className="mb-6">
          <ConnectedAccountsBar onConnect={handleConnect} connectingPlatform={connectingPlatform} />
        </div>

        {/* Publishing Progress */}
        {isPublishing && (
          <Card variant="default" className="animate-fadeIn mb-6">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Spinner size="md" />
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">Publishing...</p>
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      {progress.currentItem ? `Currently: ${progress.currentItem}` : "Preparing..."}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={cancelPublishing}>
                  Cancel
                </Button>
              </div>
              <Progress
                value={(progress.completed / progress.total) * 100}
                variant="cyan"
                size="md"
              />
              <p className="mt-2 text-right text-xs text-[hsl(var(--text-muted))]">
                {progress.completed} of {progress.total} complete
              </p>
            </CardContent>
          </Card>
        )}

        {/* Completion Summary */}
        {allComplete && !isPublishing && (
          <Card
            variant="default"
            className={cn(
              "animate-fadeIn mb-6",
              failedInstances.length > 0
                ? "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]"
                : "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)]"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                {failedInstances.length === 0 ? (
                  <CheckCircledIcon className="h-6 w-6 text-[hsl(var(--success))]" />
                ) : (
                  <CrossCircledIcon className="h-6 w-6 text-[hsl(var(--warning))]" />
                )}
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">
                    {failedInstances.length === 0
                      ? "Publishing Complete"
                      : "Publishing Complete (with errors)"}
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    {progress.completed - progress.failed} uploaded successfully
                    {progress.failed > 0 && ` · ${progress.failed} failed`}
                  </p>
                </div>
                {failedInstances.length > 0 && (
                  <Button variant="outline" size="sm" onClick={retryAllFailed} className="ml-auto">
                    <ReloadIcon className="mr-1 h-3 w-3" />
                    Retry Failed
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clip Cards */}
        <div className="space-y-4">
          {projectClips.map((clip) => (
            <ClipPublishCard
              key={clip.id}
              clip={clip}
              instances={getInstancesForClip(clip.id)}
              isExpanded={expandedClipIds.has(clip.id)}
              onToggleExpand={() => toggleClipExpanded(clip.id)}
              onConnect={handleConnect}
              isPublishing={isPublishing}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-[hsl(var(--text-muted))]">
            {enabledInstances.length} video{enabledInstances.length !== 1 ? "s" : ""} will be
            published
            {failedInstances.length > 0 && (
              <span className="ml-2 text-[hsl(var(--warning))]">
                ({failedInstances.length} failed)
              </span>
            )}
          </div>
          <Button
            onClick={handlePublish}
            disabled={isPublishing || enabledInstances.length === 0 || hasValidationErrors}
            glow={!isPublishing && enabledInstances.length > 0}
          >
            {isPublishing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Publishing...
              </>
            ) : (
              <>
                <RocketIcon className="h-4 w-4" />
                Publish {enabledInstances.length} Video{enabledInstances.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
