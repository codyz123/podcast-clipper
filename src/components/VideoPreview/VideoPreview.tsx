import React, { useState, useRef, useEffect } from "react";
import {
  PlayIcon,
  PauseIcon,
  TrackPreviousIcon,
  TrackNextIcon,
  CheckIcon,
  VideoIcon,
  AspectRatioIcon,
  LayersIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent } from "../ui";
import { Progress } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { VideoFormat, VIDEO_FORMATS } from "../../lib/types";
import { formatDuration } from "../../lib/formats";
import { cn } from "../../lib/utils";
import { resolveFontFamily } from "../../lib/fonts";

interface VideoPreviewProps {
  onComplete: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ onComplete }) => {
  const { currentProject } = useProjectStore();
  const { templates, settings } = useSettingsStore();

  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat>("9:16");
  const [selectedTemplateId, setSelectedTemplateId] = useState(settings.defaultTemplate);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  const clips = currentProject?.clips || [];
  const currentClip = clips[selectedClipIndex];
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const formatConfig = VIDEO_FORMATS[selectedFormat];

  useEffect(() => {
    if (audioRef.current && currentClip && currentProject?.audioPath) {
      audioRef.current.currentTime = currentClip.startTime;
      setCurrentTime(0);
    }
  }, [currentClip, currentProject?.audioPath]);

  const togglePlayback = () => {
    if (!audioRef.current || !currentClip) return;

    if (isPlaying) {
      audioRef.current.pause();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    } else {
      audioRef.current.currentTime = currentClip.startTime + currentTime;
      audioRef.current.play();
      updateProgress();
    }
    setIsPlaying(!isPlaying);
  };

  const updateProgress = () => {
    if (!audioRef.current || !currentClip) return;

    const elapsed = audioRef.current.currentTime - currentClip.startTime;
    const duration = currentClip.endTime - currentClip.startTime;

    if (elapsed >= duration) {
      audioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      audioRef.current.currentTime = currentClip.startTime;
      return;
    }

    setCurrentTime(elapsed);
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  const getCurrentWords = () => {
    if (!currentClip) return [];

    const clipStart = currentClip.startTime;
    const absoluteTime = clipStart + currentTime;
    const wordsPerGroup = selectedTemplate?.subtitle?.wordsPerGroup || 3;

    let currentWordIndex = currentClip.words.findIndex(
      (w) => w.start <= absoluteTime && w.end >= absoluteTime
    );

    if (currentWordIndex === -1) {
      currentWordIndex = currentClip.words.findIndex((w) => w.start > absoluteTime);
      if (currentWordIndex > 0) currentWordIndex--;
    }
    if (currentWordIndex === -1) currentWordIndex = 0;

    const groupStart = Math.floor(currentWordIndex / wordsPerGroup) * wordsPerGroup;
    return currentClip.words.slice(groupStart, groupStart + wordsPerGroup);
  };

  const renderPreview = () => {
    if (!currentClip || !selectedTemplate) return null;

    const words = getCurrentWords();
    const bg = selectedTemplate.background;
    const subtitle = selectedTemplate.subtitle;

    const backgroundStyle: React.CSSProperties = {};

    if (bg.type === "solid") {
      backgroundStyle.backgroundColor = bg.color;
    } else if (bg.type === "gradient") {
      backgroundStyle.background = `linear-gradient(${bg.gradientDirection || 135}deg, ${bg.gradientColors?.join(", ")})`;
    }

    return (
      <div
        className="relative overflow-hidden rounded-lg shadow-lg"
        style={{
          aspectRatio: `${formatConfig.width} / ${formatConfig.height}`,
          maxHeight: "420px",
          ...backgroundStyle,
        }}
      >
        {/* Subtitle */}
        <div
          className={cn(
            "absolute inset-x-0 flex items-center justify-center px-4",
            subtitle.position === "top"
              ? "top-[20%]"
              : subtitle.position === "bottom"
                ? "bottom-[20%]"
                : "top-1/2 -translate-y-1/2"
          )}
        >
          <p
            style={{
              fontFamily: resolveFontFamily(subtitle.fontFamily),
              fontSize: `${subtitle.fontSize * 0.4}px`,
              fontWeight: subtitle.fontWeight,
              color: subtitle.color,
              textShadow: subtitle.shadowColor
                ? `0 2px ${subtitle.shadowBlur || 4}px ${subtitle.shadowColor}`
                : undefined,
              WebkitTextStroke: subtitle.outlineWidth
                ? `${subtitle.outlineWidth}px ${subtitle.outlineColor}`
                : undefined,
              textAlign: "center",
            }}
          >
            {words.map((w) => w.text).join(" ")}
          </p>
        </div>

        {/* Progress overlay */}
        <div className="absolute right-3 bottom-3 left-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white/80 transition-all duration-100"
              style={{
                width: `${(currentTime / (currentClip.endTime - currentClip.startTime)) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
            Preview & Edit
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
            Preview clips with different formats and templates
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Preview Panel */}
          <div className="lg:col-span-2">
            <Card className="animate-fadeIn">
              <CardContent className="p-5">
                {/* Hidden audio */}
                <audio ref={audioRef} src={currentProject?.audioPath} preload="auto" />

                {/* Clip Info */}
                <div className="mb-5 flex items-center justify-between border-b border-[hsl(var(--glass-border))] pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        "bg-[hsl(185_50%_15%/0.5)]"
                      )}
                    >
                      <VideoIcon className="h-5 w-5 text-[hsl(var(--cyan))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--text))]">
                        {currentClip?.name || "Select a clip"}
                      </p>
                      <p className="text-xs text-[hsl(var(--text-muted))]">
                        {formatConfig.name} • {formatConfig.aspectRatio}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      "bg-[hsl(var(--surface))]",
                      "text-[hsl(var(--text-subtle))]"
                    )}
                  >
                    {selectedClipIndex + 1} / {clips.length}
                  </div>
                </div>

                {/* Video Preview */}
                <div
                  className={cn(
                    "mb-5 flex justify-center rounded-lg p-4",
                    "bg-[hsl(var(--surface))]",
                    "border border-[hsl(var(--glass-border))]"
                  )}
                >
                  {renderPreview()}
                </div>

                {/* Playback Controls */}
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedClipIndex(Math.max(0, selectedClipIndex - 1))}
                      disabled={selectedClipIndex === 0}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                        selectedClipIndex === 0
                          ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                          : "text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                      )}
                    >
                      <TrackPreviousIcon className="h-4 w-4" />
                    </button>

                    <Button
                      onClick={togglePlayback}
                      disabled={!currentClip}
                      className="h-12 w-12 rounded-full p-0"
                      glow={!isPlaying && !!currentClip}
                    >
                      {isPlaying ? (
                        <PauseIcon className="h-5 w-5" />
                      ) : (
                        <PlayIcon className="ml-0.5 h-5 w-5" />
                      )}
                    </Button>

                    <button
                      onClick={() =>
                        setSelectedClipIndex(Math.min(clips.length - 1, selectedClipIndex + 1))
                      }
                      disabled={selectedClipIndex === clips.length - 1}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                        selectedClipIndex === clips.length - 1
                          ? "cursor-not-allowed text-[hsl(var(--text-ghost))]"
                          : "text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                      )}
                    >
                      <TrackNextIcon className="h-4 w-4" />
                    </button>
                  </div>

                  {currentClip && (
                    <div className="flex w-full max-w-xs items-center gap-3">
                      <span className="w-10 font-mono text-xs text-[hsl(var(--text-subtle))] tabular-nums">
                        {formatDuration(currentTime)}
                      </span>
                      <div className="flex-1">
                        <Progress
                          value={
                            (currentTime / (currentClip.endTime - currentClip.startTime)) * 100
                          }
                          variant="cyan"
                          size="sm"
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-xs text-[hsl(var(--text-muted))] tabular-nums">
                        {formatDuration(currentClip.endTime - currentClip.startTime)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Settings Panel */}
          <div className="space-y-4">
            {/* Format Selection */}
            <Card variant="default" className="animate-fadeIn">
              <CardContent className="p-4">
                <div className="mb-4 flex items-center gap-2">
                  <AspectRatioIcon className="h-3.5 w-3.5 text-[hsl(var(--cyan))]" />
                  <p className="text-xs font-semibold text-[hsl(var(--text))]">Format</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(VIDEO_FORMATS).map((format) => {
                    const isSelected = selectedFormat === format.id;
                    return (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between">
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
                          {format.aspectRatio}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Template Selection */}
            <Card variant="default" className="animate-fadeIn" style={{ animationDelay: "50ms" }}>
              <CardContent className="p-4">
                <div className="mb-4 flex items-center gap-2">
                  <LayersIcon className="h-3.5 w-3.5 text-[hsl(var(--magenta))]" />
                  <p className="text-xs font-semibold text-[hsl(var(--text))]">Template</p>
                </div>
                <div className="space-y-2">
                  {templates.map((template) => {
                    const isSelected = selectedTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div
                          className="h-7 w-7 shrink-0 rounded-md border border-[hsl(var(--glass-border))]"
                          style={{
                            background:
                              template.background.type === "gradient"
                                ? `linear-gradient(135deg, ${template.background.gradientColors?.[0] || "#000"}, ${template.background.gradientColors?.[1] || "#333"})`
                                : template.background.color || "#000",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[hsl(var(--text))]">
                            {template.name}
                          </p>
                          <p className="truncate text-[10px] text-[hsl(var(--text-muted))]">
                            {template.subtitle.animation} animation
                          </p>
                        </div>
                        {isSelected && (
                          <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--cyan))]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Clips List */}
            <Card variant="default" className="animate-fadeIn" style={{ animationDelay: "100ms" }}>
              <CardContent className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <VideoIcon className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    <p className="text-xs font-semibold text-[hsl(var(--text))]">Clips</p>
                  </div>
                  <span className="text-[10px] text-[hsl(var(--text-muted))]">
                    {clips.length} total
                  </span>
                </div>
                <div className="scrollbar-thin max-h-52 space-y-1.5 overflow-y-auto">
                  {clips.map((clip, index) => {
                    const isSelected = selectedClipIndex === index;
                    return (
                      <button
                        key={clip.id}
                        onClick={() => setSelectedClipIndex(index)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
                            isSelected
                              ? "bg-[hsl(var(--cyan))] text-[hsl(260_30%_6%)]"
                              : "bg-[hsl(var(--raised))] text-[hsl(var(--text-muted))]"
                          )}
                        >
                          {index + 1}
                        </div>
                        <span className="flex-1 truncate text-xs font-medium text-[hsl(var(--text))]">
                          {clip.name}
                        </span>
                        <span className="font-mono text-[10px] text-[hsl(var(--text-muted))]">
                          {formatDuration(clip.endTime - clip.startTime)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Continue Button */}
        <div className="mt-8 flex justify-end sm:mt-10">
          <Button onClick={onComplete} glow>
            Continue to Export
          </Button>
        </div>
      </div>
    </div>
  );
};
