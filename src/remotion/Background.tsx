import React from "react";
import { AbsoluteFill } from "remotion";
import { BackgroundConfig } from "../lib/types";

interface BackgroundProps {
  config: BackgroundConfig;
}

export const Background: React.FC<BackgroundProps> = ({ config }) => {
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
        // Video backgrounds would need a separate Video component
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
