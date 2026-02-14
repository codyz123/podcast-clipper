import { AbsoluteFill, Audio, Sequence, Video, useCurrentFrame } from "remotion";
import { SubtitleAnimation } from "./SubtitleAnimation";
import { AnimationOverlay } from "./AnimationOverlay";
import { FontLoader } from "./FontLoader";
import { MulticamClipVideoProps } from "./types";
import { VIDEO_FORMATS } from "../lib/types";
import {
  computeLayout,
  computeCropPosition,
  getVideoSeekTime,
} from "../../shared/multicamTransform";
import type { VideoSourceLike, PipPosition } from "../../shared/multicamTransform";

export const MulticamClipVideo = (props: MulticamClipVideoProps) => {
  const {
    audioUrl,
    audioStartFrame,
    audioEndFrame,
    words,
    format,
    subtitle,
    durationInFrames,
    tracks,
    videoSources,
    switchingTimeline,
    layoutMode,
    pipEnabled,
    pipPositions,
    pipScale,
    clipStartTimeSeconds,
    transitionStyle,
    transitionDurationFrames,
  } = props;

  const formatConfig = VIDEO_FORMATS[format];
  const frame = useCurrentFrame();
  const fps = props.fps || 30;

  // Find current and previous active source from switching timeline
  let activeSourceId = videoSources[0]?.id || "";
  let previousSourceId: string | null = null;
  let transitionProgress = 1; // 1 = fully transitioned

  for (let i = 0; i < switchingTimeline.length; i++) {
    const interval = switchingTimeline[i];
    if (frame >= interval.startFrame && frame < interval.endFrame) {
      activeSourceId = interval.videoSourceId;

      // Check if we're in a crossfade transition zone
      if (transitionStyle === "crossfade" && i > 0 && transitionDurationFrames > 0) {
        const framesIntoInterval = frame - interval.startFrame;
        if (framesIntoInterval < transitionDurationFrames) {
          previousSourceId = switchingTimeline[i - 1].videoSourceId;
          transitionProgress = framesIntoInterval / transitionDurationFrames;
        }
      }
      break;
    }
  }

  // Build layout-compatible source list
  const layoutSources: VideoSourceLike[] = videoSources.map((s) => ({
    id: s.id,
    label: s.label,
    personId: null,
    sourceType: s.sourceType,
    syncOffsetMs: s.syncOffsetMs,
    cropOffsetX: s.cropOffsetX,
    cropOffsetY: s.cropOffsetY,
    width: s.width,
    height: s.height,
    displayOrder: 0,
  }));

  const pipPos: PipPosition[] = pipPositions || [];
  const layouts = computeLayout(
    layoutSources,
    activeSourceId,
    layoutMode,
    pipEnabled,
    pipPos,
    pipScale
  );

  // Animation overlay clips
  const animationClips = (tracks ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((track) => track.type === "video-overlay")
    .flatMap((track) => track.clips)
    .filter((clip) => clip.type === "animation" && clip.durationFrames > 0);

  const targetAspect = formatConfig.width / formatConfig.height;

  return (
    <AbsoluteFill style={{ width: formatConfig.width, height: formatConfig.height }}>
      <FontLoader />

      {/* Video layers */}
      {videoSources.map((source) => {
        const layout = layouts.find((l) => l.sourceId === source.id);
        if (!layout) return null;

        const isActive = source.id === activeSourceId;
        const isPrevious = source.id === previousSourceId;

        // Determine visibility: visible in layout, or part of crossfade
        if (!layout.visible && !isPrevious) return null;

        // Compute seek time accounting for sync offset
        const currentTimeSeconds = clipStartTimeSeconds + frame / fps;
        const seekTime = getVideoSeekTime(currentTimeSeconds, source.syncOffsetMs);
        const seekFrame = Math.floor(seekTime * fps);

        // Compute crop
        const crop = computeCropPosition(
          source.width || formatConfig.width,
          source.height || formatConfig.height,
          targetAspect,
          source.cropOffsetX,
          source.cropOffsetY
        );

        // Compute opacity for crossfade
        let opacity = 1;
        if (transitionStyle === "crossfade" && isPrevious && !isActive) {
          opacity = 1 - transitionProgress;
        }
        if (transitionStyle === "crossfade" && isActive && previousSourceId) {
          opacity = transitionProgress;
        }

        // Position and size
        const style: React.CSSProperties = {
          position: "absolute",
          left: `${layout.x - layout.width / 2}%`,
          top: `${layout.y - layout.height / 2}%`,
          width: `${layout.width}%`,
          height: `${layout.height}%`,
          zIndex: layout.zIndex + (isPrevious ? 0 : 0),
          opacity,
          overflow: "hidden",
        };

        return (
          <div key={source.id} style={style}>
            <Video
              src={source.videoUrl}
              startFrom={seekFrame}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: crop.objectPosition,
              }}
              muted
            />
          </div>
        );
      })}

      {/* Audio layer */}
      {audioUrl && <Audio src={audioUrl} startFrom={audioStartFrame} endAt={audioEndFrame} />}

      {/* Animation overlays */}
      {animationClips.map((clip) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
          <AnimationOverlay clip={clip} podcast={props.podcast} words={words} />
        </Sequence>
      ))}

      {/* Subtitle layer */}
      <Sequence from={0} durationInFrames={durationInFrames}>
        <SubtitleAnimation words={words} config={subtitle} />
      </Sequence>
    </AbsoluteFill>
  );
};
