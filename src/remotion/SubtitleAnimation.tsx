import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { SubtitleConfig } from "../lib/types";
import { WordTiming } from "./types";
import { resolveFontFamily } from "../lib/fonts";

interface SubtitleAnimationProps {
  words: WordTiming[];
  config: SubtitleConfig;
}

export const SubtitleAnimation: React.FC<SubtitleAnimationProps> = ({ words, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeSeconds = frame / fps;

  const wordsPerGroup = Math.max(1, config.wordsPerGroup);
  const isWithinWord = (word: WordTiming) => {
    if (typeof word.startTime === "number" && typeof word.endTime === "number") {
      return currentTimeSeconds >= word.startTime && currentTimeSeconds <= word.endTime;
    }
    return frame >= word.startFrame && frame <= word.endFrame;
  };
  const activeWordIndex = words.findIndex((word) => isWithinWord(word));

  // No word is active — hide captions entirely during gaps
  if (activeWordIndex === -1) {
    return null;
  }

  const currentWordIndex = activeWordIndex;

  const groupStartIndex = Math.floor(currentWordIndex / wordsPerGroup) * wordsPerGroup;
  const currentGroup = words.slice(groupStartIndex, groupStartIndex + wordsPerGroup);

  if (!currentGroup || currentGroup.length === 0) {
    return null;
  }

  const groupStartFrame = currentGroup[0].startFrame;
  const groupEndFrame = currentGroup[currentGroup.length - 1].endFrame;

  // Check if we should show this group
  if (frame < groupStartFrame - 5 || frame > groupEndFrame + 5) {
    return null;
  }

  const getAnimationStyle = (): React.CSSProperties => {
    switch (config.animation) {
      case "fade": {
        const fadeInOpacity = interpolate(frame, [groupStartFrame - 5, groupStartFrame], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const fadeOutOpacity = interpolate(frame, [groupEndFrame, groupEndFrame + 5], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return { opacity: Math.min(fadeInOpacity, fadeOutOpacity) };
      }

      case "pop": {
        const scaleSpring = spring({
          frame: frame - groupStartFrame + 5,
          fps,
          config: {
            damping: 12,
            mass: 0.5,
            stiffness: 200,
          },
        });
        const fadeOutOpacity = interpolate(frame, [groupEndFrame, groupEndFrame + 5], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return {
          transform: `scale(${scaleSpring})`,
          opacity: fadeOutOpacity,
        };
      }

      case "typewriter": {
        const progress = interpolate(
          frame,
          [groupStartFrame, groupStartFrame + currentGroup.length * 3],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const fadeOutOpacity = interpolate(frame, [groupEndFrame, groupEndFrame + 5], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return {
          clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          opacity: fadeOutOpacity,
        };
      }

      case "karaoke":
      default: {
        const fadeInOpacity = interpolate(frame, [groupStartFrame - 5, groupStartFrame], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const fadeOutOpacity = interpolate(frame, [groupEndFrame, groupEndFrame + 5], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return { opacity: Math.min(fadeInOpacity, fadeOutOpacity) };
      }
    }
  };

  const getWordStyle = (word: WordTiming, isActive: boolean): React.CSSProperties => {
    const highlightColor = config.highlightColor || config.color;
    const highlightScale = config.animation === "karaoke" ? (config.highlightScale ?? 0) : 0;
    const color = isActive ? highlightColor : config.color;
    const scale =
      isActive && highlightScale > 0
        ? 1 +
          interpolate(frame, [word.startFrame, word.endFrame], [0, highlightScale], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 1;

    if (highlightScale > 0) {
      return {
        color,
        transform: `scale(${scale})`,
        display: "inline-block",
      };
    }

    return {
      color,
      display: "inline",
    };
  };

  const hasCustomPosition =
    typeof config.positionX === "number" || typeof config.positionY === "number";

  const positionStyle: React.CSSProperties = hasCustomPosition
    ? {
        position: "absolute",
        left: `${config.positionX ?? 50}%`,
        top: `${config.positionY ?? 50}%`,
        transform: "translate(-50%, -50%)",
        width: "90%",
        textAlign: "center",
      }
    : {
        position: "absolute",
        left: "5%",
        right: "5%",
        textAlign: "center",
        ...(config.position === "top"
          ? { top: "15%" }
          : config.position === "bottom"
            ? { bottom: "15%" }
            : { top: "50%", transform: "translateY(-50%)" }),
      };

  const textStyle: React.CSSProperties = {
    fontFamily: resolveFontFamily(config.fontFamily),
    fontSize: config.fontSize,
    fontWeight: config.fontWeight,
    textShadow: config.shadowColor
      ? `0 2px ${config.shadowBlur || 4}px ${config.shadowColor}`
      : undefined,
    WebkitTextStroke: config.outlineWidth
      ? `${config.outlineWidth}px ${config.outlineColor}`
      : undefined,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    textRendering: "geometricPrecision",
    lineHeight: 1.2,
    wordWrap: "break-word",
    overflowWrap: "break-word",
    whiteSpace: "normal",
    ...getAnimationStyle(),
  };

  const backgroundStyle: React.CSSProperties | undefined = config.backgroundColor
    ? {
        backgroundColor: config.backgroundColor,
        padding: "4px 8px",
        borderRadius: "4px",
        display: "inline-block",
      }
    : undefined;

  return (
    <div style={positionStyle}>
      <div style={backgroundStyle}>
        <div style={textStyle}>
          {currentGroup.map((word, index) => {
            const wordIndex = groupStartIndex + index;
            const isActive = wordIndex === activeWordIndex;
            return (
              <span key={`${word.startFrame}-${index}`} style={getWordStyle(word, isActive)}>
                {word.text}
                {index < currentGroup.length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
