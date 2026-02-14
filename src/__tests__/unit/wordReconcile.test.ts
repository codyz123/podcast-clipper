import { describe, it, expect } from "vitest";
import { reconcileWords } from "../../lib/wordReconcile";
import type { Word } from "../../lib/types";

const w = (text: string, start: number, end: number, confidence = 0.9): Word => ({
  text,
  start,
  end,
  confidence,
});

describe("reconcileWords", () => {
  describe("empty inputs", () => {
    it("returns single empty-text word for empty newText with old words", () => {
      // "".trim().split(/\s+/) → [""] (one empty token), same count as old → 1:1
      const old = [w("hello", 0, 0.5)];
      const result = reconcileWords(old, "");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.5);
    });

    it("returns single empty-text word for whitespace-only newText with old words", () => {
      const old = [w("hello", 0, 0.5)];
      const result = reconcileWords(old, "   ");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("");
    });

    it("returns single empty-text word for empty newText with no old words", () => {
      // "".trim().split(/\s+/) → [""] (one empty token), no old words → synthetic word
      const result = reconcileWords([], "");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0);
      expect(result[0].confidence).toBe(0.5);
    });

    it("creates words with zero timings when oldWords is empty", () => {
      const result = reconcileWords([], "hello world");
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: "hello", start: 0, end: 0, confidence: 0.5 });
      expect(result[1]).toEqual({ text: "world", start: 0, end: 0, confidence: 0.5 });
    });
  });

  describe("same word count — 1:1 mapping", () => {
    it("replaces text while preserving timings exactly", () => {
      const old = [w("hello", 0, 0.5, 0.95), w("world", 0.5, 1.0, 0.85)];
      const result = reconcileWords(old, "goodbye earth");
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("goodbye");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.5);
      expect(result[0].confidence).toBe(0.95);
      expect(result[1].text).toBe("earth");
      expect(result[1].start).toBe(0.5);
      expect(result[1].end).toBe(1.0);
      expect(result[1].confidence).toBe(0.85);
    });

    it("handles single word replacement", () => {
      const old = [w("hello", 1.0, 1.5, 0.9)];
      const result = reconcileWords(old, "goodbye");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("goodbye");
      expect(result[0].start).toBe(1.0);
      expect(result[0].end).toBe(1.5);
    });

    it("handles punctuation changes keeping timings", () => {
      const old = [w("hello", 0, 0.5), w("world", 0.5, 1.0)];
      const result = reconcileWords(old, "Hello! World.");
      expect(result[0].text).toBe("Hello!");
      expect(result[0].start).toBe(0);
      expect(result[1].text).toBe("World.");
      expect(result[1].start).toBe(0.5);
    });
  });

  describe("merge detection", () => {
    it("merges two old words into one when normalized text matches", () => {
      const old = [
        w("I", 0, 0.3),
        w("have", 0.3, 0.6),
        w("5", 0.6, 0.8, 0.9),
        w("000", 0.8, 1.0, 0.8),
        w("dollars", 1.0, 1.4),
      ];
      const result = reconcileWords(old, "I have $5,000 dollars");
      expect(result).toHaveLength(4);
      expect(result[2].text).toBe("$5,000");
      expect(result[2].start).toBe(0.6); // start of "5"
      expect(result[2].end).toBe(1.0); // end of "000"
      expect(result[2].confidence).toBe(0.8); // min(0.9, 0.8)
    });

    it("merges three old words into one (NYC from New York City)", () => {
      const old = [
        w("New", 0, 0.3, 0.9),
        w("York", 0.3, 0.6, 0.85),
        w("City", 0.6, 0.9, 0.8),
        w("is", 0.9, 1.1),
        w("great", 1.1, 1.5),
      ];
      // normalize("NewYorkCity") === normalize("newyorkcity") === "newyorkcity"
      const result = reconcileWords(old, "NewYorkCity is great");
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe("NewYorkCity");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.9);
      expect(result[0].confidence).toBe(0.8); // min of all three
    });

    it("handles case-insensitive merge matching", () => {
      const old = [w("Hello", 0, 0.5, 0.9), w("World", 0.5, 1.0, 0.8)];
      // normalize("HelloWorld") = "helloworld", normalize("helloworld") = "helloworld"
      const result = reconcileWords(old, "helloworld");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("helloworld");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(1.0);
    });

    it("strips punctuation for merge matching", () => {
      const old = [w("can", 0, 0.3, 0.9), w("'t", 0.3, 0.5, 0.85)];
      // normalize("can") + normalize("'t") = "can" + "t" = "cant"
      // normalize("can't") = "cant"
      const result = reconcileWords(old, "can't");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("can't");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.5);
    });
  });

  describe("insertion at end", () => {
    it("appends extra tokens with synthetic timings", () => {
      const old = [w("hello", 0, 0.5)];
      const result = reconcileWords(old, "hello beautiful world");
      expect(result).toHaveLength(3);
      // First word: 1:1 from old
      expect(result[0].text).toBe("hello");
      expect(result[0].start).toBe(0);
      // Second word: insertion after first
      expect(result[1].text).toBe("beautiful");
      expect(result[1].start).toBe(0.5); // previous.end
      expect(result[1].end).toBe(0.7); // previous.end + 0.2
      expect(result[1].confidence).toBe(0.5);
      // Third word: insertion after second
      expect(result[2].text).toBe("world");
      expect(result[2].start).toBeCloseTo(0.7, 5);
      expect(result[2].end).toBeCloseTo(0.9, 5);
      expect(result[2].confidence).toBe(0.5);
    });
  });

  describe("deletion / fewer new tokens", () => {
    it("drops extra old words when new text has fewer tokens", () => {
      const old = [w("the", 0, 0.2), w("big", 0.2, 0.5), w("dog", 0.5, 0.8)];
      const result = reconcileWords(old, "a cat");
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("a");
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.2);
      expect(result[1].text).toBe("cat");
      expect(result[1].start).toBe(0.2);
      expect(result[1].end).toBe(0.5);
    });
  });

  describe("mixed operations", () => {
    it("handles merge + 1:1 replace in sequence", () => {
      // 3 old words, 2 new tokens → different count, triggers sequential alignment
      const old = [w("5", 0.2, 0.4, 0.9), w("000", 0.4, 0.6, 0.8), w("yeah", 0.6, 0.8, 0.85)];
      const result = reconcileWords(old, "$5,000 right");
      expect(result).toHaveLength(2);
      // "$5,000" → merge of "5"+"000" (normalize: "5"+"000"="5000" === "5000")
      expect(result[0].text).toBe("$5,000");
      expect(result[0].start).toBe(0.2);
      expect(result[0].end).toBe(0.6);
      expect(result[0].confidence).toBe(0.8); // min(0.9, 0.8)
      // "right" → 1:1 with "yeah"
      expect(result[1].text).toBe("right");
      expect(result[1].start).toBe(0.6);
      expect(result[1].end).toBe(0.8);
    });

    it("handles merge + insertion in sequence", () => {
      // 2 old words, 3 new tokens → different count
      const old = [w("5", 0.2, 0.4, 0.9), w("000", 0.4, 0.6, 0.8)];
      const result = reconcileWords(old, "$5,000 today extra");
      expect(result).toHaveLength(3);
      // "$5,000" → merge
      expect(result[0].text).toBe("$5,000");
      expect(result[0].start).toBe(0.2);
      expect(result[0].end).toBe(0.6);
      // "today" → insertion (no old words left)
      expect(result[1].text).toBe("today");
      expect(result[1].start).toBe(0.6);
      expect(result[1].end).toBeCloseTo(0.8, 5);
      expect(result[1].confidence).toBe(0.5);
      // "extra" → insertion
      expect(result[2].text).toBe("extra");
      expect(result[2].confidence).toBe(0.5);
    });

    it("produces result length matching new text token count", () => {
      const old = [w("a", 0, 0.3), w("b", 0.3, 0.6), w("c", 0.6, 0.9)];
      const newText = "x y z w v";
      const result = reconcileWords(old, newText);
      expect(result).toHaveLength(5);
    });

    it("produces monotonically non-decreasing start times", () => {
      const old = [
        w("the", 0, 0.2),
        w("quick", 0.2, 0.5),
        w("brown", 0.5, 0.8),
        w("fox", 0.8, 1.1),
      ];
      const result = reconcileWords(old, "a fast red fox jumps over");
      for (let i = 1; i < result.length; i++) {
        expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].start);
      }
    });
  });
});
