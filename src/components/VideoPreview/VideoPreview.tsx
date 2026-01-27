import React, { useState, useRef, useEffect } from "react";
import {
  PlayIcon,
  PauseIcon,
  TrackPreviousIcon,
  TrackNextIcon,
  CheckIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from "../ui";
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

  // Audio playback handling
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
    
    // Find words to display (show 3-4 words around current time)
    const wordsPerGroup = selectedTemplate?.subtitle?.wordsPerGroup || 3;
    
    // Find the current word index
    let currentWordIndex = currentClip.words.findIndex(
      (w) => w.start <= absoluteTime && w.end >= absoluteTime
    );
    
    if (currentWordIndex === -1) {
      currentWordIndex = currentClip.words.findIndex((w) => w.start > absoluteTime);
      if (currentWordIndex > 0) currentWordIndex--;
    }
    if (currentWordIndex === -1) currentWordIndex = 0;

    // Get group of words
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
        className="relative overflow-hidden rounded-lg"
        style={{
          aspectRatio: `${formatConfig.width} / ${formatConfig.height}`,
          maxHeight: "500px",
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
              fontSize: `${subtitle.fontSize * 0.4}px`, // Scale for preview
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

        {/* Duration indicator */}
        <div className="absolute bottom-4 left-4 right-4">
          <Progress
            value={(currentTime / (currentClip.endTime - currentClip.startTime)) * 100}
            size="sm"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Preview & Edit
        </h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Preview your clips with different formats and templates
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preview Panel */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                {currentClip?.name || "Select a clip"} - {formatConfig.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Hidden audio element */}
              <audio ref={audioRef} src={currentProject?.audioPath} preload="auto" />

              {/* Video Preview */}
              <div className="flex justify-center mb-4">{renderPreview()}</div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedClipIndex(Math.max(0, selectedClipIndex - 1))}
                  disabled={selectedClipIndex === 0}
                >
                  <TrackPreviousIcon className="w-5 h-5" />
                </Button>
                <Button onClick={togglePlayback} disabled={!currentClip}>
                  {isPlaying ? (
                    <PauseIcon className="w-5 h-5" />
                  ) : (
                    <PlayIcon className="w-5 h-5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedClipIndex(Math.min(clips.length - 1, selectedClipIndex + 1))
                  }
                  disabled={selectedClipIndex === clips.length - 1}
                >
                  <TrackNextIcon className="w-5 h-5" />
                </Button>
              </div>

              {currentClip && (
                <p className="text-center text-sm text-[hsl(var(--muted-foreground))] mt-2">
                  {formatDuration(currentTime)} /{" "}
                  {formatDuration(currentClip.endTime - currentClip.startTime)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Settings Panel */}
        <div className="space-y-4">
          {/* Format Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Format</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(VIDEO_FORMATS).map((format) => (
                  <button
                    key={format.id}
                    onClick={() => setSelectedFormat(format.id)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      selectedFormat === format.id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                    )}
                  >
                    <p className="font-medium text-sm">{format.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {format.aspectRatio}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Template Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left transition-colors flex items-center justify-between",
                      selectedTemplateId === template.id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                    )}
                  >
                    <span className="font-medium text-sm">{template.name}</span>
                    {selectedTemplateId === template.id && (
                      <CheckIcon className="w-4 h-4 text-[hsl(var(--primary))]" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Clips List */}
          <Card>
            <CardHeader>
              <CardTitle>Clips ({clips.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {clips.map((clip, index) => (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedClipIndex(index)}
                    className={cn(
                      "w-full p-2 rounded-lg border text-left transition-colors",
                      selectedClipIndex === index
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                    )}
                  >
                    <p className="font-medium text-sm">{clip.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDuration(clip.endTime - clip.startTime)}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end mt-6">
        <Button onClick={onComplete}>Continue to Export</Button>
      </div>
    </div>
  );
};
