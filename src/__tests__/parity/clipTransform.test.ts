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
});
