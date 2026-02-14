import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  UploadIcon,
  Cross2Icon,
  CheckIcon,
  VideoIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, Select, Input } from "../ui";
import { Progress } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useAuthStore } from "../../stores/authStore";
import { useMultiVideoUpload, computeFileFingerprint } from "../../hooks/useMultiVideoUpload";
import { usePodcastPeople } from "../../hooks/usePodcastPeople";
import {
  videoSourceKeys,
  fetchVideoSources,
  episodeKeys,
  updateVideoSourceApi,
  updateVideoConfigApi,
  deleteVideoSourceApi,
  checkDuplicateVideosApi,
} from "../../lib/queries";
import { cn } from "../../lib/utils";

const ACCEPTED_VIDEO = ".mp4,.mov,.mkv,.webm,.avi";
const ACCEPTED_AUDIO = ".wav,.mp3,.flac,.m4a";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface VideoImportProps {
  onImportComplete?: () => void;
}

export const VideoImport: React.FC<VideoImportProps> = ({ onImportComplete }) => {
  const { currentProject } = useProjectStore();
  const { currentPodcastId } = useAuthStore();
  const episodeId = currentProject?.id ?? null;
  const queryClient = useQueryClient();

  const { files, isUploading, uploadAll, cancel, reset, completedCount, totalCount } =
    useMultiVideoUpload(currentPodcastId, episodeId);

  const { people } = usePodcastPeople();

  // Video sources from server via React Query — loads on mount, caches across navigation
  const { data: videoSources = [], isLoading: isLoadingSources } = useQuery({
    queryKey: videoSourceKeys.all(currentPodcastId!, episodeId!),
    queryFn: () => fetchVideoSources(currentPodcastId!, episodeId!),
    enabled: !!currentPodcastId && !!episodeId,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [defaultSourceId, setDefaultSourceId] = useState(
    currentProject?.defaultVideoSourceId ?? ""
  );
  const [primaryAudioSourceId, setPrimaryAudioSourceId] = useState(
    currentProject?.primaryAudioSourceId ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Invalidate both video sources and episode detail queries after any mutation
  const invalidateSources = useCallback(() => {
    if (!currentPodcastId || !episodeId) return;
    queryClient.invalidateQueries({ queryKey: videoSourceKeys.all(currentPodcastId, episodeId) });
    queryClient.invalidateQueries({ queryKey: episodeKeys.detail(currentPodcastId, episodeId) });
  }, [queryClient, currentPodcastId, episodeId]);

  // Auto-select defaults when there's only one source
  useEffect(() => {
    if (videoSources.length === 1 && !defaultSourceId) {
      setDefaultSourceId(videoSources[0].id);
      if (videoSources[0].sourceType === "speaker") {
        setPrimaryAudioSourceId(videoSources[0].id);
      }
    }
  }, [videoSources, defaultSourceId]);

  // Filter out files that already exist as video sources or are already queued
  const dedupeFiles = useCallback(
    async (selectedFiles: File[]): Promise<File[]> => {
      if (selectedFiles.length === 0) return [];

      const fingerprints = await Promise.all(selectedFiles.map(computeFileFingerprint));

      // Check against already-queued files (client-side)
      const queuedFingerprints = new Set(files.map((f) => f.fingerprint));

      // Check against DB via server
      let dbDuplicates = new Set<string>();
      if (currentPodcastId && episodeId) {
        const dupes = await checkDuplicateVideosApi(currentPodcastId, episodeId, fingerprints);
        dbDuplicates = new Set(dupes);
      }

      return selectedFiles.filter((_, i) => {
        const fp = fingerprints[i];
        return !dbDuplicates.has(fp) && !queuedFingerprints.has(fp);
      });
    },
    [files, currentPodcastId, episodeId]
  );

  const handleFiles = useCallback(
    async (selectedFiles: File[]) => {
      const mediaFiles = selectedFiles.filter((f) =>
        /\.(mp4|mov|mkv|webm|avi|wav|mp3|flac|m4a)$/i.test(f.name)
      );
      if (mediaFiles.length === 0) return;

      const newFiles = await dedupeFiles(mediaFiles);
      if (newFiles.length === 0) return; // All duplicates — existing sources already visible

      await uploadAll(newFiles);
      invalidateSources();
    },
    [uploadAll, dedupeFiles, invalidateSources]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles]
  );

  // Queue additional files while uploads are in progress (fire-and-forget)
  const addMoreFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const mediaFiles = Array.from(e.target.files).filter((f) =>
        /\.(mp4|mov|mkv|webm|avi|wav|mp3|flac|m4a)$/i.test(f.name)
      );
      const newFiles = await dedupeFiles(mediaFiles);
      if (newFiles.length > 0) {
        uploadAll(newFiles); // Don't await — runs in background
      }
      e.target.value = "";
    },
    [uploadAll, dedupeFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(Array.from(e.target.files));
      }
    },
    [handleFiles]
  );

  const handleSourceUpdate = useCallback(
    async (sourceId: string, field: string, value: string | number) => {
      if (!currentPodcastId || !episodeId) return;
      try {
        await updateVideoSourceApi(currentPodcastId, episodeId, sourceId, { [field]: value });
        invalidateSources();
      } catch (err) {
        console.error("Failed to update video source:", err);
      }
    },
    [currentPodcastId, episodeId, invalidateSources]
  );

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      if (!currentPodcastId || !episodeId) return;
      try {
        await deleteVideoSourceApi(currentPodcastId, episodeId, sourceId);
        // Clear defaults if the deleted source was selected
        if (defaultSourceId === sourceId) setDefaultSourceId("");
        if (primaryAudioSourceId === sourceId) setPrimaryAudioSourceId("");
        invalidateSources();
      } catch (err) {
        console.error("Failed to delete video source:", err);
      }
    },
    [currentPodcastId, episodeId, defaultSourceId, primaryAudioSourceId, invalidateSources]
  );

  const handleFinish = useCallback(async () => {
    if (!currentPodcastId || !episodeId) return;

    setIsSaving(true);
    try {
      await updateVideoConfigApi(currentPodcastId, episodeId, {
        defaultVideoSourceId: defaultSourceId || undefined,
        primaryAudioSourceId: primaryAudioSourceId || undefined,
      });
      invalidateSources();
      onImportComplete?.();
    } catch (err) {
      console.error("Failed to save video config:", err);
    } finally {
      setIsSaving(false);
    }
  }, [
    currentPodcastId,
    episodeId,
    defaultSourceId,
    primaryAudioSourceId,
    onImportComplete,
    invalidateSources,
  ]);

  // Compute validation warnings for video sources
  const sourceWarnings = useMemo(() => {
    const warnings = new Map<string, string[]>();

    const fpsValues = videoSources.filter((s) => s.fps != null).map((s) => s.fps!);
    const hasMixedFps = fpsValues.length > 1 && Math.max(...fpsValues) - Math.min(...fpsValues) > 1;

    for (const source of videoSources) {
      const w: string[] = [];

      if (source.sourceType !== "broll" && source.durationSeconds != null && !source.audioBlobUrl) {
        w.push("No audio track detected — transcription won't include this source");
      }

      if (hasMixedFps && source.fps != null) {
        w.push(
          `Frame rate ${source.fps} fps — sources have mixed frame rates (proxy normalizes to 30 fps)`
        );
      }

      if (w.length > 0) warnings.set(source.id, w);
    }

    return warnings;
  }, [videoSources]);

  // Loading state
  if (isLoadingSources && videoSources.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-[hsl(var(--text-muted))]">Loading media sources...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Empty state — full drag-drop zone when no sources and not uploading */}
      {videoSources.length === 0 && !isUploading && files.length === 0 && (
        <Card
          className={cn(
            "border-2 border-dashed transition-colors",
            isDragging && "border-[hsl(var(--cyan))] bg-[hsl(var(--cyan)/0.05)]"
          )}
        >
          <CardContent className="py-12">
            <div
              className="flex flex-col items-center gap-4"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--surface-2))]">
                <VideoIcon className="h-8 w-8 text-[hsl(var(--text-muted))]" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-[hsl(var(--text))]">Drop video files here</p>
                <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                  MP4, MOV, MKV, WebM, AVI — or standalone audio files
                </p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} className="mt-2">
                <UploadIcon className="mr-2 h-4 w-4" />
                Choose Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={`${ACCEPTED_VIDEO},${ACCEPTED_AUDIO}`}
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload progress — shown when uploading or files have results */}
      {(isUploading || files.length > 0) && (
        <Card>
          <CardContent className="py-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-[hsl(var(--text))]">
                Uploading {totalCount} file{totalCount !== 1 ? "s" : ""}
              </h3>
              <div className="flex items-center gap-2">
                {isUploading && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addMoreInputRef.current?.click()}
                    >
                      <UploadIcon className="mr-1.5 h-3.5 w-3.5" />
                      Add More
                    </Button>
                    <input
                      ref={addMoreInputRef}
                      type="file"
                      accept={`${ACCEPTED_VIDEO},${ACCEPTED_AUDIO}`}
                      multiple
                      className="hidden"
                      onChange={addMoreFiles}
                    />
                    <Button variant="ghost" size="sm" onClick={cancel}>
                      <Cross2Icon className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {!isUploading && files.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={reset}>
                    <Cross2Icon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[hsl(var(--text))]">{f.file.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={f.progress} className="flex-1" />
                      <span className="w-16 text-right text-xs text-[hsl(var(--text-muted))]">
                        {f.status === "complete" ? (
                          <CheckIcon className="inline h-3.5 w-3.5 text-[hsl(var(--success))]" />
                        ) : f.status === "error" ? (
                          <span className="text-[hsl(var(--error))]">Error</span>
                        ) : (
                          `${f.progress}%`
                        )}
                      </span>
                    </div>
                    {f.error && <p className="mt-1 text-xs text-[hsl(var(--error))]">{f.error}</p>}
                  </div>
                  <span className="text-xs text-[hsl(var(--text-muted))]">
                    {formatBytes(f.file.size)}
                  </span>
                </div>
              ))}
            </div>
            {!isUploading && completedCount === 0 && files.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-[hsl(var(--error))]">
                  All uploads failed. Check the console for details.
                </p>
                <Button variant="ghost" onClick={reset}>
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Source cards — always shown when sources exist */}
      {videoSources.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-[hsl(var(--text))]">
              Video Sources ({videoSources.length})
            </h3>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <UploadIcon className="mr-1.5 h-3.5 w-3.5" />
              Add Files
            </Button>
            {/* Reuse fileInputRef for adding files when sources exist */}
            {!files.length && (
              <input
                ref={fileInputRef}
                type="file"
                accept={`${ACCEPTED_VIDEO},${ACCEPTED_AUDIO}`}
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
            )}
          </div>

          <div className="space-y-3">
            {videoSources.map((source) => (
              <Card key={source.id}>
                <CardContent className="py-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Label */}
                    <Input
                      label="Label"
                      value={source.label}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleSourceUpdate(source.id, "label", e.target.value)
                      }
                      placeholder="e.g., Bob, Wide Shot"
                    />

                    {/* Person */}
                    <Select
                      label="Person"
                      value={source.personId || ""}
                      onChange={(val) => handleSourceUpdate(source.id, "personId", val || "")}
                      options={[
                        { value: "", label: "None (wide/B-roll)" },
                        ...people.map((p) => ({
                          value: p.id,
                          label: `${p.name} (${p.role})`,
                        })),
                      ]}
                      hint="Who is on this camera's mic?"
                    />

                    {/* Source Type */}
                    <Select
                      label="Source Type"
                      value={source.sourceType}
                      onChange={(val) => handleSourceUpdate(source.id, "sourceType", val)}
                      options={[
                        { value: "speaker", label: "Speaker (dedicated mic)" },
                        { value: "wide", label: "Wide Shot (room mic)" },
                        { value: "broll", label: "B-Roll (visual only)" },
                      ]}
                    />

                    {/* File info + delete */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col justify-center">
                        <p className="text-xs text-[hsl(var(--text-muted))]">{source.fileName}</p>
                        {source.durationSeconds && (
                          <p className="text-xs text-[hsl(var(--text-muted))]">
                            {Math.round(source.durationSeconds)}s
                            {source.width && source.height
                              ? ` / ${source.width}x${source.height}`
                              : ""}
                            {source.proxyBlobUrl ? " / Proxy ready" : " / Processing..."}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[hsl(var(--text-muted))] hover:text-[hsl(var(--error))]"
                        onClick={() => handleDeleteSource(source.id)}
                      >
                        <Cross2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Validation warnings */}
                  {sourceWarnings.has(source.id) && (
                    <div className="mt-3 space-y-1 border-t border-[hsl(var(--border-subtle))] pt-3">
                      {sourceWarnings.get(source.id)!.map((warning, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-xs text-[hsl(var(--warning))]"
                        >
                          <ExclamationTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Configuration — shown when sources exist */}
      {videoSources.length > 0 && (
        <>
          <Card>
            <CardContent className="space-y-4 py-4">
              {/* Default view */}
              <Select
                label="Default View"
                value={defaultSourceId}
                onChange={setDefaultSourceId}
                options={[
                  { value: "", label: "Auto (hold previous speaker)" },
                  ...videoSources.map((s) => ({
                    value: s.id,
                    label: s.label,
                  })),
                ]}
                hint="Which camera to show during speech gaps"
              />

              {/* Audio source */}
              <Select
                label="Audio Source"
                value={primaryAudioSourceId}
                onChange={setPrimaryAudioSourceId}
                options={[
                  { value: "", label: "Auto-mix (combine all speakers)" },
                  ...videoSources
                    .filter((s) => s.sourceType !== "broll")
                    .map((s) => ({
                      value: s.id,
                      label: `${s.label} audio`,
                    })),
                ]}
                hint="Which audio track to use for playback and rendering"
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleFinish} disabled={isSaving}>
              {isSaving ? "Saving..." : "Continue to Transcript"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
