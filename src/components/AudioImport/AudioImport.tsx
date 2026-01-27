import React, { useState, useCallback, useRef, useEffect } from "react";
import { UploadIcon, Cross2Icon, PlayIcon, PauseIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from "../ui";
import { useProjectStore } from "../../stores/projectStore";
import { formatDuration } from "../../lib/formats";
import WaveSurfer from "wavesurfer.js";

interface AudioImportProps {
  onComplete: () => void;
}

export const AudioImport: React.FC<AudioImportProps> = ({ onComplete }) => {
  const { currentProject, updateProject } = useProjectStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const hasAudio = !!currentProject?.audioPath;

  // Initialize WaveSurfer
  useEffect(() => {
    if (waveformRef.current && hasAudio && currentProject?.audioPath) {
      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "hsl(262, 83%, 58%)",
        progressColor: "hsl(262, 83%, 40%)",
        cursorColor: "hsl(0, 0%, 95%)",
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 100,
        normalize: true,
      });

      // In Tauri, we need to use the asset protocol for local files
      // For now, we'll use a blob URL approach
      wavesurferRef.current.on("ready", () => {
        const duration = wavesurferRef.current?.getDuration() || 0;
        if (duration && duration !== currentProject.audioDuration) {
          updateProject({ audioDuration: duration });
        }
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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setError(null);

      const files = Array.from(e.dataTransfer.files);
      const audioFile = files.find((file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(file.name)
      );

      if (!audioFile) {
        setError("Please drop an audio file (MP3, WAV, M4A, FLAC, OGG)");
        return;
      }

      await processAudioFile(audioFile);
    },
    []
  );

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

  const processAudioFile = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      // For now, we'll store the file path (in a real Tauri app, we'd use the file system API)
      // Create a blob URL for preview
      const blobUrl = URL.createObjectURL(file);
      
      updateProject({
        audioPath: blobUrl,
        name: currentProject?.name || file.name.replace(/\.[^/.]+$/, ""),
      });

      // Load into WaveSurfer
      if (wavesurferRef.current) {
        await wavesurferRef.current.load(blobUrl);
      } else if (waveformRef.current) {
        // Create new instance if not exists
        wavesurferRef.current = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: "hsl(262, 83%, 58%)",
          progressColor: "hsl(262, 83%, 40%)",
          cursorColor: "hsl(0, 0%, 95%)",
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: 100,
          normalize: true,
        });

        wavesurferRef.current.on("ready", () => {
          const duration = wavesurferRef.current?.getDuration() || 0;
          updateProject({ audioDuration: duration });
        });

        wavesurferRef.current.on("play", () => setIsPlaying(true));
        wavesurferRef.current.on("pause", () => setIsPlaying(false));

        await wavesurferRef.current.load(blobUrl);
      }
    } catch (err) {
      setError("Failed to process audio file");
      console.error(err);
    } finally {
      setIsLoading(false);
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
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Import Audio
        </h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Upload your podcast episode audio file
        </p>
      </div>

      {/* Drop Zone */}
      <Card className="mb-6">
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${isDragging
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
              }
            `}
          >
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <UploadIcon className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--muted-foreground))]" />
            <p className="text-lg font-medium text-[hsl(var(--foreground))] mb-2">
              {isDragging ? "Drop your audio file here" : "Drag & drop audio file"}
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              or click to browse • MP3, WAV, M4A, FLAC, OGG
            </p>
          </div>

          {isLoading && (
            <div className="mt-4">
              <Progress value={50} className="mb-2" />
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
                Processing audio...
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-[hsl(var(--destructive))] text-center">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Audio Preview */}
      {hasAudio && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Audio Preview</CardTitle>
              <Button variant="ghost" size="sm" onClick={clearAudio}>
                <Cross2Icon className="w-4 h-4 mr-1" />
                Remove
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Waveform */}
            <div ref={waveformRef} className="mb-4" />

            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={togglePlayback}>
                {isPlaying ? (
                  <>
                    <PauseIcon className="w-4 h-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-4 h-4 mr-2" />
                    Play
                  </>
                )}
              </Button>
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                Duration: {formatDuration(currentProject?.audioDuration || 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button onClick={onComplete} disabled={!hasAudio}>
          Continue to Transcription
        </Button>
      </div>
    </div>
  );
};
