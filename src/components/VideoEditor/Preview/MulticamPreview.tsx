import React, { useRef, useMemo, useEffect } from "react";
import { getMediaUrl } from "../../../lib/api";
import {
  resolveActiveSource,
  computeLayout,
  computeCropPosition,
  getVideoSeekTime,
  type VideoSourceLike,
  type LayoutMode,
  type PipPosition,
  type SpeakerSegmentLike,
  type MulticamOverride,
} from "../../../../shared/multicamTransform";

interface PreviewVideoSource extends VideoSourceLike {
  proxyBlobUrl?: string;
}

interface MulticamPreviewProps {
  videoSources: PreviewVideoSource[];
  segments: SpeakerSegmentLike[];
  currentTime: number; // seconds relative to clip start
  clipStartTime: number; // absolute start time in episode
  width: number;
  height: number;
  layoutMode: LayoutMode;
  pipEnabled: boolean;
  pipPositions: PipPosition[];
  pipScale: number;
  defaultVideoSourceId?: string;
  overrides?: MulticamOverride[];
  transitionStyle?: "cut" | "crossfade";
}

export const MulticamPreview: React.FC<MulticamPreviewProps> = ({
  videoSources,
  segments,
  currentTime,
  clipStartTime,
  width,
  height,
  layoutMode,
  pipEnabled,
  pipPositions,
  pipScale,
  defaultVideoSourceId,
  overrides,
  transitionStyle = "cut",
}) => {
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const absoluteTime = clipStartTime + currentTime;

  // Resolve active source using shared module
  const activeSourceId = useMemo(
    () =>
      resolveActiveSource(absoluteTime, segments, videoSources, {
        defaultVideoSourceId,
        holdPreviousMs: 1500,
        overrides,
      }),
    [absoluteTime, segments, videoSources, defaultVideoSourceId, overrides]
  );

  // Warn once if segments are empty but we have multiple speaker sources
  const warnedRef = useRef(false);
  useEffect(() => {
    if (warnedRef.current) return;
    const speakerSources = videoSources.filter((s) => s.sourceType === "speaker");
    if (speakerSources.length > 1 && segments.length === 0) {
      console.warn(
        "[MulticamPreview] No speaker segments provided — speaker switching disabled. Sources:",
        speakerSources.map((s) => s.label)
      );
      warnedRef.current = true;
    }
  }, [segments, videoSources]);

  // Compute layout using shared module
  const layouts = useMemo(
    () =>
      computeLayout(videoSources, activeSourceId, layoutMode, pipEnabled, pipPositions, pipScale),
    [videoSources, activeSourceId, layoutMode, pipEnabled, pipPositions, pipScale]
  );

  const targetAspect = width / height;

  // Pre-compute proxy URLs and crops for all sources (stable across renders)
  const sourceRenderData = useMemo(() => {
    return videoSources.map((source) => ({
      source,
      proxyUrl: getMediaUrl(source.proxyBlobUrl as string | undefined),
      crop: computeCropPosition(
        (source.width as number) || width,
        (source.height as number) || height,
        targetAspect,
        source.cropOffsetX,
        source.cropOffsetY
      ),
    }));
  }, [videoSources, width, height, targetAspect]);

  // Sync ALL video elements to current time (not just visible ones)
  useEffect(() => {
    videoRefs.current.forEach((video, sourceId) => {
      const source = videoSources.find((s) => s.id === sourceId);
      if (!source) return;

      const seekTime = getVideoSeekTime(absoluteTime, source.syncOffsetMs);
      if (Math.abs(video.currentTime - seekTime) > 0.1) {
        video.currentTime = seekTime;
      }
    });
  }, [absoluteTime, videoSources]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      {sourceRenderData.map(({ source, proxyUrl, crop }) => {
        if (!proxyUrl) return null;

        const layout = layouts.find((l) => l.sourceId === source.id);
        if (!layout) return null;

        const isActive = layout.visible;

        return (
          <div
            key={source.id}
            style={{
              position: "absolute",
              left: `${layout.x - layout.width / 2}%`,
              top: `${layout.y - layout.height / 2}%`,
              width: `${layout.width}%`,
              height: `${layout.height}%`,
              zIndex: isActive ? layout.zIndex : -1,
              overflow: "hidden",
              opacity: isActive ? 1 : 0,
              pointerEvents: isActive ? "auto" : "none",
              transition: transitionStyle === "crossfade" ? "opacity 0.15s ease" : undefined,
            }}
          >
            <video
              ref={(el) => {
                if (el) {
                  videoRefs.current.set(source.id, el);
                } else {
                  videoRefs.current.delete(source.id);
                }
              }}
              src={proxyUrl}
              muted
              playsInline
              preload="auto"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: crop.objectPosition,
              }}
            />
            {/* Speaker label overlay */}
            {isActive && source.id === activeSourceId && (
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  padding: "2px 8px",
                  borderRadius: 4,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 500,
                  pointerEvents: "none",
                }}
              >
                {source.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
