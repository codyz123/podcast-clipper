import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTiming } from "../types";

const BAR_COUNT = 20;

interface WaveformOverlayProps {
  words: WordTiming[];
}

export const WaveformOverlay: React.FC<WaveformOverlayProps> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Check if someone is speaking at the current frame
  const isSpeaking = words.some((w) => frame >= w.startFrame && frame <= w.endFrame);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        gap: 3,
      }}
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        // Deterministic bar height based on frame and bar index
        const speed = 0.15 + (i % 5) * 0.02;
        const offset = i * 0.7;
        const wave = Math.sin((frame / fps) * Math.PI * 2 * speed * fps * 0.03 + offset);
        const activeHeight = 0.3 + Math.abs(wave) * 0.7; // 30%-100%
        const scaleY = isSpeaking ? activeHeight : 0.15;

        return (
          <div
            key={i}
            style={{
              width: 4,
              height: "60%",
              borderRadius: 2,
              backgroundColor: "white",
              opacity: 0.9,
              transform: `scaleY(${scaleY})`,
              transformOrigin: "center",
            }}
          />
        );
      })}
    </div>
  );
};
