import React, { useState } from "react";
import {
  DownloadIcon,
  CheckIcon,
  ExternalLinkIcon,
  RocketIcon,
  CheckCircledIcon,
  Share1Icon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { VideoFormat, VIDEO_FORMATS, Clip } from "../../lib/types";
import { formatDuration } from "../../lib/formats";
import { cn } from "../../lib/utils";

export const ExportPanel: React.FC = () => {
  const { currentProject, renderQueue, addRenderJob, updateRenderJob } = useProjectStore();
  const { settings } = useSettingsStore();

  const [selectedFormats, setSelectedFormats] = useState<VideoFormat[]>(settings.defaultFormats);
  const [selectedTemplateId] = useState(settings.defaultTemplate);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(
    currentProject?.clips.map((c) => c.id) || []
  );
  const [isExporting, setIsExporting] = useState(false);

  const projectClips = currentProject?.clips || [];

  const toggleFormat = (format: VideoFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
  };

  const toggleClip = (clipId: string) => {
    setSelectedClipIds((prev) =>
      prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId]
    );
  };

  const selectAllClips = () => {
    setSelectedClipIds(projectClips.map((c) => c.id));
  };

  const deselectAllClips = () => {
    setSelectedClipIds([]);
  };

  const getTotalExports = () => {
    return selectedClipIds.length * selectedFormats.length;
  };

  const startExport = async () => {
    if (selectedClipIds.length === 0 || selectedFormats.length === 0) return;

    setIsExporting(true);

    for (const clipId of selectedClipIds) {
      for (const format of selectedFormats) {
        const job = addRenderJob(clipId, format, selectedTemplateId);
        simulateRender(job.id);
      }
    }
  };

  const simulateRender = async (jobId: string) => {
    updateRenderJob(jobId, { status: "rendering", progress: 0 });

    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      updateRenderJob(jobId, { progress: i });
    }

    updateRenderJob(jobId, {
      status: "completed",
      progress: 100,
      outputPath: `/exports/clip_${jobId}.mp4`,
      completedAt: new Date().toISOString(),
    });
  };

  const openPlatformUpload = (platform: string, clip: Clip) => {
    const urls: Record<string, string> = {
      tiktok: "https://www.tiktok.com/upload",
      instagram: "https://www.instagram.com/",
      youtube: "https://studio.youtube.com/",
      twitter: "https://twitter.com/compose/tweet",
    };

    navigator.clipboard.writeText(clip.transcript);
    window.open(urls[platform] || urls.youtube, "_blank");
  };

  const completedJobs = renderQueue.filter((j) => j.status === "completed");
  const pendingJobs = renderQueue.filter((j) => j.status === "queued" || j.status === "rendering");

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div
            className={cn(
              "mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1",
              "bg-[hsl(var(--surface))]",
              "border border-[hsl(var(--glass-border))]"
            )}
          >
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">5</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">Step 5 of 5</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
            Export & Share
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
            Export your clips as videos and upload to social platforms
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Export Settings */}
          <div className="space-y-5 lg:col-span-2">
            {/* Format Selection */}
            <Card variant="default" className="animate-fadeIn">
              <CardContent className="p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      "bg-[hsl(185_50%_15%/0.5)]"
                    )}
                  >
                    <VideoIcon className="h-5 w-5 text-[hsl(var(--cyan))]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">Output Formats</p>
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      Select video formats to export
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {Object.values(VIDEO_FORMATS).map((format) => {
                    const isSelected = selectedFormats.includes(format.id);
                    return (
                      <button
                        key={format.id}
                        onClick={() => toggleFormat(format.id)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-[hsl(var(--text))]">
                            {format.name}
                          </span>
                          <div
                            className={cn(
                              "flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors",
                              isSelected
                                ? "border-[hsl(var(--cyan))] bg-[hsl(var(--cyan))]"
                                : "border-[hsl(var(--glass-border))]"
                            )}
                          >
                            {isSelected && <CheckIcon className="h-2 w-2 text-[hsl(260_30%_6%)]" />}
                          </div>
                        </div>
                        <p className="font-mono text-[10px] text-[hsl(var(--text-muted))]">
                          {format.width}x{format.height}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-[hsl(var(--text-muted))]">
                          {format.useCases[0]}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Clip Selection */}
            <Card variant="default" className="animate-fadeIn" style={{ animationDelay: "50ms" }}>
              <CardContent className="p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        "bg-[hsl(158_50%_15%/0.5)]"
                      )}
                    >
                      <CheckCircledIcon className="h-5 w-5 text-[hsl(var(--success))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--text))]">Select Clips</p>
                      <p className="text-xs text-[hsl(var(--text-muted))]">
                        Choose which clips to export
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={selectAllClips}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-[hsl(var(--text-subtle))] transition-colors hover:bg-[hsl(var(--surface))]"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllClips}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-[hsl(var(--text-subtle))] transition-colors hover:bg-[hsl(var(--surface))]"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {projectClips.map((clip) => {
                    const isSelected = selectedClipIds.includes(clip.id);
                    return (
                      <button
                        key={clip.id}
                        onClick={() => toggleClip(clip.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                            isSelected
                              ? "border-[hsl(var(--cyan))] bg-[hsl(var(--cyan))]"
                              : "border-[hsl(var(--glass-border))]"
                          )}
                        >
                          {isSelected && <CheckIcon className="h-3 w-3 text-[hsl(260_30%_6%)]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[hsl(var(--text))]">{clip.name}</p>
                          <p className="truncate text-xs text-[hsl(var(--text-muted))]">
                            {clip.transcript.slice(0, 60)}...
                          </p>
                        </div>
                        <span className="rounded-md bg-[hsl(var(--raised))] px-2 py-1 font-mono text-[10px] text-[hsl(var(--text-muted))]">
                          {formatDuration(clip.endTime - clip.startTime)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Export Button Card */}
            <Card
              variant="default"
              className="animate-fadeIn border-[hsl(158_70%_48%/0.2)] bg-[hsl(158_50%_15%/0.2)]"
              style={{ animationDelay: "100ms" }}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-lg",
                        "bg-[hsl(158_50%_15%/0.5)]"
                      )}
                    >
                      <RocketIcon className="h-5 w-5 text-[hsl(var(--success))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--text))]">
                        Ready to Export
                      </p>
                      <p className="text-xs text-[hsl(var(--text-subtle))]">
                        {getTotalExports()} video{getTotalExports() !== 1 ? "s" : ""} will be
                        generated
                        <span className="text-[hsl(var(--text-muted))]">
                          {" "}
                          ({selectedClipIds.length} × {selectedFormats.length})
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={startExport}
                    disabled={
                      selectedClipIds.length === 0 || selectedFormats.length === 0 || isExporting
                    }
                    glow={!isExporting && selectedClipIds.length > 0 && selectedFormats.length > 0}
                  >
                    {isExporting ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <DownloadIcon className="h-4 w-4" />
                        Export Videos
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Render Queue */}
            {pendingJobs.length > 0 && (
              <Card variant="default" className="animate-fadeInUp">
                <CardContent className="p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--warning))]" />
                    <p className="text-xs font-semibold text-[hsl(var(--text))]">
                      Rendering ({pendingJobs.length})
                    </p>
                  </div>
                  <div className="space-y-3">
                    {pendingJobs.map((job) => {
                      const clip = projectClips.find((c) => c.id === job.clipId);
                      return (
                        <div key={job.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[hsl(var(--text))]">
                              {clip?.name}
                            </span>
                            <span className="rounded bg-[hsl(var(--raised))] px-1.5 py-0.5 text-[9px] text-[hsl(var(--text-muted))]">
                              {job.format}
                            </span>
                          </div>
                          <Progress value={job.progress} variant="cyan" size="sm" />
                          <p className="text-right text-[10px] text-[hsl(var(--text-muted))] tabular-nums">
                            {job.progress}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Completed Exports */}
            {completedJobs.length > 0 && (
              <Card variant="default" className="animate-fadeInUp">
                <CardContent className="p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <CheckCircledIcon className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    <p className="text-xs font-semibold text-[hsl(var(--text))]">
                      Ready to Upload ({completedJobs.length})
                    </p>
                  </div>
                  <div className="space-y-3">
                    {completedJobs.map((job) => {
                      const clip = projectClips.find((c) => c.id === job.clipId);
                      if (!clip) return null;

                      return (
                        <div
                          key={job.id}
                          className={cn(
                            "rounded-lg p-3",
                            "bg-[hsl(var(--surface))]",
                            "border border-[hsl(var(--glass-border))]"
                          )}
                        >
                          <div className="mb-2.5 flex items-center justify-between">
                            <p className="text-xs font-medium text-[hsl(var(--text))]">
                              {clip.name}
                            </p>
                            <span className="rounded bg-[hsl(158_50%_15%/0.5)] px-1.5 py-0.5 text-[9px] text-[hsl(var(--success))]">
                              {job.format}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {["YouTube", "TikTok", "Instagram"].map((platform) => (
                              <button
                                key={platform}
                                onClick={() => openPlatformUpload(platform.toLowerCase(), clip)}
                                className={cn(
                                  "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                                  "border border-[hsl(var(--glass-border))]",
                                  "text-[hsl(var(--text-subtle))]",
                                  "hover:border-[hsl(0_0%_100%/0.12)]",
                                  "hover:bg-[hsl(var(--raised))]"
                                )}
                              >
                                <ExternalLinkIcon className="h-2.5 w-2.5" />
                                {platform}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Platform Tips */}
            <Card variant="default" className="animate-fadeIn" style={{ animationDelay: "150ms" }}>
              <CardContent className="p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Share1Icon className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
                  <p className="text-xs font-semibold text-[hsl(var(--text))]">Platform Tips</p>
                </div>
                <ul className="space-y-2.5">
                  {[
                    { color: "cyan", label: "YouTube", tip: "Shorts auto-detect from 9:16" },
                    { color: "magenta", label: "TikTok", tip: "Caption copied to clipboard" },
                    { color: "success", label: "Instagram", tip: "9:16 for Reels, 1:1 for posts" },
                    { color: "text-muted", label: "Twitter/X", tip: "16:9 or 1:1 work best" },
                  ].map(({ color, label, tip }) => (
                    <li key={label} className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          `bg-[hsl(var(--${color}))]`
                        )}
                      />
                      <div>
                        <span className="text-xs font-medium text-[hsl(var(--text))]">
                          {label}:
                        </span>{" "}
                        <span className="text-xs text-[hsl(var(--text-muted))]">{tip}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
