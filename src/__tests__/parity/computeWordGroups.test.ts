import { describe, it, expect } from "vitest";
import {
  computeWordGroups,
  findGroupForWord,
  speakerBreakIndicesFromTimes,
} from "../../lib/computeWordGroups";

describe("computeWordGroups", () => {
  it("produces simple groups without breaks", () => {
    const groups = computeWordGroups(9, 4);
    expect(groups).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 8 },
      { start: 8, end: 9 },
    ]);
  });

  it("break aligns with natural boundary — same result as no break", () => {
    const groups = computeWordGroups(9, 4, [4]);
    expect(groups).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 8 },
      { start: 8, end: 9 },
    ]);
  });

  it("break mid-group forces split", () => {
    const groups = computeWordGroups(9, 4, [3]);
    expect(groups).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 7 },
      { start: 7, end: 9 },
    ]);
  });

  it("multiple breaks", () => {
    const groups = computeWordGroups(10, 5, [2, 7]);
    expect(groups).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 7 },
      { start: 7, end: 10 },
    ]);
  });

  it("break at 0 is ignored", () => {
    const withBreak = computeWordGroups(9, 4, [0]);
    const without = computeWordGroups(9, 4);
    expect(withBreak).toEqual(without);
  });

  it("empty words returns empty array", () => {
    expect(computeWordGroups(0, 4)).toEqual([]);
  });

  it("single word returns one group", () => {
    expect(computeWordGroups(1, 4)).toEqual([{ start: 0, end: 1 }]);
  });

  it("wordsPerGroup larger than total words", () => {
    expect(computeWordGroups(3, 10)).toEqual([{ start: 0, end: 3 }]);
  });

  it("respects wordsPerGroup within speaker runs", () => {
    // 12 words, speaker break at 5, wordsPerGroup=4
    // Speaker 1: words 0-4 (5 words) → [0,4], [4,5]
    // Speaker 2: words 5-11 (7 words) → [5,9], [9,12]
    const groups = computeWordGroups(12, 4, [5]);
    expect(groups).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 5 },
      { start: 5, end: 9 },
      { start: 9, end: 12 },
    ]);
  });
});

describe("findGroupForWord", () => {
  const groups = [
    { start: 0, end: 3 },
    { start: 3, end: 7 },
    { start: 7, end: 9 },
  ];

  it("finds group for word at start of group", () => {
    expect(findGroupForWord(groups, 0)).toEqual({ start: 0, end: 3 });
    expect(findGroupForWord(groups, 3)).toEqual({ start: 3, end: 7 });
    expect(findGroupForWord(groups, 7)).toEqual({ start: 7, end: 9 });
  });

  it("finds group for word in middle of group", () => {
    expect(findGroupForWord(groups, 1)).toEqual({ start: 0, end: 3 });
    expect(findGroupForWord(groups, 5)).toEqual({ start: 3, end: 7 });
    expect(findGroupForWord(groups, 8)).toEqual({ start: 7, end: 9 });
  });

  it("finds group for word at end of group (exclusive boundary)", () => {
    // Word 2 is in group [0,3), word 3 is in group [3,7)
    expect(findGroupForWord(groups, 2)).toEqual({ start: 0, end: 3 });
    expect(findGroupForWord(groups, 6)).toEqual({ start: 3, end: 7 });
  });

  it("returns null for out-of-range index", () => {
    expect(findGroupForWord(groups, -1)).toBeNull();
    expect(findGroupForWord(groups, 9)).toBeNull();
    expect(findGroupForWord(groups, 100)).toBeNull();
  });

  it("returns null for empty groups", () => {
    expect(findGroupForWord([], 0)).toBeNull();
  });
});

describe("speakerBreakIndicesFromTimes", () => {
  it("returns empty for single segment", () => {
    const segments = [{ startTime: 0, endTime: 5 }];
    const wordTimings = [{ startTime: 0 }, { startTime: 1 }, { startTime: 2 }];
    expect(speakerBreakIndicesFromTimes(segments, wordTimings, 0)).toEqual([]);
  });

  it("finds break index at speaker boundary", () => {
    const segments = [
      { startTime: 0, endTime: 2 },
      { startTime: 2.1, endTime: 5 },
    ];
    // Word timings relative to clip start (clipStartTime = 0)
    const wordTimings = [
      { startTime: 0 },
      { startTime: 0.5 },
      { startTime: 1.0 },
      { startTime: 1.5 },
      { startTime: 2.1 },
      { startTime: 3.0 },
    ];
    const breaks = speakerBreakIndicesFromTimes(segments, wordTimings, 0);
    expect(breaks).toEqual([4]);
  });

  it("handles clip start offset", () => {
    const segments = [
      { startTime: 10, endTime: 12 },
      { startTime: 12, endTime: 15 },
    ];
    // Word timings are relative to clip start
    const wordTimings = [
      { startTime: 0 },
      { startTime: 0.5 },
      { startTime: 1.0 },
      { startTime: 2.0 }, // This is at absolute time 12.0 (segment 2 start)
      { startTime: 3.0 },
    ];
    const breaks = speakerBreakIndicesFromTimes(segments, wordTimings, 10);
    expect(breaks).toEqual([3]);
  });

  it("returns empty for empty word timings", () => {
    const segments = [
      { startTime: 0, endTime: 2 },
      { startTime: 2, endTime: 5 },
    ];
    expect(speakerBreakIndicesFromTimes(segments, [], 0)).toEqual([]);
  });

  it("deduplicates break indices", () => {
    // Two segments starting at similar times should not produce duplicate breaks
    const segments = [
      { startTime: 0, endTime: 1 },
      { startTime: 1.0, endTime: 2 },
      { startTime: 2.0, endTime: 3 },
    ];
    const wordTimings = [{ startTime: 0 }, { startTime: 1.0 }, { startTime: 2.0 }];
    const breaks = speakerBreakIndicesFromTimes(segments, wordTimings, 0);
    expect(breaks).toEqual([1, 2]);
  });
});
