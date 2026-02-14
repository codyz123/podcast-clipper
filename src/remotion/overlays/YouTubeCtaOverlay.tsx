import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const YouTubeCtaOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });

  // Subtle pulse on the subscribe button
  const pulse = interpolate(frame % (fps * 2), [0, fps, fps * 2], [1, 1.05, 1], {
    extrapolateRight: "clamp",
  });

  // Bell ring: small rotation oscillation
  const bellRing = interpolate(
    frame % (fps * 3),
    [0, fps * 0.1, fps * 0.2, fps * 0.3, fps * 0.4, fps * 3],
    [0, 15, -10, 8, 0, 0],
    { extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        gap: 8,
        transform: `scale(${entrance})`,
        opacity: entrance,
      }}
    >
      {/* Subscribe button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#FF0000",
          borderRadius: 4,
          padding: "6px 14px",
          transform: `scale(${pulse})`,
        }}
      >
        {/* YouTube play icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.6 3.5 12 3.5 12 3.5s-7.6 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1 1.8 2 2.1 1.9.6 9.5.6 9.5.6s7.6 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.5V8.5l6.5 3.5-6.5 3.5z" />
        </svg>
        <span
          style={{
            color: "white",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "system-ui, -apple-system, sans-serif",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          Subscribe
        </span>
      </div>

      {/* Bell icon */}
      <div style={{ transform: `rotate(${bellRing}deg)`, transformOrigin: "top center" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" opacity="0.9">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      </div>
    </div>
  );
};
