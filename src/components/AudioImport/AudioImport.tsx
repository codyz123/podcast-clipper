import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  UploadIcon,
  Cross2Icon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent } from "../ui";
import { Progress } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatDuration } from "../../lib/formats";
import { cn } from "../../lib/utils";
import WaveSurfer from "wavesurfer.js";

// Google Drive Picker configuration
const GOOGLE_CLIENT_ID = ""; // User will set this in settings
const GOOGLE_API_KEY = ""; // User will set this in settings
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.readonly";

interface AudioImportProps {
  onComplete: () => void;
}

export const AudioImport: React.FC<AudioImportProps> = ({ onComplete }) => {
  const { currentProject, updateProject } = useProjectStore();
  const { settings } = useSettingsStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [googlePickerLoaded, setGooglePickerLoaded] = useState(false);

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

  // Initialize WaveSurfer
  useEffect(() => {
    if (waveformRef.current && hasAudio && currentProject?.audioPath) {
      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "hsl(185 60% 35%)",
        progressColor: "hsl(185 100% 50%)",
        cursorColor: "hsl(185 100% 50% / 0.5)",
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        height: 72,
        normalize: true,
      });

      wavesurferRef.current.on("ready", () => {
        const duration = wavesurferRef.current?.getDuration() || 0;
        if (duration && duration !== currentProject.audioDuration) {
          updateProject({ audioDuration: duration });
        }
      });

      wavesurferRef.current.on("audioprocess", () => {
        setCurrentTime(wavesurferRef.current?.getCurrentTime() || 0);
      });

      wavesurferRef.current.on("play", () => setIsPlaying(true));
      wavesurferRef.current.on("pause", () => setIsPlaying(false));
      wavesurferRef.current.on("finish", () => setIsPlaying(false));

      return () => {
        wavesurferRef.current?.destroy();
      };
    }
  }, [hasAudio, currentProject?.audioPath]);

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
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(file.name)
    );

    if (!audioFile) {
      setError("Please drop an audio file (MP3, WAV, M4A, FLAC, OGG)");
      return;
    }

    await processAudioFile(audioFile);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0];
      if (file) {
        await processAudioFile(file);
      }
    },
    []
  );

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Google Drive picker
  const openGoogleDrivePicker = useCallback(async () => {
    const clientId = (settings as any).googleClientId || GOOGLE_CLIENT_ID;
    const apiKey = (settings as any).googleApiKey || GOOGLE_API_KEY;

    if (!clientId || !apiKey) {
      setError("Google Drive integration requires API credentials. Add them in Settings.");
      return;
    }

    if (!googlePickerLoaded || !window.gapi) {
      setError("Google Picker is still loading. Please try again.");
      return;
    }

    try {
      // Get OAuth token
      const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPES,
        callback: async (response: any) => {
          if (response.access_token) {
            createPicker(response.access_token, apiKey);
          }
        },
      });

      if (tokenClient) {
        tokenClient.requestAccessToken();
      } else {
        // Fallback: use gapi auth
        window.gapi.auth2?.getAuthInstance()?.signIn().then(() => {
          const token = window.gapi.auth2?.getAuthInstance()?.currentUser?.get()?.getAuthResponse()?.access_token;
          if (token) {
            createPicker(token, apiKey);
          }
        });
      }
    } catch (err) {
      console.error("Google Drive auth error:", err);
      setError("Failed to connect to Google Drive. Check your API credentials.");
    }
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

  const handleGoogleDriveSelection = async (data: any) => {
    if (data.action === "picked" && data.docs?.[0]) {
      const file = data.docs[0];
      setIsLoading(true);
      setLoadingMessage("Downloading from Google Drive...");
      setLoadingProgress(10);
      setError(null);

      try {
        // Download the file using Google Drive API
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

    try {
      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const blobUrl = URL.createObjectURL(file);

      updateProject({
        audioPath: blobUrl,
        name: currentProject?.name || file.name.replace(/\.[^/.]+$/, ""),
      });

      if (wavesurferRef.current) {
        await wavesurferRef.current.load(blobUrl);
      } else if (waveformRef.current) {
        wavesurferRef.current = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: "hsl(185 60% 35%)",
          progressColor: "hsl(185 100% 50%)",
          cursorColor: "hsl(185 100% 50% / 0.5)",
          barWidth: 2,
          barGap: 2,
          barRadius: 2,
          height: 72,
          normalize: true,
        });

        wavesurferRef.current.on("ready", () => {
          const duration = wavesurferRef.current?.getDuration() || 0;
          updateProject({ audioDuration: duration });
        });

        wavesurferRef.current.on("audioprocess", () => {
          setCurrentTime(wavesurferRef.current?.getCurrentTime() || 0);
        });

        wavesurferRef.current.on("play", () => setIsPlaying(true));
        wavesurferRef.current.on("pause", () => setIsPlaying(false));

        await wavesurferRef.current.load(blobUrl);
      }

      clearInterval(progressInterval);
      setLoadingProgress(100);
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

  const clearAudio = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
    updateProject({ audioPath: "", audioDuration: 0 });
    setCurrentTime(0);
  };

  return (
    <div className="min-h-full">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4",
            "bg-[hsl(var(--surface))]",
            "border border-[hsl(var(--glass-border))]"
          )}>
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">1</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">
              Step 1 of 5
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--text))] tracking-tight font-[family-name:var(--font-display)]">
            Import Audio
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-sm">
            Upload your podcast episode to get started
          </p>
        </div>

        {/* Hidden file input for file picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Drop Zone */}
        {!hasAudio && (
          <div className="animate-blurIn">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative rounded-xl py-10 px-6 sm:py-14 sm:px-8 text-center transition-all duration-150",
                "border-2 border-dashed",
                "bg-[hsl(var(--surface)/0.4)]",
                isDragging
                  ? cn(
                      "border-[hsl(185_100%_50%)]",
                      "bg-[hsl(185_50%_10%/0.3)]"
                    )
                  : cn(
                      "border-[hsl(var(--glass-border))]",
                      "hover:border-[hsl(0_0%_100%/0.12)]",
                      "hover:bg-[hsl(var(--surface)/0.6)]"
                    )
              )}
            >
              <div
                className={cn(
                  "w-14 h-14 mx-auto mb-5 rounded-xl flex items-center justify-center transition-all duration-150",
                  isDragging
                    ? "bg-[hsl(185_100%_50%)] scale-105"
                    : "bg-[hsl(var(--raised))] border border-[hsl(var(--glass-border))]"
                )}
              >
                <UploadIcon
                  className={cn(
                    "w-6 h-6",
                    isDragging
                      ? "text-[hsl(260_30%_6%)]"
                      : "text-[hsl(var(--text-ghost))]"
                  )}
                />
              </div>

              <p className="text-base font-semibold text-[hsl(var(--text))] mb-1 font-[family-name:var(--font-display)]">
                {isDragging ? "Drop it here" : "Drop your audio file here"}
              </p>
              <p className="text-sm text-[hsl(var(--text-subtle))] mb-5">
                or use the buttons below to import
              </p>

              <div className="flex items-center justify-center gap-2 mb-5">
                {["MP3", "WAV", "M4A", "FLAC", "OGG"].map((format) => (
                  <span
                    key={format}
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded-md",
                      "bg-[hsl(var(--surface))]",
                      "text-[hsl(var(--text-subtle))]",
                      "border border-[hsl(var(--glass-border))]",
                      "font-mono"
                    )}
                  >
                    {format}
                  </span>
                ))}
              </div>

              {/* Import buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={openFilePicker} variant="primary" size="lg">
                  <FileIcon className="w-4 h-4 mr-2" />
                  Browse Files
                </Button>
                <Button onClick={openGoogleDrivePicker} variant="secondary" size="lg">
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.433 22.396l4.83-8.387H22l-4.833 8.387H4.433zm7.192-9.471L6.79 4.167h6.795l4.833 8.758h-6.793zm6.795-8.758L22 4.167l-4.833 8.387-3.58-6.387 4.833-2z" />
                  </svg>
                  Google Drive
                </Button>
              </div>
            </div>

            {/* Loading */}
            {isLoading && (
              <Card variant="default" className="mt-5 animate-fadeInUp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      "bg-[hsl(185_50%_15%/0.5)]"
                    )}>
                      <div className="w-4 h-4 border-2 border-[hsl(var(--cyan))] border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[hsl(var(--text))] mb-2">
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
              <div className={cn(
                "mt-5 p-4 rounded-xl text-center animate-fadeInUp",
                "bg-[hsl(0_50%_15%/0.4)]",
                "border border-[hsl(var(--error)/0.2)]"
              )}>
                <p className="text-sm font-medium text-[hsl(var(--error))]">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Audio Preview */}
        {hasAudio && (
          <Card variant="default" className="animate-scaleIn">
            <CardContent className="p-5">
              {/* Success Header */}
              <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[hsl(var(--glass-border))]">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-[hsl(158_50%_15%/0.5)]"
                )}>
                  <CheckIcon className="w-5 h-5 text-[hsl(var(--success))]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">
                    Audio loaded successfully
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))] mt-0.5">
                    {currentProject?.name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAudio}
                  className="text-[hsl(var(--text-subtle))] hover:text-[hsl(var(--error))] hover:bg-[hsl(var(--error)/0.1)]"
                >
                  <Cross2Icon className="w-3.5 h-3.5 mr-1" />
                  Remove
                </Button>
              </div>

              {/* Waveform */}
              <div className={cn(
                "mb-5 p-3 rounded-lg",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--glass-border))]"
              )}>
                <div ref={waveformRef} className="cursor-pointer" />
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={togglePlayback}
                    className="w-10 h-10 rounded-full p-0"
                  >
                    {isPlaying ? (
                      <PauseIcon className="w-4 h-4" />
                    ) : (
                      <PlayIcon className="w-4 h-4 ml-0.5" />
                    )}
                  </Button>
                  <div>
                    <p className="font-mono text-base font-semibold text-[hsl(var(--text))] tabular-nums">
                      {formatDuration(currentTime)}
                    </p>
                    <p className="text-xs text-[hsl(var(--text-subtle))]">
                      of {formatDuration(currentProject?.audioDuration || 0)}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "px-3 py-1.5 rounded-lg",
                  "bg-[hsl(var(--surface))]",
                  "border border-[hsl(var(--glass-border))]"
                )}>
                  <span className="font-mono text-sm text-[hsl(var(--text-muted))] tabular-nums">
                    {formatDuration(currentProject?.audioDuration || 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Continue Button */}
        <div className="flex justify-end mt-8 sm:mt-10">
          <Button onClick={onComplete} disabled={!hasAudio} glow={hasAudio}>
            Continue to Transcription
          </Button>
        </div>
      </div>
    </div>
  );
};
