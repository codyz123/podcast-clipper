import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Background } from "./Background";
import { SubtitleAnimation } from "./SubtitleAnimation";
import { AnimationOverlay } from "./AnimationOverlay";
import { FontLoader } from "./FontLoader";
import { ClipVideoProps } from "./types";
import { VIDEO_FORMATS } from "../lib/types";

// Using a regular function to avoid strict FC typing issues with Remotion
export const ClipVideo = (props: ClipVideoProps) => {
  const {
    audioUrl,
    audioStartFrame,
    audioEndFrame,
    words,
    format,
    background,
    subtitle,
    durationInFrames,
    tracks,
    podcast,
  } = props;
  const formatConfig = VIDEO_FORMATS[format];
  const animationClips = (tracks ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((track) => track.type === "video-overlay")
    .flatMap((track) => track.clips)
    .filter((clip) => clip.type === "animation" && clip.durationFrames > 0);

  return (
    <AbsoluteFill
      style={{
        width: formatConfig.width,
        height: formatConfig.height,
      }}
    >
      <FontLoader />
      {/* Background layer */}
      <Background config={background} />

      {/* Audio layer */}
      {audioUrl && <Audio src={audioUrl} startFrom={audioStartFrame} endAt={audioEndFrame} />}

      {/* Animation overlays */}
      {animationClips.map((clip) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
          <AnimationOverlay clip={clip} podcast={podcast} words={words} />
        </Sequence>
      ))}

      {/* Subtitle layer */}
      <Sequence from={0} durationInFrames={durationInFrames}>
        <SubtitleAnimation words={words} config={subtitle} />
      </Sequence>
    </AbsoluteFill>
  );
};
