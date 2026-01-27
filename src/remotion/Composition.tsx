import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Background } from "./Background";
import { SubtitleAnimation } from "./SubtitleAnimation";
import { ClipVideoProps } from "./types";
import { VIDEO_FORMATS } from "../lib/types";

// Using a regular function to avoid strict FC typing issues with Remotion
export const ClipVideo = (props: ClipVideoProps) => {
  const { audioUrl, words, format, background, subtitle, durationInFrames } = props;
  const formatConfig = VIDEO_FORMATS[format];

  return (
    <AbsoluteFill
      style={{
        width: formatConfig.width,
        height: formatConfig.height,
      }}
    >
      {/* Background layer */}
      <Background config={background} />

      {/* Audio layer */}
      {audioUrl && <Audio src={audioUrl} />}

      {/* Subtitle layer */}
      <Sequence from={0} durationInFrames={durationInFrames}>
        <SubtitleAnimation words={words} config={subtitle} />
      </Sequence>
    </AbsoluteFill>
  );
};
