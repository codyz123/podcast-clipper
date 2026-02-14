import React from "react";
import { Img } from "remotion";
import { Lottie } from "@remotion/lottie";
import type { TrackClipData, WordTiming } from "./types";
import { WaveformOverlay } from "./overlays/WaveformOverlay";
import { YouTubeCtaOverlay } from "./overlays/YouTubeCtaOverlay";
import { ApplePodcastsCtaOverlay } from "./overlays/ApplePodcastsCtaOverlay";

interface AnimationOverlayProps {
  clip: TrackClipData;
  podcast?: { name: string; coverImageUrl?: string; author?: string; category?: string };
  words?: WordTiming[];
}

export const AnimationOverlay: React.FC<AnimationOverlayProps> = ({ clip, podcast, words }) => {
  const { assetUrl, assetSource, lottieData, positionX, positionY } = clip;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: `${positionX ?? 50}%`,
    top: `${positionY ?? 50}%`,
    transform: "translate(-50%, -50%)",
    width: 200,
    height: 200,
    pointerEvents: "none",
  };

  // Custom overlay types
  if (assetSource === "waveform") {
    return (
      <div style={containerStyle}>
        <WaveformOverlay words={words || []} />
      </div>
    );
  }

  if (assetSource === "youtube-cta") {
    return (
      <div style={containerStyle}>
        <YouTubeCtaOverlay />
      </div>
    );
  }

  if (assetSource === "apple-podcasts-cta") {
    return (
      <div style={containerStyle}>
        <ApplePodcastsCtaOverlay podcast={podcast} />
      </div>
    );
  }

  // Legacy: GIPHY / Tenor stickers
  if ((assetSource === "giphy" || assetSource === "tenor") && assetUrl) {
    return (
      <div style={containerStyle}>
        <Img src={assetUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }

  // Legacy: Lottie animations
  if (lottieData) {
    return (
      <div style={containerStyle}>
        <Lottie
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          animationData={lottieData as any}
          loop={true}
          playbackRate={1}
          renderer="svg"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    );
  }

  return null;
};
