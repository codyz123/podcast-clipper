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
  const { currentProject, renderQueue, addRenderJob, updateRenderJob } =
    useProjectStore();
  const { settings } = useSettingsStore();

  const [selectedFormats, setSelectedFormats] = useState<VideoFormat[]>(
    settings.defaultFormats
  );
  const [selectedTemplateId] = useState(settings.defaultTemplate);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(
    currentProject?.clips.map((c) => c.id) || []
  );
  const [isExporting, setIsExporting] = useState(false);

  const projectClips = currentProject?.clips || [];

  const toggleFormat = (format: VideoFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format]
    );
  };

  const toggleClip = (clipId: string) => {
    setSelectedClipIds((prev) =>
      prev.includes(clipId)
        ? prev.filter((id) => id !== clipId)
        : [...prev, clipId]
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
  const pendingJobs = renderQueue.filter(
    (j) => j.status === "queued" || j.status === "rendering"
  );

  return (
    <div className="min-h-full">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4",
            "bg-[hsl(var(--surface))]",
            "border border-[hsl(var(--glass-border))]"
          )}>
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">5</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">
              Step 5 of 5
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--text))] tracking-tight font-[family-name:var(--font-display)]">
            Export & Share
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-sm">
            Export your clips as videos and upload to social platforms
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Export Settings */}
          <div className="lg:col-span-2 space-y-5">
            {/* Format Selection */}
            <Card variant="default" className="animate-fadeIn">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    "bg-[hsl(185_50%_15%/0.5)]"
                  )}>
                    <VideoIcon className="w-5 h-5 text-[hsl(var(--cyan))]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">
                      Output Formats
                    </p>
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      Select video formats to export
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.values(VIDEO_FORMATS).map((format) => {
                    const isSelected = selectedFormats.includes(format.id);
                    return (
                      <button
                        key={format.id}
                        onClick={() => toggleFormat(format.id)}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-[hsl(var(--text))]">
                            {format.name}
                          </span>
                          <div
                            className={cn(
                              "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
                              isSelected
                                ? "bg-[hsl(var(--cyan))] border-[hsl(var(--cyan))]"
                                : "border-[hsl(var(--glass-border))]"
                            )}
                          >
                            {isSelected && <CheckIcon className="w-2 h-2 text-[hsl(260_30%_6%)]" />}
                          </div>
                        </div>
                        <p className="text-[10px] text-[hsl(var(--text-muted))] font-mono">
                          {format.width}x{format.height}
                        </p>
                        <p className="text-[10px] text-[hsl(var(--text-muted))] mt-0.5 truncate">
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
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      "bg-[hsl(158_50%_15%/0.5)]"
                    )}>
                      <CheckCircledIcon className="w-5 h-5 text-[hsl(var(--success))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--text))]">
                        Select Clips
                      </p>
                      <p className="text-xs text-[hsl(var(--text-muted))]">
                        Choose which clips to export
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={selectAllClips}
                      className="px-2.5 py-1 rounded-md text-xs font-medium text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--surface))] transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllClips}
                      className="px-2.5 py-1 rounded-md text-xs font-medium text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--surface))] transition-colors"
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
                          "w-full p-3 rounded-lg border text-left transition-colors flex items-center gap-3",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0",
                            isSelected
                              ? "bg-[hsl(var(--cyan))] border-[hsl(var(--cyan))]"
                              : "border-[hsl(var(--glass-border))]"
                          )}
                        >
                          {isSelected && (
                            <CheckIcon className="w-3 h-3 text-[hsl(260_30%_6%)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[hsl(var(--text))]">
                            {clip.name}
                          </p>
                          <p className="text-xs text-[hsl(var(--text-muted))] truncate">
                            {clip.transcript.slice(0, 60)}...
                          </p>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-[hsl(var(--raised))] text-[hsl(var(--text-muted))]">
                          {formatDuration(clip.endTime - clip.startTime)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Export Button Card */}
            <Card variant="default" className="animate-fadeIn border-[hsl(158_70%_48%/0.2)] bg-[hsl(158_50%_15%/0.2)]" style={{ animationDelay: "100ms" }}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-11 h-11 rounded-lg flex items-center justify-center",
                      "bg-[hsl(158_50%_15%/0.5)]"
                    )}>
                      <RocketIcon className="w-5 h-5 text-[hsl(var(--success))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--text))]">
                        Ready to Export
                      </p>
                      <p className="text-xs text-[hsl(var(--text-subtle))]">
                        {getTotalExports()} video{getTotalExports() !== 1 ? "s" : ""} will be generated
                        <span className="text-[hsl(var(--text-muted))]">
                          {" "}({selectedClipIds.length} × {selectedFormats.length})
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={startExport}
                    disabled={
                      selectedClipIds.length === 0 ||
                      selectedFormats.length === 0 ||
                      isExporting
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
                        <DownloadIcon className="w-4 h-4" />
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
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
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
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--raised))] text-[hsl(var(--text-muted))]">
                              {job.format}
                            </span>
                          </div>
                          <Progress value={job.progress} variant="cyan" size="sm" />
                          <p className="text-[10px] text-[hsl(var(--text-muted))] text-right tabular-nums">
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
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircledIcon className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
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
                            "p-3 rounded-lg",
                            "bg-[hsl(var(--surface))]",
                            "border border-[hsl(var(--glass-border))]"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <p className="text-xs font-medium text-[hsl(var(--text))]">
                              {clip.name}
                            </p>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(158_50%_15%/0.5)] text-[hsl(var(--success))]">
                              {job.format}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {["YouTube", "TikTok", "Instagram"].map((platform) => (
                              <button
                                key={platform}
                                onClick={() => openPlatformUpload(platform.toLowerCase(), clip)}
                                className={cn(
                                  "px-2 py-1 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1",
                                  "border border-[hsl(var(--glass-border))]",
                                  "text-[hsl(var(--text-subtle))]",
                                  "hover:border-[hsl(0_0%_100%/0.12)]",
                                  "hover:bg-[hsl(var(--raised))]"
                                )}
                              >
                                <ExternalLinkIcon className="w-2.5 h-2.5" />
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
                <div className="flex items-center gap-2 mb-4">
                  <Share1Icon className="w-3.5 h-3.5 text-[hsl(var(--text-muted))]" />
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
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                        `bg-[hsl(var(--${color}))]`
                      )} />
                      <div>
                        <span className="text-xs font-medium text-[hsl(var(--text))]">{label}:</span>{" "}
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
