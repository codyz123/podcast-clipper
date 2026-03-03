import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, Video } from "remotion";
import { FontLoader } from "./FontLoader";
import { Background } from "./Background";
import type { BackgroundConfig } from "../lib/types";

type EpisodeTimelineItem = {
  id: string;
  type: "video" | "audio" | "image" | "text" | "caption" | "transition";
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  resolvedUrl?: string;
  positionX?: number;
  positionY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  speed?: number;
};

type EpisodeTrack = {
  id: string;
  type: string;
  order: number;
  muted: boolean;
  visible: boolean;
  solo: boolean;
  volume: number;
  opacity: number;
  items: EpisodeTimelineItem[];
};

export interface EpisodeCompositionProps {
  tracks: EpisodeTrack[];
  background: BackgroundConfig;
  durationInFrames: number;
  fps: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function buildVisualStyle(item: EpisodeTimelineItem, trackOpacity: number): React.CSSProperties {
  const x = Number.isFinite(item.positionX) ? (item.positionX as number) : 50;
  const y = Number.isFinite(item.positionY) ? (item.positionY as number) : 50;
  const scale = Number.isFinite(item.scale) ? (item.scale as number) : 1;
  const rotation = Number.isFinite(item.rotation) ? (item.rotation as number) : 0;
  const opacity = clamp01((item.opacity ?? 1) * trackOpacity);

  const translateX = x - 50;
  const translateY = y - 50;

  return {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    opacity,
    transform: `translate(${translateX}%, ${translateY}%) scale(${scale}) rotate(${rotation}deg)`,
    transformOrigin: "center center",
  };
}

function createVolumeCallback(
  item: EpisodeTimelineItem,
  trackVolume: number,
  trackMuted: boolean,
  fps: number
): ((frame: number) => number) | number {
  if (trackMuted) return 0;

  const baseVolume = clamp01((item.volume ?? 1) * trackVolume);
  const fadeInFrames = Math.max(0, Math.round((item.fadeIn ?? 0) * fps));
  const fadeOutFrames = Math.max(0, Math.round((item.fadeOut ?? 0) * fps));
  const totalFrames = Math.max(1, Math.round(item.duration * fps));

  if (fadeInFrames === 0 && fadeOutFrames === 0) {
    return baseVolume;
  }

  return (frame: number) => {
    let gain = baseVolume;
    if (fadeInFrames > 0 && frame < fadeInFrames) {
      gain *= frame / fadeInFrames;
    }
    if (fadeOutFrames > 0 && frame > totalFrames - fadeOutFrames) {
      gain *= Math.max(0, (totalFrames - frame) / fadeOutFrames);
    }
    return clamp01(gain);
  };
}

// Renders an episode-level NLE timeline to a single video composition.
export const EpisodeComposition: React.FC<EpisodeCompositionProps> = ({
  tracks,
  background,
  durationInFrames,
  fps,
}) => {
  const sortedTracks = [...tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasSolo = sortedTracks.some((track) => track.solo);

  return (
    <AbsoluteFill>
      <FontLoader />
      <Background config={background} />

      {sortedTracks.flatMap((track) => {
        if (!track.visible) return [];

        const trackMuted = track.muted || (hasSolo && !track.solo);
        const trackVolume = Number.isFinite(track.volume) ? track.volume : 1;
        const trackOpacity = Number.isFinite(track.opacity) ? track.opacity : 1;

        return (track.items || []).flatMap((item) => {
          const url = item.resolvedUrl;
          if (!url) return [];

          if (item.type !== "video" && item.type !== "audio" && item.type !== "image") {
            return [];
          }

          const from = Math.max(0, Math.floor((item.startTime || 0) * fps));
          const durationFrames = Math.max(1, Math.ceil((item.duration || 0) * fps));
          if (from >= durationInFrames) return [];
          const clampedDuration = Math.min(durationFrames, durationInFrames - from);

          const safeSpeed =
            Number.isFinite(item.speed) && Number(item.speed) > 0 ? Number(item.speed) : 1;
          const sourceInFrame = Math.max(0, Math.floor((item.sourceIn || 0) * fps));
          const requestedSourceOut = Math.max(
            sourceInFrame + 1,
            Math.ceil(((item.sourceOut || item.sourceIn || 0) as number) * fps)
          );
          const fallbackSourceOut = sourceInFrame + Math.ceil(clampedDuration * safeSpeed);
          const sourceOutFrame = Math.max(requestedSourceOut, fallbackSourceOut);

          const volume = createVolumeCallback(item, trackVolume, trackMuted, fps);

          if (item.type === "image") {
            return [
              <Sequence key={item.id} from={from} durationInFrames={clampedDuration}>
                <Img src={url} style={buildVisualStyle(item, trackOpacity)} />
              </Sequence>,
            ];
          }

          if (item.type === "video") {
            return [
              <Sequence key={item.id} from={from} durationInFrames={clampedDuration}>
                <Video
                  src={url}
                  startFrom={sourceInFrame}
                  endAt={sourceOutFrame}
                  playbackRate={safeSpeed}
                  volume={volume}
                  style={buildVisualStyle(item, trackOpacity)}
                />
              </Sequence>,
            ];
          }

          return [
            <Sequence key={item.id} from={from} durationInFrames={clampedDuration}>
              <Audio
                src={url}
                startFrom={sourceInFrame}
                endAt={sourceOutFrame}
                playbackRate={safeSpeed}
                volume={volume}
              />
            </Sequence>,
          ];
        });
      })}
    </AbsoluteFill>
  );
};
