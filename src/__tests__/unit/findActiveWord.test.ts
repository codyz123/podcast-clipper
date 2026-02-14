import { describe, it, expect } from "vitest";
import { findActiveWord } from "../../lib/findActiveWord";
import type { Word } from "../../lib/types";

const w = (text: string, start: number, end: number): Word => ({
  text,
  start,
  end,
  confidence: 1,
});

describe("findActiveWord", () => {
  describe("basic cases", () => {
    it("returns -1 for empty array", () => {
      expect(findActiveWord([], 5)).toBe(-1);
    });

    it("returns -1 when time is before the first word", () => {
      const words = [w("hello", 1.0, 1.5)];
      expect(findActiveWord(words, 0.5)).toBe(-1);
    });

    it("returns 0 when time is exactly at first word start", () => {
      const words = [w("hello", 1.0, 1.5), w("world", 2.0, 2.5)];
      expect(findActiveWord(words, 1.0)).toBe(0);
    });

    it("returns correct index for time in the middle of a word", () => {
      const words = [w("a", 1.0, 1.5), w("b", 2.0, 2.5), w("c", 3.0, 3.5)];
      expect(findActiveWord(words, 2.25)).toBe(1);
    });

    it("returns last index when time is at the last word's end boundary", () => {
      const words = [w("a", 1.0, 1.5), w("b", 2.0, 2.5)];
      // time=2.5 is within 0.001 tolerance of word[1].end
      expect(findActiveWord(words, 2.5)).toBe(1);
    });
  });

  describe("binary search correctness", () => {
    it("finds the correct word among 100 sequential words", () => {
      const words = Array.from({ length: 100 }, (_, i) => w(`word${i}`, i * 0.5, i * 0.5 + 0.4));

      // Query midpoint of each word
      for (let i = 0; i < 100; i++) {
        const midpoint = i * 0.5 + 0.2;
        expect(findActiveWord(words, midpoint)).toBe(i);
      }
    });

    it("finds first and last words correctly", () => {
      const words = Array.from({ length: 100 }, (_, i) => w(`word${i}`, i * 0.5, i * 0.5 + 0.4));
      expect(findActiveWord(words, 0.1)).toBe(0);
      expect(findActiveWord(words, 49.7)).toBe(99);
    });
  });

  describe("gap handling", () => {
    it("stays on current word before midpoint of a small gap", () => {
      const words = [w("a", 1.0, 1.5), w("b", 2.0, 2.5)];
      // gap = 2.0 - 1.5 = 0.5s (< 1s), midpoint = (1.5 + 2.0) / 2 = 1.75
      expect(findActiveWord(words, 1.74)).toBe(0);
    });

    it("jumps to next word at midpoint of a small gap", () => {
      const words = [w("a", 1.0, 1.5), w("b", 2.0, 2.5)];
      expect(findActiveWord(words, 1.75)).toBe(1);
    });

    it("jumps to next word after midpoint of a small gap", () => {
      const words = [w("a", 1.0, 1.5), w("b", 2.0, 2.5)];
      expect(findActiveWord(words, 1.76)).toBe(1);
    });

    it("returns -1 for a large gap (> 1s)", () => {
      const words = [w("a", 1.0, 1.5), w("b", 3.0, 3.5)];
      // gap = 3.0 - 1.5 = 1.5s (> 1s) → long silence, drop highlight
      expect(findActiveWord(words, 2.0)).toBe(-1);
    });

    it("returns -1 for gap exactly at 1s boundary (strict >1)", () => {
      const words = [w("a", 1.0, 1.5), w("b", 2.5, 3.0)];
      // gap = 2.5 - 1.5 = 1.0s — condition is gap > 1, so exactly 1 is NOT a long gap
      // midpoint = (1.5 + 2.5) / 2 = 2.0
      expect(findActiveWord(words, 2.0)).toBe(1); // at midpoint → next
      expect(findActiveWord(words, 1.9)).toBe(0); // before midpoint → current
    });

    it("returns -1 when past the last word with no next word", () => {
      const words = [w("a", 1.0, 1.5)];
      expect(findActiveWord(words, 2.0)).toBe(-1);
    });
  });

  describe("duplicate start times", () => {
    it("selects earliest word whose end includes the time", () => {
      const words = [w("first", 5.0, 5.2), w("second", 5.0, 5.4)];
      // time=5.1 is within first's end (5.2 + 0.001)
      expect(findActiveWord(words, 5.1)).toBe(0);
    });

    it("selects the second word when time exceeds first's end", () => {
      const words = [w("first", 5.0, 5.1), w("second", 5.0, 5.4)];
      // time=5.15 is past first's end (5.1) but within second's end (5.4)
      expect(findActiveWord(words, 5.15)).toBe(1);
    });

    it("handles three words with same start time", () => {
      const words = [w("a", 5.0, 5.1), w("b", 5.0, 5.2), w("c", 5.0, 5.5)];
      expect(findActiveWord(words, 5.05)).toBe(0); // within a's end
      expect(findActiveWord(words, 5.15)).toBe(1); // within b's end
      expect(findActiveWord(words, 5.3)).toBe(2); // within c's end
    });
  });

  describe("effective end fallback", () => {
    it("uses next word's start when word.end is 0", () => {
      const words = [{ text: "a", start: 1.0, end: 0, confidence: 1 }, w("b", 1.5, 2.0)];
      // effective end of word[0] = next.start = 1.5
      // time=1.2 is within [1.0, 1.5)
      expect(findActiveWord(words, 1.2)).toBe(0);
    });

    it("uses next word's start when word.end equals word.start", () => {
      const words = [{ text: "a", start: 1.0, end: 1.0, confidence: 1 }, w("b", 1.5, 2.0)];
      // effective end = next.start = 1.5
      expect(findActiveWord(words, 1.2)).toBe(0);
    });

    it("falls back to start + 0.12 for last word with invalid end", () => {
      const words = [{ text: "only", start: 1.0, end: 0, confidence: 1 }];
      // effective end = 1.0 + 0.12 = 1.12
      expect(findActiveWord(words, 1.1)).toBe(0);
      expect(findActiveWord(words, 1.2)).toBe(-1); // past effective end, no next word
    });

    it("falls back when word.end is NaN", () => {
      const words = [{ text: "a", start: 1.0, end: NaN, confidence: 1 }, w("b", 1.5, 2.0)];
      // NaN is not finite → falls back to next.start = 1.5
      expect(findActiveWord(words, 1.2)).toBe(0);
    });
  });
});
