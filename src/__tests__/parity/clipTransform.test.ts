import { describe, it, expect } from "vitest";
import {
  resolveCaptionStyle,
  toSubtitleConfig,
  toWordTimings,
  CANONICAL_DEFAULTS,
} from "../../lib/clipTransform";

describe("clipTransform", () => {
  describe("resolveCaptionStyle", () => {
    it("uses clip.captionStyle when present", () => {
      const clip = {
        captionStyle: { wordsPerLine: 5 },
        tracks: [{ type: "captions", captionStyle: { wordsPerLine: 2 } }],
      };
      expect(resolveCaptionStyle(clip).wordsPerLine).toBe(5);
    });

    it("falls back to captions track style", () => {
      const clip = {
        tracks: [{ type: "captions", captionStyle: { wordsPerLine: 6 } }],
      };
      expect(resolveCaptionStyle(clip).wordsPerLine).toBe(6);
    });

    it("falls back to default preset", () => {
      const clip = {};
      expect(resolveCaptionStyle(clip).preset).toBe("hormozi");
    });
  });

  describe("toSubtitleConfig", () => {
    it("maps word-by-word to karaoke with no scale", () => {
      const config = toSubtitleConfig({ animation: "word-by-word" });
      expect(config.animation).toBe("karaoke");
      expect(config.highlightScale).toBe(0);
    });

    it("maps bounce to pop", () => {
      const config = toSubtitleConfig({ animation: "bounce" });
      expect(config.animation).toBe("pop");
    });

    it("uses canonical defaults for missing values", () => {
      const config = toSubtitleConfig({});
      expect(config.wordsPerGroup).toBe(CANONICAL_DEFAULTS.wordsPerGroup);
      expect(config.positionX).toBe(CANONICAL_DEFAULTS.positionX);
    });
  });

  describe("toWordTimings", () => {
    it("filters words outside clip range", () => {
      const timings = toWordTimings(
        [
          { text: "before", start: 0, end: 1 },
          { text: "inside", start: 5, end: 6 },
          { text: "after", start: 15, end: 16 },
        ],
        4,
        10,
        30
      );
      expect(timings).toHaveLength(1);
      expect(timings[0].text).toBe("inside");
    });

    it("ensures minimum 1-frame duration", () => {
      const timings = toWordTimings([{ text: "quick", start: 5, end: 5.01 }], 5, 6, 30);
      expect(timings[0].endFrame - timings[0].startFrame).toBeGreaterThanOrEqual(1);
    });
  });

  describe("toWordTimings — eps tolerance at clip boundaries", () => {
    // Regression tests for the caption word inclusion bug.
    // toWordTimings must use the same eps=0.05s tolerance as episodeToProject
    // and handleBoundaryChange, otherwise words at clip edges get dropped.
    const words = [
      { text: "before", start: 3.9, end: 3.97 }, // ends 0.03s before clipStart=4.0 → within eps
      { text: "first", start: 4.0, end: 4.5 }, // exactly at clip start
      { text: "middle", start: 5.0, end: 5.5 },
      { text: "last", start: 9.5, end: 10.0 }, // exactly at clip end
      { text: "after", start: 10.03, end: 10.5 }, // starts 0.03s after clipEnd=10.0 → within eps
      { text: "far", start: 11.0, end: 11.5 }, // well outside
    ];

    it("includes a word whose end is within eps of clipStart", () => {
      // word.end=3.97, clipStart=4.0: 3.97 >= 4.0 - 0.05 = 3.95 → true
      const result = toWordTimings(words, 4.0, 10.0, 30);
      expect(result.some((w) => w.text === "before")).toBe(true);
    });

    it("includes a word whose start is within eps of clipEnd", () => {
      // word.start=10.03, clipEnd=10.0: 10.03 <= 10.0 + 0.05 = 10.05 → true
      const result = toWordTimings(words, 4.0, 10.0, 30);
      expect(result.some((w) => w.text === "after")).toBe(true);
    });

    it("excludes words well outside the range", () => {
      const result = toWordTimings(words, 4.0, 10.0, 30);
      expect(result.some((w) => w.text === "far")).toBe(false);
    });

    it("includes words exactly at boundaries without needing eps", () => {
      const result = toWordTimings(words, 4.0, 10.0, 30);
      expect(result.some((w) => w.text === "first")).toBe(true);
      expect(result.some((w) => w.text === "last")).toBe(true);
    });

    it("clamps startTime to 0 for words before clip start", () => {
      // "before" starts at 3.90, clip starts at 4.0 → startTime = max(0, 3.90-4.0) = 0
      const result = toWordTimings(words, 4.0, 10.0, 30);
      const before = result.find((w) => w.text === "before")!;
      expect(before.startTime).toBe(0);
    });

    it("excludes words whose end is beyond eps of clipStart", () => {
      // word ends at 3.90 → 3.90 >= 4.0 - 0.05 = 3.95? No → excluded
      const edgeWords = [{ text: "too-early", start: 3.8, end: 3.9 }];
      const result = toWordTimings(edgeWords, 4.0, 10.0, 30);
      expect(result).toHaveLength(0);
    });

    it("excludes words whose start is beyond eps of clipEnd", () => {
      // word starts at 10.06 → 10.06 <= 10.0 + 0.05 = 10.05? No → excluded
      const edgeWords = [{ text: "too-late", start: 10.06, end: 10.5 }];
      const result = toWordTimings(edgeWords, 4.0, 10.0, 30);
      expect(result).toHaveLength(0);
    });
  });
});
