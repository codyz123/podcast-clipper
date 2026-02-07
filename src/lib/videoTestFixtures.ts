import {
  BackgroundConfig,
  CaptionStyle,
  Clip,
  SubtitleConfig,
  Track,
  VideoFormat,
  VideoTemplate,
  Word,
  CAPTION_PRESETS,
} from "./types";
import { toSubtitleConfig } from "./clipTransform";

export type VideoTestCase = {
  id: string;
  description: string;
  format: VideoFormat;
  frames: number[]; // seconds into clip
  clip: {
    startTime: number;
    endTime: number;
    words: Word[];
    captionStyle: CaptionStyle;
    background: BackgroundConfig;
    tracks?: Track[];
  };
  template?: {
    background?: BackgroundConfig;
    subtitle?: SubtitleConfig;
  };
};

const DEFAULT_BACKGROUND: BackgroundConfig = {
  type: "solid",
  color: "#111111",
};

const DEFAULT_SUBTITLE: SubtitleConfig = toSubtitleConfig({
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 48,
  fontWeight: 700,
  primaryColor: "#FFFFFF",
  highlightColor: "#FFD700",
  backgroundColor: "rgba(0,0,0,0.6)",
  position: "center",
  positionX: 50,
  positionY: 50,
  animation: "karaoke",
  wordsPerLine: 4,
});

const makeWordsFromText = (
  text: string,
  startTime: number,
  wordDuration: number,
  gap: number = 0.05
): Word[] => {
  const parts = text.trim().split(/\s+/);
  return parts.map((word, index) => {
    const wordStart = startTime + index * (wordDuration + gap);
    return {
      text: word,
      start: wordStart,
      end: wordStart + wordDuration,
      confidence: 0.99,
    };
  });
};

export const VIDEO_TEST_CASES: VideoTestCase[] = [
  {
    id: "hormozi-center",
    description: "Center captions with highlight and background box.",
    format: "9:16",
    frames: [1.2, 2.4, 3.6],
    clip: {
      startTime: 10,
      endTime: 22,
      words: makeWordsFromText("These are the words we want to highlight in the center", 10, 0.45),
      captionStyle: { ...CAPTION_PRESETS.hormozi, preset: "hormozi" },
      background: {
        type: "solid",
        color: "#0C0C0C",
      },
    },
  },
  {
    id: "tiktok-bottom",
    description: "Bottom captions with karaoke style and longer lines.",
    format: "9:16",
    frames: [0.8, 1.6, 2.4],
    clip: {
      startTime: 5,
      endTime: 15,
      words: makeWordsFromText(
        "This line should wrap across multiple rows in the preview",
        5,
        0.35
      ),
      captionStyle: { ...CAPTION_PRESETS["tiktok-default"], preset: "tiktok-default" },
      background: {
        type: "gradient",
        gradientColors: ["#1E3A8A", "#0F172A"],
        gradientDirection: 180,
      },
    },
  },
  {
    id: "typewriter-top",
    description: "Top captions with typewriter animation and tighter width.",
    format: "16:9",
    frames: [0.5, 1.5, 2.5],
    clip: {
      startTime: 0,
      endTime: 8,
      words: makeWordsFromText("Short clips still need accurate wrapping and timing", 0, 0.4),
      captionStyle: {
        ...CAPTION_PRESETS["clean-minimal"],
        position: "top",
        positionX: 50,
        positionY: 20,
        wordsPerLine: 3,
        preset: "clean-minimal",
      },
      background: {
        type: "solid",
        color: "#1B1B1B",
      },
    },
  },
];

export const buildVideoTestClip = (testCase: VideoTestCase): Clip => {
  const now = new Date().toISOString();
  return {
    id: `test-${testCase.id}`,
    projectId: "test-project",
    name: testCase.description,
    startTime: testCase.clip.startTime,
    endTime: testCase.clip.endTime,
    transcript: testCase.clip.words.map((word) => word.text).join(" "),
    words: testCase.clip.words,
    isManual: true,
    createdAt: now,
    captionStyle: testCase.clip.captionStyle,
    background: testCase.clip.background,
    subtitle: toSubtitleConfig(testCase.clip.captionStyle),
    tracks: testCase.clip.tracks ?? [],
    templateId: "test-template",
  };
};

export const buildVideoTestTemplate = (testCase: VideoTestCase): VideoTemplate => {
  return {
    id: "test-template",
    name: "Test Template",
    background: testCase.template?.background || testCase.clip.background || DEFAULT_BACKGROUND,
    subtitle:
      testCase.template?.subtitle ||
      toSubtitleConfig(testCase.clip.captionStyle) ||
      DEFAULT_SUBTITLE,
    isBuiltIn: true,
  };
};
