import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { RocketIcon, CrossCircledIcon, CheckCircledIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { usePublishStore } from "../../stores/publishStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTextSnippets } from "../../hooks/useTextSnippets";
import type { SocialPlatform, PublishDestinationType } from "../../lib/publish";
import { PLATFORM_CONFIGS, buildPostText } from "../../lib/publish";
import * as publishUtils from "../../lib/publish";
import { cn } from "../../lib/utils";
import { PostCard } from "./PostCard";
import { AddPostButton } from "./AddPostButton";
import { startOAuthFlow, getOAuthStatus, type OAuthPlatform } from "../../services/oauth";
import { ensureRenderedClip } from "../../services/rendering/renderClip";
import { initializeYouTubeUpload, pollUploadProgress } from "../../services/youtube/uploadProgress";
import {
  initializeInstagramUpload,
  pollInstagramUploadProgress,
} from "../../services/instagram/uploadProgress";
import {
  initializeTikTokUpload,
  pollTikTokUploadProgress,
} from "../../services/tiktok/uploadProgress";
import { initializeXUpload, pollXUploadProgress } from "../../services/x/uploadProgress";

export const PublishPanel: React.FC = () => {
  const currentProject = useProjectStore((s) => s.currentProject);
  const connections = useWorkspaceStore((s) => s.connections);
  const connectAccount = useWorkspaceStore((s) => s.connectAccount);
  const { snippets, fetchSnippets } = useTextSnippets();

  // Publish store state
  const {
    posts,
    isPublishing,
    startPublishing,
    cancelPublishing,
    retryAllFailed,
    resetStuckPosts,
    getEnabledPosts,
    getFailedPosts,
    getNextInQueue,
    getOverallProgress,
    updatePostStatus,
    markPostComplete,
    markPostFailed,
  } = usePublishStore();

  const projectClips = useMemo(() => currentProject?.clips || [], [currentProject?.clips]);

  // Fetch snippets when project changes
  useEffect(() => {
    if (currentProject?.id) {
      fetchSnippets(currentProject.id);
    }
  }, [currentProject?.id, fetchSnippets]);

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

  // Check if a platform is connected
  const isPlatformConnected = useCallback(
    (destination: PublishDestinationType) => {
      const config = PLATFORM_CONFIGS[destination];
      if (!config.connectionPlatform) return true; // Local doesn't need auth
      return connections.some((c) => c.platform === config.connectionPlatform && c.connected);
    },
    [connections]
  );

  const handleConnect = useCallback(
    async (platform: SocialPlatform) => {
      try {
        const result = await startOAuthFlow(platform as OAuthPlatform);
        if (result.success && result.accountName) {
          connectAccount(platform, result.accountName);
        } else if (result.error) {
          console.error("OAuth failed:", result.error);
        }
      } catch (err) {
        console.error("OAuth error:", err);
      }
    },
    [connectAccount]
  );

  // Get connection handler for a specific destination
  const getConnectHandler = useCallback(
    (destination: PublishDestinationType) => {
      const config = PLATFORM_CONFIGS[destination];
      const { connectionPlatform } = config;
      if (!connectionPlatform || !config.supportsDirectUpload) return undefined;
      return () => handleConnect(connectionPlatform);
    },
    [handleConnect]
  );

  const handlePublish = () => {
    startPublishing();
    // Trigger the actual publish pipeline
    processPublishQueue();
  };

  const handleRetryFailed = () => {
    retryAllFailed();
    // Also need to mark as publishing and process the queue
    usePublishStore.setState({ isPublishing: true });
    processPublishQueue();
  };

  // Process the publish queue
  const processPublishQueue = async () => {
    while (true) {
      const post = getNextInQueue();
      if (!post) break;

      const config = PLATFORM_CONFIGS[post.destination];
      const isConnected = isPlatformConnected(post.destination);
      const clip = post.clipId ? projectClips.find((c) => c.id === post.clipId) : undefined;
      const format = post.format || config.defaultFormat;
      let uploadedUrl: string | undefined;
      let renderedClipUrl: string | undefined;

      if (post.clipId) {
        if (!clip) {
          markPostFailed(post.id, "Rendering failed: Clip not found");
          continue;
        }

        updatePostStatus(post.id, {
          status: "rendering",
          progress: 0,
          stage: "encoding",
        });

        try {
          const renderOverrides = clip
            ? {
                background: clip.background,
                subtitle: clip.subtitle,
                captionStyle: clip.captionStyle,
                tracks: clip.tracks,
                startTime: clip.startTime,
                endTime: clip.endTime,
                words: clip.words,
                renderScale: post.renderScale ?? 1,
              }
            : undefined;
          const result = await ensureRenderedClip(post.clipId, format, {
            onProgress: (status) => {
              const progress = Math.max(0, Math.min(100, status.progress || 0));
              updatePostStatus(post.id, {
                status: "rendering",
                progress,
                stage: progress >= 95 ? "processing" : "encoding",
              });
            },
            overrides: renderOverrides,
          });
          renderedClipUrl = result.renderedClipUrl;
        } catch (error) {
          markPostFailed(post.id, (error as Error).message || "Rendering failed");
          continue;
        }
      }

      const canDirectUpload = config.supportsDirectUpload && config.requiresAuth && isConnected;
      if (canDirectUpload) {
        const isYouTube =
          post.destination === "youtube-shorts" || post.destination === "youtube-video";

        if (isYouTube) {
          if (!post.clipId || !clip) {
            markPostFailed(post.id, "Upload failed: Missing clip");
            continue;
          }

          try {
            updatePostStatus(post.id, { status: "uploading", progress: 0, stage: "uploading" });

            const clipDurationSeconds = clip.endTime - clip.startTime;
            const inferredShort = format === "9:16" && clipDurationSeconds <= 60;
            const isShort = post.destination === "youtube-shorts" || inferredShort;

            const titleBase = post.title?.trim() || post.textContent?.split("\n")[0]?.trim();
            const title = (titleBase || clip.name || "Untitled").slice(0, 100);
            const description = post.description ?? post.textContent ?? "";

            const { uploadId } = await initializeYouTubeUpload({
              postId: post.id,
              clipId: post.clipId,
              title,
              description,
              tags: post.hashtags,
              privacyStatus: "public",
              isShort,
              format,
            });

            uploadedUrl = await pollUploadProgress(uploadId, (status) => {
              if (status.status === "completed" || status.status === "failed") return;

              const progress =
                status.status === "processing"
                  ? 50 + Math.round((status.processingProgress || 0) / 2)
                  : Math.round((status.uploadProgress || 0) / 2);

              const stage = status.status === "processing" ? "processing" : "uploading";

              updatePostStatus(post.id, {
                status: "uploading",
                progress: Math.max(0, Math.min(100, progress)),
                stage,
              });
            });
          } catch (error) {
            markPostFailed(post.id, (error as Error).message || "Upload failed");
            continue;
          }
        } else if (
          post.destination === "instagram-reels" ||
          post.destination === "instagram-post"
        ) {
          if (!post.clipId || !clip) {
            markPostFailed(post.id, "Upload failed: Missing clip");
            continue;
          }

          try {
            updatePostStatus(post.id, { status: "uploading", progress: 0, stage: "processing" });

            const caption = buildPostText(post, config);
            const isReel = post.destination === "instagram-reels";

            const { uploadId } = await initializeInstagramUpload({
              postId: post.id,
              clipId: post.clipId,
              caption,
              format,
              mediaType: isReel ? "REELS" : "VIDEO",
              shareToFeed: !isReel,
            });

            uploadedUrl = await pollInstagramUploadProgress(uploadId, (status) => {
              if (status.status === "completed" || status.status === "failed") return;

              const progress =
                status.status === "publishing"
                  ? 70 + Math.round((status.processingProgress || 0) / 3)
                  : Math.round(status.processingProgress || status.uploadProgress || 0);

              const stage = status.status === "publishing" ? "publishing" : "processing";

              updatePostStatus(post.id, {
                status: "uploading",
                progress: Math.max(0, Math.min(100, progress)),
                stage,
              });
            });
          } catch (error) {
            markPostFailed(post.id, (error as Error).message || "Upload failed");
            continue;
          }
        } else if (post.destination === "tiktok") {
          if (!post.clipId || !clip) {
            markPostFailed(post.id, "Upload failed: Missing clip");
            continue;
          }

          try {
            updatePostStatus(post.id, { status: "uploading", progress: 0, stage: "processing" });

            const caption = buildPostText(post, config);

            const { uploadId } = await initializeTikTokUpload({
              postId: post.id,
              clipId: post.clipId,
              caption,
              format,
            });

            uploadedUrl = await pollTikTokUploadProgress(uploadId, (status) => {
              if (status.status === "completed" || status.status === "failed") return;

              const progress = Math.round(status.processingProgress || status.uploadProgress || 0);

              updatePostStatus(post.id, {
                status: "uploading",
                progress: Math.max(0, Math.min(100, progress)),
                stage: "processing",
              });
            });
          } catch (error) {
            markPostFailed(post.id, (error as Error).message || "Upload failed");
            continue;
          }
        } else if (post.destination === "x") {
          if (!post.clipId || !clip) {
            markPostFailed(post.id, "Upload failed: Missing clip");
            continue;
          }

          try {
            updatePostStatus(post.id, { status: "uploading", progress: 0, stage: "uploading" });

            const caption = buildPostText(post, config);

            const { uploadId } = await initializeXUpload({
              postId: post.id,
              clipId: post.clipId,
              text: caption,
              format,
            });

            uploadedUrl = await pollXUploadProgress(uploadId, (status) => {
              if (status.status === "completed" || status.status === "failed") return;

              const progress =
                status.status === "processing" || status.status === "posting"
                  ? 70 + Math.round((status.processingProgress || 0) / 3)
                  : Math.round(status.uploadProgress || 0);

              const stage =
                status.status === "processing"
                  ? "processing"
                  : status.status === "posting"
                    ? "posting"
                    : "uploading";

              updatePostStatus(post.id, {
                status: "uploading",
                progress: Math.max(0, Math.min(100, progress)),
                stage,
              });
            });
          } catch (error) {
            markPostFailed(post.id, (error as Error).message || "Upload failed");
            continue;
          }
        }
      }

      markPostComplete(post.id, renderedClipUrl, uploadedUrl);
    }
  };

  const enabledPosts = getEnabledPosts();
  const failedPosts = getFailedPosts();
  const progress = getOverallProgress();
  const validationIssues = useMemo(
    () =>
      enabledPosts.flatMap((post) => {
        const config = PLATFORM_CONFIGS[post.destination];
        const clip = post.clipId ? projectClips.find((c) => c.id === post.clipId) : undefined;
        const validation = publishUtils.validatePost?.(
          post,
          clip,
          config,
          isPlatformConnected(post.destination)
        ) ?? {
          valid: true,
          canPublish: true,
          warnings: [],
          errors: [],
        };
        return validation.errors.length > 0 ? validation.errors : [];
      }),
    [enabledPosts, projectClips, isPlatformConnected]
  );
  const hasBlockingErrors = validationIssues.length > 0;
  const stuckPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          !isPublishing &&
          (p.statusData.status === "queued" ||
            p.statusData.status === "rendering" ||
            p.statusData.status === "uploading")
      ),
    [posts, isPublishing]
  );
  const activePost = useMemo(
    () =>
      enabledPosts.find(
        (p) => p.statusData.status === "rendering" || p.statusData.status === "uploading"
      ),
    [enabledPosts]
  );

  const progressLabel = useMemo(() => {
    if (activePost) {
      if (activePost.statusData.status === "rendering") {
        const stage =
          activePost.statusData.stage === "processing" ? "Processing render" : "Rendering";
        return `${stage} clip`;
      }

      const stage =
        activePost.statusData.status === "uploading" ? activePost.statusData.stage : undefined;
      const stageLabel =
        stage === "processing"
          ? "Processing"
          : stage === "publishing"
            ? "Publishing"
            : stage === "posting"
              ? "Posting"
              : "Uploading";
      const platform = PLATFORM_CONFIGS[activePost.destination].shortName;
      const preposition = stageLabel === "Uploading" ? "to" : "on";
      return `${stageLabel} ${preposition} ${platform}`;
    }

    if (progress.queued > 0) {
      return `Queued ${progress.queued} post${progress.queued !== 1 ? "s" : ""}`;
    }

    return "Preparing...";
  }, [activePost, progress.queued]);

  const allComplete = useMemo(() => {
    return (
      enabledPosts.length > 0 &&
      enabledPosts.every(
        (p) => p.statusData.status === "completed" || p.statusData.status === "failed"
      )
    );
  }, [enabledPosts]);

  const publishTriggeredRef = useRef(false);
  const [showCompletionSummary, setShowCompletionSummary] = useState(false);

  useEffect(() => {
    if (isPublishing) {
      publishTriggeredRef.current = true;
      setShowCompletionSummary(false);
    }
  }, [isPublishing]);

  useEffect(() => {
    if (!isPublishing && allComplete && publishTriggeredRef.current) {
      setShowCompletionSummary(true);
    }
  }, [isPublishing, allComplete]);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl">
        {/* Publishing Progress */}
        {isPublishing && (
          <Card variant="default" className="animate-fadeIn mb-6">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Spinner size="md" />
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">Publishing...</p>
                    <p className="text-xs text-[hsl(var(--text-muted))]">{progressLabel}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={cancelPublishing}>
                  Cancel
                </Button>
              </div>
              <Progress value={progress.percent} variant="cyan" size="md" />
              <p className="mt-2 text-right text-xs text-[hsl(var(--text-muted))]">
                {progress.completed + progress.failed} of {progress.total} complete
              </p>
            </CardContent>
          </Card>
        )}

        {stuckPosts.length > 0 && (
          <Card variant="default" className="animate-fadeIn mb-6 border-[hsl(var(--warning)/0.3)]">
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--text))]">
                  Stuck publish jobs detected
                </p>
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  {stuckPosts.length} job{stuckPosts.length !== 1 ? "s" : ""} not actively running.
                  Reset them to publish again.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetStuckPosts}>
                Clear Stuck Jobs
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Completion Summary */}
        {allComplete && !isPublishing && showCompletionSummary && (
          <Card
            variant="default"
            className={cn(
              "animate-fadeIn mb-6",
              failedPosts.length > 0
                ? "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]"
                : "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)]"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                {failedPosts.length === 0 ? (
                  <CheckCircledIcon className="h-6 w-6 text-[hsl(var(--success))]" />
                ) : (
                  <CrossCircledIcon className="h-6 w-6 text-[hsl(var(--warning))]" />
                )}
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">
                    {failedPosts.length === 0
                      ? "Publishing Complete"
                      : "Publishing Complete (with errors)"}
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    {progress.completed} published successfully
                    {progress.failed > 0 && ` · ${progress.failed} failed`}
                  </p>
                </div>
                {failedPosts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFailed}
                    className="ml-auto"
                  >
                    <ReloadIcon className="mr-1 h-3 w-3" />
                    Retry Failed
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Post Button */}
        <div className="mb-4">
          <AddPostButton disabled={isPublishing} />
        </div>

        {/* Post Cards */}
        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--glass-border))] bg-[hsl(var(--surface)/0.5)] p-12 text-center">
            <p className="text-sm text-[hsl(var(--text-muted))]">
              No posts yet. Click "Add Post" to create one.
            </p>
          </div>
        ) : (
          <div role="list" className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                clips={projectClips}
                snippets={snippets}
                isConnected={isPlatformConnected(post.destination)}
                onConnect={getConnectHandler(post.destination)}
                isPublishing={isPublishing}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-[hsl(var(--text-muted))]">
            {enabledPosts.length} post{enabledPosts.length !== 1 ? "s" : ""} will be published
            {failedPosts.length > 0 && (
              <span className="ml-2 text-[hsl(var(--warning))]">({failedPosts.length} failed)</span>
            )}
            {hasBlockingErrors && (
              <span className="ml-2 text-[hsl(var(--error))]">(fix errors to publish)</span>
            )}
          </div>
          <Button
            onClick={handlePublish}
            disabled={isPublishing || enabledPosts.length === 0 || hasBlockingErrors}
            glow={!isPublishing && enabledPosts.length > 0 && !hasBlockingErrors}
          >
            {isPublishing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Publishing...
              </>
            ) : (
              <>
                <RocketIcon className="h-4 w-4" />
                Publish {enabledPosts.length} Post{enabledPosts.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
