import React from "react";

const BAR_COUNT = 20;
const BAR_GAP = 2;

interface WaveformOverlayProps {
  isActive: boolean;
}

export const WaveformOverlay: React.FC<WaveformOverlayProps> = ({ isActive }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: BAR_GAP,
        width: "100%",
        height: "100%",
        padding: "20%",
      }}
    >
      <style>
        {`
          @keyframes waveform-bar {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
          }
        `}
      </style>
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const delay = (i / BAR_COUNT) * 1.2;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: "100%",
              borderRadius: 2,
              backgroundColor: "rgba(255, 255, 255, 0.85)",
              transformOrigin: "center",
              transform: isActive ? undefined : "scaleY(0.15)",
              animation: isActive ? `waveform-bar 0.8s ease-in-out ${delay}s infinite` : undefined,
              transition: "transform 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
};
