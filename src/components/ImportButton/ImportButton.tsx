import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  UploadIcon,
  Cross2Icon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import * as musicMetadata from "music-metadata-browser";
import { Button, Card, CardContent } from "../ui";
import { Progress } from "../ui/Progress";
import { useProjectStore, setAudioBlob, clearAudioBlob } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useEpisodes } from "../../hooks/useEpisodes";
import { useChunkedUpload } from "../../hooks/useChunkedUpload";
import { useAuthStore } from "../../stores/authStore";
import { formatDuration } from "../../lib/formats";
import { cn, generateFileFingerprint } from "../../lib/utils";
import WaveSurfer from "wavesurfer.js";

// Google Drive Picker configuration
const GOOGLE_CLIENT_ID = "";
const GOOGLE_API_KEY = "";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.readonly";

// Threshold for switching to chunked upload (100MB)
const CHUNKED_UPLOAD_THRESHOLD = 100 * 1024 * 1024;

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Format ETA in seconds to human readable
function formatETA(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "calculating...";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

interface ImportButtonProps {
  /** Whether to show a compact version (just the button) or expanded version (with audio preview) */
  variant?: "compact" | "expanded";
  /** Optional callback when import completes */
  onImportComplete?: () => void;
  /** Optional class name for the root element */
  className?: string;
}

export const ImportButton: React.FC<ImportButtonProps> = ({
  variant = "expanded",
  onImportComplete,
  className,
}) => {
  const { currentProject, updateProject, getTranscriptsForFingerprint } = useProjectStore();
  const { settings } = useSettingsStore();
  const { uploadAudio, updateEpisode } = useEpisodes();
  const { currentPodcastId } = useAuthStore();
  const {
    upload: chunkedUpload,
    cancel: cancelChunkedUpload,
    progress: chunkedProgress,
    isUploading: isChunkedUploading,
  } = useChunkedUpload(currentPodcastId, currentProject?.id ?? null);

  const [existingTranscriptsCount, setExistingTranscriptsCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [googlePickerLoaded, setGooglePickerLoaded] = useState(false);
  const [showDropZone, setShowDropZone] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAudio = !!currentProject?.audioPath;

  // Load Google Picker API
  useEffect(() => {
    const loadGoogleApis = async () => {
      if (typeof window !== "undefined" && !window.gapi) {
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        script.onload = () => {
          window.gapi.load("picker", () => {
            setGooglePickerLoaded(true);
          });
        };
        document.body.appendChild(script);
      } else if (window.gapi) {
        window.gapi.load("picker", () => {
          setGooglePickerLoaded(true);
        });
      }
    };
    loadGoogleApis();
  }, []);

  // Initialize WaveSurfer when audio is present and variant is expanded
  useEffect(() => {
    if (variant !== "expanded") return;
    if (waveformRef.current && hasAudio && currentProject?.audioPath) {
      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "hsl(185 60% 35%)",
        progressColor: "hsl(185 100% 50%)",
        cursorColor: "hsl(185 100% 50% / 0.5)",
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        height: 48,
        normalize: true,
        backend: "MediaElement",
      });

      wavesurferRef.current.on("ready", () => {
        const duration = wavesurferRef.current?.getDuration() || 0;
        if (duration && duration !== currentProject.audioDuration) {
          updateProject({ audioDuration: duration });
          // Also update backend if we have a valid duration
          if (currentProject?.id && duration > 0) {
            updateEpisode(currentProject.id, { audioDuration: duration }).catch((err) => {
              console.warn("Failed to update audio duration in backend:", err);
            });
          }
        }
      });

      wavesurferRef.current.on("audioprocess", () => {
        setCurrentTime(wavesurferRef.current?.getCurrentTime() || 0);
      });

      wavesurferRef.current.on("play", () => setIsPlaying(true));
      wavesurferRef.current.on("pause", () => setIsPlaying(false));
      wavesurferRef.current.on("finish", () => setIsPlaying(false));

      wavesurferRef.current.on("error", (err) => {
        if (err?.name === "AbortError" || err?.message?.includes("abort")) {
          return;
        }
        console.warn("WaveSurfer error:", err);
      });

      wavesurferRef.current.load(currentProject.audioPath).catch((err) => {
        if (err?.name === "AbortError" || err?.message?.includes("abort")) {
          return;
        }
        console.warn("WaveSurfer load failed:", err);
      });

      return () => {
        try {
          wavesurferRef.current?.destroy();
        } catch {
          // Ignore cleanup errors
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateProject/updateEpisode/audioDuration used in WaveSurfer callback only; adding would re-create WaveSurfer on every update
  }, [variant, hasAudio, currentProject?.audioPath]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(
      (file) =>
        file.type.startsWith("audio/") || /\.(mp3|wav|m4a|flac|ogg|aac|aif|aiff)$/i.test(file.name)
    );

    if (!audioFile) {
      setError("Please drop an audio file (MP3, WAV, M4A, FLAC, OGG, AIF)");
      return;
    }

    await processAudioFile(audioFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processAudioFile is stable (uses refs and state setters only); adding it would re-create handler every render
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (file) {
      await processAudioFile(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processAudioFile is stable; adding it would re-create handler every render
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Google Drive picker
  const openGoogleDrivePicker = useCallback(async () => {
    const clientId = settings.googleClientId || GOOGLE_CLIENT_ID;
    const apiKey = settings.googleApiKey || GOOGLE_API_KEY;

    if (!clientId || !apiKey) {
      setError("Google Drive integration requires API credentials. Add them in Settings.");
      return;
    }

    if (!googlePickerLoaded || !window.gapi) {
      setError("Google Picker is still loading. Please try again.");
      return;
    }

    try {
      const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPES,
        callback: async (response: { access_token?: string }) => {
          if (response.access_token) {
            createPicker(response.access_token, apiKey);
          }
        },
      });

      if (tokenClient) {
        tokenClient.requestAccessToken();
      } else {
        window.gapi.auth2
          ?.getAuthInstance()
          ?.signIn()
          .then(() => {
            const token = window.gapi.auth2
              ?.getAuthInstance()
              ?.currentUser?.get()
              ?.getAuthResponse()?.access_token;
            if (token) {
              createPicker(token, apiKey);
            }
          });
      }
    } catch (err) {
      console.error("Google Drive auth error:", err);
      setError("Failed to connect to Google Drive. Check your API credentials.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createPicker is stable (uses window.google APIs and state setters only)
  }, [googlePickerLoaded, settings]);

  const createPicker = (accessToken: string, apiKey: string) => {
    if (!window.google?.picker) {
      setError("Google Picker not loaded. Please refresh and try again.");
      return;
    }

    const picker = new window.google.picker.PickerBuilder()
      .addView(
        new window.google.picker.DocsView()
          .setIncludeFolders(true)
          .setMimeTypes("audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/flac,audio/ogg")
      )
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback(handleGoogleDriveSelection)
      .setTitle("Select Audio File from Google Drive")
      .build();
    picker.setVisible(true);
  };

  const handleGoogleDriveSelection = async (data: GooglePickerCallbackData) => {
    if (data.action === "picked" && data.docs?.[0]) {
      const file = data.docs[0];
      setIsLoading(true);
      setLoadingMessage("Downloading from Google Drive...");
      setLoadingProgress(10);
      setError(null);

      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${window.gapi.auth2?.getAuthInstance()?.currentUser?.get()?.getAuthResponse()?.access_token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to download file from Google Drive");
        }

        setLoadingProgress(50);
        const blob = await response.blob();
        const audioFile = new File([blob], file.name, { type: file.mimeType });
        await processAudioFile(audioFile);
      } catch (err) {
        console.error("Google Drive download error:", err);
        setError("Failed to download file from Google Drive");
      } finally {
        setIsLoading(false);
        setLoadingMessage("");
      }
    }
  };

  const processAudioFile = async (file: File) => {
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage("Processing audio...");
    setError(null);
    setExistingTranscriptsCount(0);

    try {
      setLoadingMessage("Generating file fingerprint...");
      setLoadingProgress(10);

      const fingerprint = await generateFileFingerprint(file);
      const existingTranscripts = getTranscriptsForFingerprint(fingerprint);
      setExistingTranscriptsCount(existingTranscripts.length);

      setLoadingProgress(20);
      setLoadingMessage("Processing audio...");

      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const blobUrl = URL.createObjectURL(file);

      if (currentProject?.id) {
        await setAudioBlob(currentProject.id, file);
      }

      // Get duration using HTML5 Audio element
      const getDurationFromHtml5Audio = (): Promise<number> => {
        return new Promise((resolve) => {
          const audio = new Audio();
          audio.preload = "metadata";

          audio.onloadedmetadata = () => {
            if (audio.duration && isFinite(audio.duration)) {
              resolve(audio.duration);
            } else {
              resolve(0);
            }
          };

          audio.onerror = () => {
            resolve(0);
          };

          setTimeout(() => resolve(0), 3000);

          audio.src = blobUrl;
        });
      };

      // Get duration using Web Audio API
      const getDurationFromWebAudio = async (): Promise<number> => {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const audioContext = new AudioContext();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          await audioContext.close();
          return audioBuffer.duration;
        } catch (err) {
          console.warn("Web Audio API could not decode file:", err);
          return 0;
        }
      };

      // Get duration using music-metadata-browser
      const getDurationFromMetadata = async (): Promise<number> => {
        try {
          const timeoutPromise = new Promise<number>((_, reject) =>
            setTimeout(() => reject(new Error("Metadata parse timeout")), 10000)
          );
          const metadataPromise = musicMetadata.parseBlob(file).then((m) => m.format.duration || 0);
          return await Promise.race([metadataPromise, timeoutPromise]);
        } catch (err) {
          console.warn("music-metadata-browser could not parse file:", err);
          return 0;
        }
      };

      let audioDuration = await getDurationFromHtml5Audio();
      if (audioDuration === 0) {
        audioDuration = await getDurationFromWebAudio();
      }
      if (audioDuration === 0) {
        audioDuration = await getDurationFromMetadata();
      }

      const isNewFile = currentProject?.audioFingerprint !== fingerprint;

      const updates: Partial<typeof currentProject> = {
        audioPath: blobUrl,
        audioFileName: file.name,
        audioFingerprint: fingerprint,
        audioDuration: audioDuration,
        name: currentProject?.name || file.name.replace(/\.[^/.]+$/, ""),
      };

      if (existingTranscripts.length > 0 && isNewFile) {
        updates.transcripts = existingTranscripts;
        updates.activeTranscriptId = existingTranscripts[existingTranscripts.length - 1].id;
        updates.transcript = existingTranscripts[existingTranscripts.length - 1];
      } else if (isNewFile) {
        updates.transcripts = [];
        updates.activeTranscriptId = undefined;
        updates.transcript = undefined;
      }

      updateProject(updates);

      // Upload audio to backend
      if (currentProject?.id) {
        setIsUploading(true);

        if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
          chunkedUpload(file)
            .then((result) => {
              if (result?.url) {
                // Get current duration from project store (WaveSurfer may have updated it)
                const currentDuration =
                  useProjectStore.getState().currentProject?.audioDuration || 0;
                updateProject({
                  audioPath: result.url,
                  // Use WaveSurfer's duration if it's better than what we initially calculated
                  audioDuration: currentDuration > 0 ? currentDuration : audioDuration,
                });
              }
            })
            .catch((err) => {
              console.error("[ImportButton] Chunked upload failed:", err);
            })
            .finally(() => {
              setIsUploading(false);
            });
        } else {
          uploadAudio(currentProject.id, file, audioDuration)
            .then((updatedEpisode) => {
              if (updatedEpisode?.audioBlobUrl) {
                // Get current duration from project store (WaveSurfer may have updated it)
                const currentDuration =
                  useProjectStore.getState().currentProject?.audioDuration || 0;
                updateProject({
                  audioPath: updatedEpisode.audioBlobUrl,
                  // Use best available duration: WaveSurfer's > backend's > initial
                  audioDuration:
                    currentDuration > 0
                      ? currentDuration
                      : updatedEpisode.audioDuration || audioDuration,
                });
              }
            })
            .catch((err) => {
              console.error("[ImportButton] Backend upload failed:", err);
            })
            .finally(() => {
              setIsUploading(false);
            });
        }
      }

      // Initialize waveform for expanded variant
      if (variant === "expanded" && waveformRef.current) {
        try {
          if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
          }

          wavesurferRef.current = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: "hsl(185 60% 35%)",
            progressColor: "hsl(185 100% 50%)",
            cursorColor: "hsl(185 100% 50% / 0.5)",
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            height: 48,
            normalize: true,
            backend: "MediaElement",
          });

          wavesurferRef.current.on("ready", () => {
            const duration = wavesurferRef.current?.getDuration() || 0;
            if (duration > 0) {
              updateProject({ audioDuration: duration });
              // Also update backend if duration wasn't detected initially
              if (currentProject?.id && audioDuration === 0) {
                updateEpisode(currentProject.id, { audioDuration: duration }).catch((err) => {
                  console.warn("Failed to update audio duration in backend:", err);
                });
              }
            }
          });

          wavesurferRef.current.on("audioprocess", () => {
            setCurrentTime(wavesurferRef.current?.getCurrentTime() || 0);
          });

          wavesurferRef.current.on("play", () => setIsPlaying(true));
          wavesurferRef.current.on("pause", () => setIsPlaying(false));

          await wavesurferRef.current.load(blobUrl);
        } catch (wsError: unknown) {
          const err = wsError instanceof Error ? wsError : null;
          if (err?.name !== "AbortError" && !err?.message?.includes("abort")) {
            console.warn("WaveSurfer failed to load audio:", wsError);
          }
        }
      }

      clearInterval(progressInterval);
      setLoadingProgress(100);
      setShowDropZone(false);

      if (audioDuration === 0) {
        setError("Could not detect audio duration. The file may still work for transcription.");
      }

      onImportComplete?.();
    } catch (err) {
      setError("Failed to process audio file");
      console.error(err);
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const togglePlayback = () => {
    wavesurferRef.current?.playPause();
  };

  const handleClearAudio = async () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
    if (currentProject?.id) {
      await clearAudioBlob(currentProject.id);
    }
    updateProject({ audioPath: "", audioDuration: 0 });
    setCurrentTime(0);
  };

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac,.aif,.aiff"
      onChange={handleFileSelect}
      className="hidden"
    />
  );

  // Compact variant - just a button that opens file picker
  if (variant === "compact") {
    return (
      <div className={className}>
        {fileInput}
        {hasAudio ? (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                "bg-[hsl(158_50%_15%/0.5)]"
              )}
            >
              <CheckIcon className="h-4 w-4 text-[hsl(var(--success))]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[hsl(var(--text))]">
                {currentProject?.audioFileName || "Audio imported"}
              </p>
              <p className="text-xs text-[hsl(var(--text-muted))]">
                {formatDuration(currentProject?.audioDuration || 0)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearAudio}>
              <Cross2Icon className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button onClick={openFilePicker} variant="secondary" size="md">
            <UploadIcon className="mr-2 h-4 w-4" />
            Import Audio
          </Button>
        )}
      </div>
    );
  }

  // Expanded variant - full card with drop zone and preview
  return (
    <div className={className}>
      {fileInput}

      {!hasAudio && !showDropZone && (
        <Card variant="default" className="animate-fadeInUp">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(var(--surface))]",
                    "border border-[hsl(var(--glass-border))]"
                  )}
                >
                  <UploadIcon className="h-5 w-5 text-[hsl(var(--text-ghost))]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--text))]">Import Audio</p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    MP3, WAV, M4A, FLAC, OGG, AIF
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowDropZone(true)} variant="secondary" size="md">
                  <FileIcon className="mr-2 h-4 w-4" />
                  Browse
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasAudio && showDropZone && (
        <div className="animate-blurIn">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative rounded-xl px-6 py-8 text-center transition-all duration-150",
              "border-2 border-dashed",
              "bg-[hsl(var(--surface)/0.4)]",
              isDragging
                ? cn("border-[hsl(185_100%_50%)]", "bg-[hsl(185_50%_10%/0.3)]")
                : cn(
                    "border-[hsl(var(--glass-border))]",
                    "hover:border-[hsl(0_0%_100%/0.12)]",
                    "hover:bg-[hsl(var(--surface)/0.6)]"
                  )
            )}
          >
            <div
              className={cn(
                "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-150",
                isDragging
                  ? "scale-105 bg-[hsl(185_100%_50%)]"
                  : "border border-[hsl(var(--glass-border))] bg-[hsl(var(--raised))]"
              )}
            >
              <UploadIcon
                className={cn(
                  "h-5 w-5",
                  isDragging ? "text-[hsl(260_30%_6%)]" : "text-[hsl(var(--text-ghost))]"
                )}
              />
            </div>

            <p className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[hsl(var(--text))]">
              {isDragging ? "Drop it here" : "Drop your audio file here"}
            </p>
            <p className="mb-4 text-sm text-[hsl(var(--text-subtle))]">
              or use the buttons below to import
            </p>

            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Button onClick={openFilePicker} variant="primary" size="md">
                <FileIcon className="mr-2 h-4 w-4" />
                Browse Files
              </Button>
              <Button onClick={openGoogleDrivePicker} variant="secondary" size="md">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.433 22.396l4.83-8.387H22l-4.833 8.387H4.433zm7.192-9.471L6.79 4.167h6.795l4.833 8.758h-6.793zm6.795-8.758L22 4.167l-4.833 8.387-3.58-6.387 4.833-2z" />
                </svg>
                Google Drive
              </Button>
              <Button onClick={() => setShowDropZone(false)} variant="ghost" size="md">
                Cancel
              </Button>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <Card variant="default" className="animate-fadeInUp mt-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      "bg-[hsl(185_50%_15%/0.5)]"
                    )}
                  >
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--cyan))] border-t-transparent" />
                  </div>
                  <div className="flex-1">
                    <p className="mb-2 text-sm font-medium text-[hsl(var(--text))]">
                      {loadingMessage || "Processing audio..."}
                    </p>
                    <Progress value={loadingProgress} variant="cyan" size="sm" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {error && (
            <div
              className={cn(
                "animate-fadeInUp mt-4 rounded-xl p-4 text-center",
                "bg-[hsl(0_50%_15%/0.4)]",
                "border border-[hsl(var(--error)/0.2)]"
              )}
            >
              <p className="text-sm font-medium text-[hsl(var(--error))]">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Audio Preview */}
      {hasAudio && (
        <Card variant="default" className="animate-scaleIn">
          <CardContent className="p-4">
            {/* Success Header */}
            <div className="mb-4 flex items-center gap-3 border-b border-[hsl(var(--glass-border))] pb-4">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  "bg-[hsl(158_50%_15%/0.5)]"
                )}
              >
                <CheckIcon className="h-4 w-4 text-[hsl(var(--success))]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[hsl(var(--text))]">
                  {currentProject?.audioFileName || "Audio loaded"}
                </p>
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  {isUploading && !isChunkedUploading ? (
                    <span className="text-[hsl(var(--cyan))]">Syncing to cloud...</span>
                  ) : (
                    formatDuration(currentProject?.audioDuration || 0)
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAudio}
                className="text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
              >
                <Cross2Icon className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Chunked Upload Progress */}
            {isChunkedUploading && chunkedProgress && (
              <div
                className={cn(
                  "mb-4 rounded-lg p-3",
                  "bg-[hsl(185_50%_10%/0.3)]",
                  "border border-[hsl(var(--cyan)/0.2)]"
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UploadIcon className="h-3.5 w-3.5 animate-pulse text-[hsl(var(--cyan))]" />
                    <p className="text-xs font-medium text-[hsl(var(--text))]">
                      {chunkedProgress.status === "uploading" &&
                        `Uploading... ${chunkedProgress.percentage}%`}
                      {chunkedProgress.status === "completing" && "Finalizing..."}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelChunkedUpload}
                    className="h-6 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
                <Progress value={chunkedProgress.percentage} variant="cyan" size="sm" />
                <div className="mt-1 flex justify-between text-[10px] text-[hsl(var(--text-ghost))]">
                  <span>
                    {formatBytes(chunkedProgress.uploadedBytes)} /{" "}
                    {formatBytes(chunkedProgress.totalBytes)}
                  </span>
                  {chunkedProgress.eta > 0 && <span>{formatETA(chunkedProgress.eta)}</span>}
                </div>
              </div>
            )}

            {/* Existing transcripts notice */}
            {existingTranscriptsCount > 0 && (
              <div
                className={cn(
                  "mb-4 flex items-center gap-2 rounded-lg p-2",
                  "bg-[hsl(185_50%_15%/0.3)]",
                  "border border-[hsl(var(--cyan)/0.2)]"
                )}
              >
                <span className="text-sm">📝</span>
                <p className="text-xs text-[hsl(var(--cyan))]">
                  Found {existingTranscriptsCount} existing transcript
                  {existingTranscriptsCount > 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Waveform */}
            <div
              className={cn(
                "mb-3 rounded-lg p-2",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--glass-border))]"
              )}
            >
              <div ref={waveformRef} className="cursor-pointer" />
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlayback}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))]",
                    "hover:bg-[hsl(var(--cyan)/0.85)]",
                    "transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cyan))]"
                  )}
                >
                  {isPlaying ? (
                    <PauseIcon className="h-4 w-4" />
                  ) : (
                    <PlayIcon className="ml-0.5 h-4 w-4" />
                  )}
                </button>
                <div>
                  <p className="font-mono text-sm font-medium text-[hsl(var(--text))] tabular-nums">
                    {formatDuration(currentTime)}
                  </p>
                  <p className="text-[10px] text-[hsl(var(--text-subtle))]">
                    of {formatDuration(currentProject?.audioDuration || 0)}
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "rounded-lg px-2 py-1",
                  "bg-[hsl(var(--surface))]",
                  "border border-[hsl(var(--glass-border))]"
                )}
              >
                <span className="font-mono text-xs text-[hsl(var(--text-muted))] tabular-nums">
                  {formatDuration(currentProject?.audioDuration || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImportButton;
