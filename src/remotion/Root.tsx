import React from "react";
import { Composition } from "remotion";
import { ClipVideo } from "./Composition";
import { MulticamClipVideo } from "./MulticamComposition";
import { VIDEO_FORMATS, VideoFormat, BackgroundConfig, SubtitleConfig } from "../lib/types";
import { ClipVideoProps, MulticamClipVideoProps, WordTiming } from "./types";

// Calculate duration dynamically from inputProps instead of hardcoding
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calculateMetadata = async ({ props }: { props: any }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps || 30,
});

// Default props for preview - using explicit types
const defaultWords: WordTiming[] = [
  { text: "Hello", startFrame: 0, endFrame: 30 },
  { text: "world", startFrame: 30, endFrame: 60 },
  { text: "this", startFrame: 60, endFrame: 90 },
  { text: "is", startFrame: 90, endFrame: 120 },
  { text: "a", startFrame: 120, endFrame: 150 },
  { text: "test", startFrame: 150, endFrame: 180 },
];

const defaultBackground: BackgroundConfig = {
  type: "gradient",
  gradientColors: ["#667eea", "#764ba2"],
  gradientDirection: 135,
};

const defaultSubtitle: SubtitleConfig = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 72,
  fontWeight: 700,
  color: "#ffffff",
  shadowColor: "rgba(0,0,0,0.5)",
  shadowBlur: 10,
  position: "center",
  animation: "pop",
  wordsPerGroup: 3,
};

const createDefaultProps = (format: VideoFormat): ClipVideoProps => ({
  audioUrl: "",
  audioStartFrame: 0,
  audioEndFrame: 180,
  words: defaultWords,
  format,
  background: defaultBackground,
  subtitle: defaultSubtitle,
  durationInFrames: 180,
  fps: 30,
});

const createMulticamDefaultProps = (format: VideoFormat): MulticamClipVideoProps => ({
  ...createDefaultProps(format),
  videoSources: [],
  switchingTimeline: [{ startFrame: 0, endFrame: 180, videoSourceId: "" }],
  layoutMode: "active-speaker",
  pipEnabled: false,
  pipPositions: [],
  pipScale: 0.2,
  clipStartTimeSeconds: 0,
  transitionStyle: "cut",
  transitionDurationFrames: 3,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ClipVideoComponent = ClipVideo as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MulticamClipVideoComponent = MulticamClipVideo as any;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Vertical format (TikTok, Reels, Shorts) */}
      <Composition
        id="ClipVideo-9-16"
        component={ClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["9:16"].width}
        height={VIDEO_FORMATS["9:16"].height}
        defaultProps={createDefaultProps("9:16")}
      />

      {/* Square format (Instagram Posts) */}
      <Composition
        id="ClipVideo-1-1"
        component={ClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["1:1"].width}
        height={VIDEO_FORMATS["1:1"].height}
        defaultProps={createDefaultProps("1:1")}
      />

      {/* Landscape format (YouTube) */}
      <Composition
        id="ClipVideo-16-9"
        component={ClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["16:9"].width}
        height={VIDEO_FORMATS["16:9"].height}
        defaultProps={createDefaultProps("16:9")}
      />

      {/* Portrait format (Instagram Feed) */}
      <Composition
        id="ClipVideo-4-5"
        component={ClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["4:5"].width}
        height={VIDEO_FORMATS["4:5"].height}
        defaultProps={createDefaultProps("4:5")}
      />

      {/* ============ Multicam Compositions ============ */}

      <Composition
        id="MulticamClipVideo-9-16"
        component={MulticamClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["9:16"].width}
        height={VIDEO_FORMATS["9:16"].height}
        defaultProps={createMulticamDefaultProps("9:16")}
      />

      <Composition
        id="MulticamClipVideo-1-1"
        component={MulticamClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["1:1"].width}
        height={VIDEO_FORMATS["1:1"].height}
        defaultProps={createMulticamDefaultProps("1:1")}
      />

      <Composition
        id="MulticamClipVideo-16-9"
        component={MulticamClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["16:9"].width}
        height={VIDEO_FORMATS["16:9"].height}
        defaultProps={createMulticamDefaultProps("16:9")}
      />

      <Composition
        id="MulticamClipVideo-4-5"
        component={MulticamClipVideoComponent}
        calculateMetadata={calculateMetadata}
        fps={30}
        width={VIDEO_FORMATS["4:5"].width}
        height={VIDEO_FORMATS["4:5"].height}
        defaultProps={createMulticamDefaultProps("4:5")}
      />
    </>
  );
};
