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

    let backgroundStyle: React.CSSProperties = {};

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
            subtitle.position === "top" ? "top-[20%]" : subtitle.position === "bottom" ? "bottom-[20%]" : "top-1/2 -translate-y-1/2"
          )}
        >
          <p
            style={{
              fontFamily: subtitle.fontFamily,
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
        <div className="absolute bottom-3 left-3 right-3">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/80 rounded-full transition-all duration-100"
              style={{ width: `${(currentTime / (currentClip.endTime - currentClip.startTime)) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

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
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">4</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">
              Step 4 of 5
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--text))] tracking-tight font-[family-name:var(--font-display)]">
            Preview & Edit
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-sm">
            Preview clips with different formats and templates
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Preview Panel */}
          <div className="lg:col-span-2">
            <Card className="animate-fadeIn">
              <CardContent className="p-5">
                {/* Hidden audio */}
                <audio ref={audioRef} src={currentProject?.audioPath} preload="auto" />

                {/* Clip Info */}
                <div className="flex items-center justify-between mb-5 pb-4 border-b border-[hsl(var(--glass-border))]">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      "bg-[hsl(185_50%_15%/0.5)]"
                    )}>
                      <VideoIcon className="w-5 h-5 text-[hsl(var(--cyan))]" />
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
                  <div className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium",
                    "bg-[hsl(var(--surface))]",
                    "text-[hsl(var(--text-subtle))]"
                  )}>
                    {selectedClipIndex + 1} / {clips.length}
                  </div>
                </div>

                {/* Video Preview */}
                <div className={cn(
                  "flex justify-center mb-5 p-4 rounded-lg",
                  "bg-[hsl(var(--surface))]",
                  "border border-[hsl(var(--glass-border))]"
                )}>
                  {renderPreview()}
                </div>

                {/* Playback Controls */}
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedClipIndex(Math.max(0, selectedClipIndex - 1))}
                      disabled={selectedClipIndex === 0}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        selectedClipIndex === 0
                          ? "text-[hsl(var(--text-ghost))] cursor-not-allowed"
                          : "text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                      )}
                    >
                      <TrackPreviousIcon className="w-4 h-4" />
                    </button>

                    <Button
                      onClick={togglePlayback}
                      disabled={!currentClip}
                      className="w-12 h-12 rounded-full p-0"
                      glow={!isPlaying && !!currentClip}
                    >
                      {isPlaying ? (
                        <PauseIcon className="w-5 h-5" />
                      ) : (
                        <PlayIcon className="w-5 h-5 ml-0.5" />
                      )}
                    </Button>

                    <button
                      onClick={() => setSelectedClipIndex(Math.min(clips.length - 1, selectedClipIndex + 1))}
                      disabled={selectedClipIndex === clips.length - 1}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        selectedClipIndex === clips.length - 1
                          ? "text-[hsl(var(--text-ghost))] cursor-not-allowed"
                          : "text-[hsl(var(--text-subtle))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                      )}
                    >
                      <TrackNextIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {currentClip && (
                    <div className="flex items-center gap-3 w-full max-w-xs">
                      <span className="font-mono text-xs text-[hsl(var(--text-subtle))] tabular-nums w-10">
                        {formatDuration(currentTime)}
                      </span>
                      <div className="flex-1">
                        <Progress
                          value={(currentTime / (currentClip.endTime - currentClip.startTime)) * 100}
                          variant="cyan"
                          size="sm"
                        />
                      </div>
                      <span className="font-mono text-xs text-[hsl(var(--text-muted))] tabular-nums w-10 text-right">
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
                <div className="flex items-center gap-2 mb-4">
                  <AspectRatioIcon className="w-3.5 h-3.5 text-[hsl(var(--cyan))]" />
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
                          "p-3 rounded-lg border text-left transition-colors",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
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
                <div className="flex items-center gap-2 mb-4">
                  <LayersIcon className="w-3.5 h-3.5 text-[hsl(var(--magenta))]" />
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
                          "w-full p-3 rounded-lg border text-left transition-colors flex items-center gap-3",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div
                          className="w-7 h-7 rounded-md border border-[hsl(var(--glass-border))] shrink-0"
                          style={{
                            background:
                              template.background.type === "gradient"
                                ? `linear-gradient(135deg, ${template.background.gradientColors?.[0] || "#000"}, ${template.background.gradientColors?.[1] || "#333"})`
                                : template.background.color || "#000",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[hsl(var(--text))]">
                            {template.name}
                          </p>
                          <p className="text-[10px] text-[hsl(var(--text-muted))] truncate">
                            {template.subtitle.animation} animation
                          </p>
                        </div>
                        {isSelected && (
                          <CheckIcon className="w-3.5 h-3.5 text-[hsl(var(--cyan))] shrink-0" />
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <VideoIcon className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                    <p className="text-xs font-semibold text-[hsl(var(--text))]">Clips</p>
                  </div>
                  <span className="text-[10px] text-[hsl(var(--text-muted))]">
                    {clips.length} total
                  </span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
                  {clips.map((clip, index) => {
                    const isSelected = selectedClipIndex === index;
                    return (
                      <button
                        key={clip.id}
                        onClick={() => setSelectedClipIndex(index)}
                        className={cn(
                          "w-full p-2.5 rounded-lg border text-left transition-colors flex items-center gap-2.5",
                          isSelected
                            ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                            : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:border-[hsl(0_0%_100%/0.12)]"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0",
                          isSelected
                            ? "bg-[hsl(var(--cyan))] text-[hsl(260_30%_6%)]"
                            : "bg-[hsl(var(--raised))] text-[hsl(var(--text-muted))]"
                        )}>
                          {index + 1}
                        </div>
                        <span className="text-xs font-medium text-[hsl(var(--text))] flex-1 truncate">
                          {clip.name}
                        </span>
                        <span className="text-[10px] font-mono text-[hsl(var(--text-muted))]">
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
        <div className="flex justify-end mt-8 sm:mt-10">
          <Button onClick={onComplete} glow>
            Continue to Export
          </Button>
        </div>
      </div>
    </div>
  );
};
