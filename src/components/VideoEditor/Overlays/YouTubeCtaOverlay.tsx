import React from "react";

export const YouTubeCtaOverlay: React.FC = () => {
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
      }}
    >
      <style>
        {`
          @keyframes yt-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.06); }
          }
          @keyframes yt-bell-ring {
            0%, 80%, 100% { transform: rotate(0deg); }
            85% { transform: rotate(12deg); }
            90% { transform: rotate(-12deg); }
            95% { transform: rotate(8deg); }
          }
        `}
      </style>

      {/* Subscribe button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#FF0000",
          borderRadius: 4,
          padding: "8px 16px",
          animation: "yt-pulse 2.5s ease-in-out infinite",
          cursor: "default",
        }}
      >
        {/* YouTube play icon */}
        <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
          <rect width="20" height="14" rx="3" fill="white" fillOpacity="0.2" />
          <path d="M8 3.5L13 7L8 10.5V3.5Z" fill="white" />
        </svg>
        <span
          style={{
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "system-ui, -apple-system, sans-serif",
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          Subscribe
        </span>
      </div>

      {/* Bell icon */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: "yt-bell-ring 3s ease-in-out infinite" }}
      >
        <path
          d="M12 2C10.9 2 10 2.9 10 4C10 4.1 10 4.19 10.02 4.29C7.12 5.14 5 7.82 5 11V17L3 19V20H21V19L19 17V11C19 7.82 16.88 5.14 13.98 4.29C14 4.19 14 4.1 14 4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z"
          fill="white"
          fillOpacity="0.9"
        />
      </svg>
    </div>
  );
};
