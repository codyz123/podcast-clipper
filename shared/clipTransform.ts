export type CaptionAnimation = "word-by-word" | "karaoke" | "bounce" | "typewriter";

export type CaptionStyle = {
  animation?: CaptionAnimation;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  primaryColor?: string;
  highlightColor?: string;
  backgroundColor?: string;
  position?: "bottom" | "center" | "top";
  positionX?: number;
  positionY?: number;
  wordsPerLine?: number;
  preset?: string;
};

export type ClipWithCaption = {
  captionStyle?: CaptionStyle | null;
  tracks?: Array<{
    type?: string;
    captionStyle?: CaptionStyle | null;
  }> | null;
};

export type SubtitleConfig = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  highlightColor?: string;
  highlightScale?: number;
  backgroundColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  position: "center" | "top" | "bottom";
  positionX?: number;
  positionY?: number;
  animation: "fade" | "pop" | "karaoke" | "typewriter";
  wordsPerGroup: number;
};

export type WordTiming = {
  text: string;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
};

export type WordLike = {
  text?: string;
  start?: number;
  end?: number;
};

export const CANONICAL_DEFAULTS = {
  wordsPerGroup: 4,
  fontSize: 48,
  fontWeight: 800,
  fontFamily: "Montserrat",
  primaryColor: "#FFFFFF",
  highlightColor: "#FFD700",
  backgroundColor: "rgba(0,0,0,0.7)",
  position: "center" as const,
  positionX: 50,
  positionY: 50,
  animation: "karaoke" as const,
  highlightScale: 0,
};

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  animation: "word-by-word",
  fontFamily: CANONICAL_DEFAULTS.fontFamily,
  fontSize: CANONICAL_DEFAULTS.fontSize,
  fontWeight: CANONICAL_DEFAULTS.fontWeight,
  primaryColor: CANONICAL_DEFAULTS.primaryColor,
  highlightColor: CANONICAL_DEFAULTS.highlightColor,
  backgroundColor: CANONICAL_DEFAULTS.backgroundColor,
  position: CANONICAL_DEFAULTS.position,
  positionX: CANONICAL_DEFAULTS.positionX,
  positionY: CANONICAL_DEFAULTS.positionY,
  wordsPerLine: CANONICAL_DEFAULTS.wordsPerGroup,
  preset: "hormozi",
};

export function resolveCaptionStyle(clip: ClipWithCaption): CaptionStyle {
  if (clip.captionStyle) return clip.captionStyle;
  const captionTrack = clip.tracks?.find((track) => track.type === "captions");
  if (captionTrack?.captionStyle) return captionTrack.captionStyle;
  return { ...DEFAULT_CAPTION_STYLE };
}

export function toSubtitleConfig(style: CaptionStyle): SubtitleConfig {
  const animationMap: Record<
    string,
    { animation: SubtitleConfig["animation"]; highlightScale: number }
  > = {
    karaoke: { animation: "karaoke", highlightScale: 0 },
    "word-by-word": { animation: "karaoke", highlightScale: 0 },
    bounce: { animation: "pop", highlightScale: 0 },
    typewriter: { animation: "typewriter", highlightScale: 0 },
  };

  const animConfig = animationMap[style.animation || "karaoke"] || animationMap.karaoke;

  return {
    fontFamily: style.fontFamily || CANONICAL_DEFAULTS.fontFamily,
    fontSize: style.fontSize || CANONICAL_DEFAULTS.fontSize,
    fontWeight: style.fontWeight || CANONICAL_DEFAULTS.fontWeight,
    color: style.primaryColor || CANONICAL_DEFAULTS.primaryColor,
    highlightColor: style.highlightColor || style.primaryColor || CANONICAL_DEFAULTS.highlightColor,
    backgroundColor: style.backgroundColor,
    position: style.position || CANONICAL_DEFAULTS.position,
    positionX: typeof style.positionX === "number" ? style.positionX : CANONICAL_DEFAULTS.positionX,
    positionY: typeof style.positionY === "number" ? style.positionY : CANONICAL_DEFAULTS.positionY,
    animation: animConfig.animation,
    highlightScale: animConfig.highlightScale,
    wordsPerGroup:
      typeof style.wordsPerLine === "number"
        ? style.wordsPerLine
        : CANONICAL_DEFAULTS.wordsPerGroup,
  };
}

export function toWordTimings(
  words: WordLike[],
  clipStart: number,
  clipEnd: number,
  fps: number = 30
): WordTiming[] {
  // Use eps tolerance to match the boundary filtering in episodeToProject and
  // handleBoundaryChange — without this, words right at clip edges (included via
  // eps in those filters) get dropped here by exact comparison.
  const eps = 0.05;
  return words
    .filter((word) => typeof word.start === "number" && typeof word.end === "number")
    .filter((word) => (word.end ?? 0) >= clipStart - eps && (word.start ?? 0) <= clipEnd + eps)
    .map((word) => {
      const startTime = Math.max(0, (word.start ?? 0) - clipStart);
      const endTime = Math.max(startTime + 1 / fps, (word.end ?? 0) - clipStart);
      const startFrame = Math.max(0, Math.floor(startTime * fps));
      const endFrame = Math.max(startFrame + 1, Math.ceil(endTime * fps));
      return {
        text: word.text ?? "",
        startFrame,
        endFrame,
        startTime,
        endTime,
      };
    });
}
