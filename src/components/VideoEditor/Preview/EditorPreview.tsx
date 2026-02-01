import React from "react";
import {
  Clip,
  VideoFormat,
  VideoTemplate,
  VIDEO_FORMATS,
  CaptionStyle,
  CAPTION_PRESETS,
} from "../../../lib/types";
import { cn } from "../../../lib/utils";

interface EditorPreviewProps {
  clip: Clip | null;
  currentTime: number;
  format: VideoFormat;
  template: VideoTemplate;
  onFormatChange: (format: VideoFormat) => void;
}

export const EditorPreview: React.FC<EditorPreviewProps> = ({
  clip,
  currentTime,
  format,
  template,
  onFormatChange,
}) => {
  const formatConfig = VIDEO_FORMATS[format];

  // Get caption style from clip or fall back to template
  const getCaptionStyle = (): CaptionStyle | null => {
    if (clip?.captionStyle) return clip.captionStyle;
    // Find caption track and use its style
    const captionTrack = clip?.tracks?.find((t) => t.type === "captions");
    if (captionTrack?.captionStyle) return captionTrack.captionStyle;
    // Fall back to Hormozi preset if no style set
    return { ...CAPTION_PRESETS.hormozi, preset: "hormozi" };
  };

  const captionStyle = getCaptionStyle();

  // Get current words to display
  const getCurrentWords = () => {
    if (!clip) return [];

    const absoluteTime = clip.startTime + currentTime;
    const wordsPerGroup = captionStyle?.wordsPerLine || template?.subtitle?.wordsPerGroup || 3;

    let currentWordIndex = clip.words.findIndex(
      (w) => w.start <= absoluteTime && w.end >= absoluteTime
    );

    if (currentWordIndex === -1) {
      currentWordIndex = clip.words.findIndex((w) => w.start > absoluteTime);
      if (currentWordIndex > 0) currentWordIndex--;
    }
    if (currentWordIndex === -1) currentWordIndex = 0;

    const groupStart = Math.floor(currentWordIndex / wordsPerGroup) * wordsPerGroup;
    return clip.words.slice(groupStart, groupStart + wordsPerGroup);
  };

  // Find the current active word for highlighting
  const getActiveWordIndex = () => {
    if (!clip) return -1;
    const absoluteTime = clip.startTime + currentTime;
    return clip.words.findIndex((w) => w.start <= absoluteTime && w.end >= absoluteTime);
  };

  const words = getCurrentWords();
  const activeWordIndex = getActiveWordIndex();
  const bg = template.background;

  // Calculate preview dimensions to fit container while maintaining aspect ratio
  const previewMaxHeight = 380;
  const previewMaxWidth = 400;

  let previewWidth: number;
  let previewHeight: number;

  const aspectRatio = formatConfig.width / formatConfig.height;

  if (aspectRatio > 1) {
    // Landscape
    previewWidth = Math.min(previewMaxWidth, previewMaxHeight * aspectRatio);
    previewHeight = previewWidth / aspectRatio;
  } else {
    // Portrait or square
    previewHeight = previewMaxHeight;
    previewWidth = previewHeight * aspectRatio;
  }

  const backgroundStyle: React.CSSProperties = {};
  if (bg.type === "solid") {
    backgroundStyle.backgroundColor = bg.color;
  } else if (bg.type === "gradient") {
    backgroundStyle.background = `linear-gradient(${bg.gradientDirection || 135}deg, ${bg.gradientColors?.join(", ")})`;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[hsl(var(--bg-elevated))] p-4">
      {/* Format selector tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-[hsl(var(--bg-surface))] p-1">
        {Object.values(VIDEO_FORMATS).map((f) => (
          <button
            key={f.id}
            onClick={() => onFormatChange(f.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              format === f.id
                ? "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text))] shadow-sm"
                : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
            )}
          >
            {f.aspectRatio}
          </button>
        ))}
      </div>

      {/* Preview container */}
      <div
        className="relative overflow-hidden rounded-lg shadow-lg"
        style={{
          width: previewWidth,
          height: previewHeight,
          ...backgroundStyle,
        }}
      >
        {!clip ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/60">No clip selected</p>
          </div>
        ) : (
          <>
            {/* Subtitle - uses captionStyle from clip/track */}
            <div
              className={cn(
                "absolute inset-x-0 flex items-center justify-center px-4",
                captionStyle?.position === "top"
                  ? "top-[20%]"
                  : captionStyle?.position === "bottom"
                    ? "bottom-[20%]"
                    : "top-1/2 -translate-y-1/2"
              )}
            >
              <div
                className="rounded px-2 py-1"
                style={{
                  backgroundColor: captionStyle?.backgroundColor || undefined,
                }}
              >
                <p
                  style={{
                    fontFamily: captionStyle?.fontFamily || "Inter",
                    fontSize: `${(captionStyle?.fontSize || 36) * 0.35}px`,
                    fontWeight: captionStyle?.fontWeight || 600,
                    textAlign: "center",
                  }}
                >
                  {words.map((w, i) => {
                    const globalIndex = clip.words.indexOf(w);
                    const isActive = globalIndex === activeWordIndex;
                    return (
                      <span
                        key={i}
                        style={{
                          color: isActive
                            ? captionStyle?.highlightColor || "#FFD700"
                            : captionStyle?.primaryColor || "#FFFFFF",
                          transition: "color 0.1s ease-out",
                        }}
                      >
                        {w.text}
                        {i < words.length - 1 ? " " : ""}
                      </span>
                    );
                  })}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="absolute right-3 bottom-3 left-3">
              <div className="h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white/80 transition-all duration-100"
                  style={{
                    width: `${(currentTime / (clip.endTime - clip.startTime)) * 100}%`,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Format info */}
      <div className="mt-3 text-center">
        <p className="text-xs text-[hsl(var(--text-muted))]">
          {formatConfig.name} ({formatConfig.width} x {formatConfig.height})
        </p>
        <p className="mt-0.5 text-[10px] text-[hsl(var(--text-tertiary))]">
          {formatConfig.useCases.join(", ")}
        </p>
      </div>
    </div>
  );
};
