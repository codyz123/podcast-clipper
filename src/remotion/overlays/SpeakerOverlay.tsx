import React from "react";
import { useCurrentFrame, Img, AbsoluteFill } from "remotion";
import type { SpeakerOverlayConfig } from "../types";

// Same palette as EditorPreview and MultiTrackTimeline
const SPEAKER_COLORS = [
  "hsl(200 80% 50%)",
  "hsl(340 80% 50%)",
  "hsl(130 60% 45%)",
  "hsl(40 90% 50%)",
  "hsl(270 70% 55%)",
  "hsl(15 80% 55%)",
];

interface SpeakerOverlayProps {
  config: SpeakerOverlayConfig;
  formatWidth: number;
  formatHeight: number;
}

export const SpeakerOverlay: React.FC<SpeakerOverlayProps> = ({
  config,
  formatWidth,
  formatHeight,
}) => {
  const frame = useCurrentFrame();

  // Find active speaker clip at current frame
  const activeClip = config.clips.find((c) => frame >= c.startFrame && frame < c.endFrame);
  if (!activeClip) return null;

  const color = SPEAKER_COLORS[activeClip.colorIndex % SPEAKER_COLORS.length];

  // Resolve person data
  const person = activeClip.personId
    ? config.people.find((p) => p.id === activeClip.personId)
    : undefined;
  const displayLabel = person?.name || activeClip.speakerLabel;
  const photoUrl = person?.photoUrl;

  // Format name based on config
  const formatName = (name: string): string | null => {
    if (config.nameFormat === "off") return null;
    if (config.nameFormat === "first-name") return name.split(" ")[0];
    return name;
  };

  const formattedName = formatName(displayLabel);
  const minDim = Math.min(formatWidth, formatHeight);

  if (config.displayMode === "circle") {
    // Circle cutout mode
    const circleSize = minDim * 0.55;
    return (
      <AbsoluteFill>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
          {photoUrl ? (
            <div
              style={{
                width: circleSize,
                height: circleSize,
                borderRadius: "50%",
                overflow: "hidden",
              }}
            >
              <Img
                src={photoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: circleSize,
                height: circleSize,
                borderRadius: "50%",
                backgroundColor: `${color}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: minDim * 0.18,
                  fontWeight: 700,
                  color,
                }}
              >
                {displayLabel.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          {formattedName && (
            <span
              style={{
                marginTop: 8,
                fontSize: Math.max(10, minDim * 0.06),
                fontWeight: 600,
                color,
              }}
            >
              {formattedName}
            </span>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Fill mode (default)
  if (photoUrl) {
    return (
      <AbsoluteFill>
        <Img
          src={photoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        {formattedName && (
          <div
            style={{
              position: "absolute",
              bottom: "8%",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: `${color}CC`,
              borderRadius: 9999,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 4,
              paddingBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: Math.max(10, formatHeight * 0.035),
                fontWeight: 600,
                color: "white",
                whiteSpace: "nowrap",
              }}
            >
              {formattedName}
            </span>
          </div>
        )}
      </AbsoluteFill>
    );
  }

  // Fill mode — no photo fallback (initials circle with tinted background)
  const initialsCircleSize = minDim * 0.5;
  return (
    <AbsoluteFill>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: `${color}20`,
        }}
      >
        <div
          style={{
            width: initialsCircleSize,
            height: initialsCircleSize,
            borderRadius: "50%",
            backgroundColor: `${color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: minDim * 0.18,
              fontWeight: 700,
              color,
            }}
          >
            {displayLabel.slice(0, 2).toUpperCase()}
          </span>
        </div>
        {formattedName && (
          <span
            style={{
              marginTop: 8,
              fontSize: minDim * 0.06,
              fontWeight: 500,
              color,
            }}
          >
            {formattedName}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
