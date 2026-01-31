import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { SubtitleConfig } from "../lib/types";
import { WordTiming } from "./types";

interface SubtitleAnimationProps {
  words: WordTiming[];
  config: SubtitleConfig;
}

export const SubtitleAnimation: React.FC<SubtitleAnimationProps> = ({ words, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Group words based on wordsPerGroup
  const groups: WordTiming[][] = [];
  for (let i = 0; i < words.length; i += config.wordsPerGroup) {
    groups.push(words.slice(i, i + config.wordsPerGroup));
  }

  // Find the current group based on frame
  const currentGroupIndex = groups.findIndex((group) => {
    const groupStart = group[0]?.startFrame || 0;
    const groupEnd = group[group.length - 1]?.endFrame || 0;
    return frame >= groupStart && frame <= groupEnd;
  });

  // If no group is active, find the next one
  const activeGroupIndex =
    currentGroupIndex >= 0
      ? currentGroupIndex
      : groups.findIndex((group) => (group[0]?.startFrame || 0) > frame);

  // Get the current active group
  const currentGroup = groups[activeGroupIndex >= 0 ? activeGroupIndex : 0];

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

  const getWordStyle = (word: WordTiming): React.CSSProperties => {
    if (config.animation === "karaoke") {
      const isActive = frame >= word.startFrame && frame <= word.endFrame;
      const progress = interpolate(frame, [word.startFrame, word.endFrame], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      return {
        color: isActive ? "#FFD700" : config.color,
        transform: isActive ? `scale(${1 + progress * 0.1})` : "scale(1)",
        display: "inline-block",
        marginRight: "0.3em",
        transition: "transform 0.1s ease",
      };
    }

    return {
      color: config.color,
      display: "inline-block",
      marginRight: "0.3em",
    };
  };

  const positionStyle: React.CSSProperties = {
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
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    fontWeight: config.fontWeight,
    textShadow: config.shadowColor
      ? `0 2px ${config.shadowBlur || 4}px ${config.shadowColor}`
      : undefined,
    WebkitTextStroke: config.outlineWidth
      ? `${config.outlineWidth}px ${config.outlineColor}`
      : undefined,
    lineHeight: 1.4,
    ...getAnimationStyle(),
  };

  return (
    <div style={positionStyle}>
      <div style={textStyle}>
        {currentGroup.map((word, index) => (
          <span key={index} style={getWordStyle(word)}>
            {word.text}
          </span>
        ))}
      </div>
    </div>
  );
};
