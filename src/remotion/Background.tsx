import React from "react";
import { AbsoluteFill, Video } from "remotion";
import { BackgroundConfig } from "../lib/types";

interface BackgroundProps {
  config: BackgroundConfig;
}

export const Background: React.FC<BackgroundProps> = ({ config }) => {
  if (config.type === "video" && config.videoPath) {
    return (
      <AbsoluteFill>
        <Video
          src={config.videoPath}
          startFrom={config.videoStartFrame ?? 0}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }

  const getBackgroundStyle = (): React.CSSProperties => {
    switch (config.type) {
      case "solid":
        return {
          backgroundColor: config.color || "#000000",
        };
      case "gradient": {
        const colors = config.gradientColors || ["#667eea", "#764ba2"];
        const direction = config.gradientDirection || 135;
        return {
          background: `linear-gradient(${direction}deg, ${colors.join(", ")})`,
        };
      }
      case "image":
        return {
          backgroundImage: config.imagePath ? `url(${config.imagePath})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        };
      case "video":
        return {
          backgroundColor: "#000000",
        };
      default:
        return {
          backgroundColor: "#000000",
        };
    }
  };

  return <AbsoluteFill style={getBackgroundStyle()} />;
};
