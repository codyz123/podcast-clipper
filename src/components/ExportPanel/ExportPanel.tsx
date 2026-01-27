import React, { useState } from "react";
import {
  DownloadIcon,
  CheckIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from "../ui";
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

    // Create render jobs for each clip + format combination
    for (const clipId of selectedClipIds) {
      for (const format of selectedFormats) {
        const job = addRenderJob(clipId, format, selectedTemplateId);
        
        // Simulate rendering progress (in a real app, this would call the backend)
        simulateRender(job.id);
      }
    }
  };

  // Simulate rendering (placeholder for real implementation)
  const simulateRender = async (jobId: string) => {
    updateRenderJob(jobId, { status: "rendering", progress: 0 });

    // Simulate progress updates
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      updateRenderJob(jobId, { progress: i });
    }

    // Mark as complete
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

    // Copy clip transcript as caption
    navigator.clipboard.writeText(clip.transcript);

    // Open platform
    window.open(urls[platform] || urls.youtube, "_blank");
  };

  const completedJobs = renderQueue.filter((j) => j.status === "completed");
  const pendingJobs = renderQueue.filter(
    (j) => j.status === "queued" || j.status === "rendering"
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Export
        </h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Export your clips as videos and upload to social platforms
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Format Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Output Formats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.values(VIDEO_FORMATS).map((format) => (
                  <button
                    key={format.id}
                    onClick={() => toggleFormat(format.id)}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-colors",
                      selectedFormats.includes(format.id)
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{format.name}</span>
                      {selectedFormats.includes(format.id) && (
                        <CheckIcon className="w-4 h-4 text-[hsl(var(--primary))]" />
                      )}
                    </div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {format.width}x{format.height}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                      {format.useCases.slice(0, 2).join(", ")}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Clip Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Select Clips</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllClips}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAllClips}>
                    Deselect All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {projectClips.map((clip) => (
                  <button
                    key={clip.id}
                    onClick={() => toggleClip(clip.id)}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left transition-colors flex items-center gap-3",
                      selectedClipIds.includes(clip.id)
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center",
                        selectedClipIds.includes(clip.id)
                          ? "bg-[hsl(var(--primary))] border-[hsl(var(--primary))]"
                          : "border-[hsl(var(--border))]"
                      )}
                    >
                      {selectedClipIds.includes(clip.id) && (
                        <CheckIcon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{clip.name}</p>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] truncate">
                        {clip.transcript.slice(0, 60)}...
                      </p>
                    </div>
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                      {formatDuration(clip.endTime - clip.startTime)}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export Button */}
          <div className="flex items-center justify-between">
            <p className="text-[hsl(var(--muted-foreground))]">
              {getTotalExports()} video{getTotalExports() !== 1 ? "s" : ""} will be
              generated
            </p>
            <Button
              onClick={startExport}
              disabled={
                selectedClipIds.length === 0 ||
                selectedFormats.length === 0 ||
                isExporting
              }
              size="lg"
            >
              <DownloadIcon className="w-4 h-4 mr-2" />
              {isExporting ? "Exporting..." : "Export Videos"}
            </Button>
          </div>
        </div>

        {/* Render Queue & Upload */}
        <div className="space-y-4">
          {/* Render Queue */}
          {pendingJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Rendering ({pendingJobs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingJobs.map((job) => {
                    const clip = projectClips.find((c) => c.id === job.clipId);
                    return (
                      <div key={job.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {clip?.name} ({job.format})
                          </span>
                          <span className="text-[hsl(var(--muted-foreground))]">
                            {job.progress}%
                          </span>
                        </div>
                        <Progress value={job.progress} size="sm" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Completed Exports */}
          {completedJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ready to Upload ({completedJobs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedJobs.map((job) => {
                    const clip = projectClips.find((c) => c.id === job.clipId);
                    if (!clip) return null;

                    return (
                      <div
                        key={job.id}
                        className="p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
                      >
                        <p className="font-medium text-sm mb-2">
                          {clip.name} ({job.format})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPlatformUpload("youtube", clip)}
                          >
                            <ExternalLinkIcon className="w-3 h-3 mr-1" />
                            YouTube
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPlatformUpload("tiktok", clip)}
                          >
                            <ExternalLinkIcon className="w-3 h-3 mr-1" />
                            TikTok
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPlatformUpload("instagram", clip)}
                          >
                            <ExternalLinkIcon className="w-3 h-3 mr-1" />
                            Instagram
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Upload Help */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-[hsl(var(--muted-foreground))] space-y-2">
                <li>
                  <strong>YouTube:</strong> Shorts auto-detect from 9:16 format
                </li>
                <li>
                  <strong>TikTok:</strong> Caption copied to clipboard
                </li>
                <li>
                  <strong>Instagram:</strong> Use 9:16 for Reels, 1:1 for posts
                </li>
                <li>
                  <strong>Twitter:</strong> 16:9 or 1:1 work best
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
