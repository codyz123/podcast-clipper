import { describe, it, expect } from "vitest";
import {
  resolveVideoSourceForSpeaker,
  resolveActiveSource,
  computeSwitchingTimeline,
  applyPreRoll,
  toFrameTimeline,
  getVideoSeekTime,
  computeLayout,
  computeCropPosition,
  getAvailableLayoutModes,
  type VideoSourceLike,
  type SpeakerSegmentLike,
} from "../../../shared/multicamTransform";

// ---- Fixtures ----

function mkSource(
  overrides: Partial<VideoSourceLike> & { id: string; label: string }
): VideoSourceLike {
  return {
    sourceType: "speaker",
    personId: null,
    syncOffsetMs: 0,
    cropOffsetX: 50,
    cropOffsetY: 50,
    displayOrder: 0,
    ...overrides,
  };
}

const ALICE = mkSource({ id: "cam-a", label: "Alice", personId: "person-1", displayOrder: 0 });
const BOB = mkSource({ id: "cam-b", label: "Bob", personId: "person-2", displayOrder: 1 });
const WIDE = mkSource({ id: "wide", label: "Wide", sourceType: "wide", displayOrder: 2 });
const BROLL = mkSource({ id: "broll", label: "B-Roll", sourceType: "broll", displayOrder: 3 });
const SOURCES = [ALICE, BOB, WIDE];

// Alice 0-5, Bob 5-10, gap 10-12, Alice 12-18
const SEGMENTS: SpeakerSegmentLike[] = [
  { speakerLabel: "Alice", speakerId: "person-1", startTime: 0, endTime: 5 },
  { speakerLabel: "Bob", speakerId: "person-2", startTime: 5, endTime: 10 },
  { speakerLabel: "Alice", speakerId: "person-1", startTime: 12, endTime: 18 },
];

// ---- Tests ----

describe("resolveVideoSourceForSpeaker", () => {
  it("matches by speakerId → personId (highest priority)", () => {
    // Label is wrong but speakerId matches person-1 → Alice's camera
    expect(resolveVideoSourceForSpeaker("Wrong Label", SOURCES, "person-1")).toBe("cam-a");
  });

  it("matches by exact label when no speakerId", () => {
    expect(resolveVideoSourceForSpeaker("Alice", SOURCES)).toBe("cam-a");
  });

  it("matches case-insensitively", () => {
    expect(resolveVideoSourceForSpeaker("alice", SOURCES)).toBe("cam-a");
    expect(resolveVideoSourceForSpeaker("ALICE", SOURCES)).toBe("cam-a");
  });

  it("falls back to non-speaker source type if label matches", () => {
    expect(resolveVideoSourceForSpeaker("Wide", [WIDE])).toBe("wide");
  });

  it("returns null when nothing matches", () => {
    expect(resolveVideoSourceForSpeaker("Unknown", SOURCES)).toBeNull();
  });

  it("prefers speaker sourceType over non-speaker with same label", () => {
    const speakerAlice = mkSource({ id: "alice-speaker", label: "Alice", sourceType: "speaker" });
    const wideAlice = mkSource({ id: "alice-wide", label: "Alice", sourceType: "wide" });
    expect(resolveVideoSourceForSpeaker("Alice", [wideAlice, speakerAlice])).toBe("alice-speaker");
  });
});

describe("resolveActiveSource", () => {
  describe("override priority", () => {
    const overrideConfig = {
      overrides: [{ startTime: 2, endTime: 4, activeVideoSourceId: "cam-b" }],
    };

    it("returns override source when time is within override range", () => {
      expect(resolveActiveSource(3, SEGMENTS, SOURCES, overrideConfig)).toBe("cam-b");
    });

    it("uses override at exact startTime (inclusive)", () => {
      expect(resolveActiveSource(2.0, SEGMENTS, SOURCES, overrideConfig)).toBe("cam-b");
    });

    it("does NOT use override at exact endTime (exclusive)", () => {
      // t=4.0 is past override [2,4), falls back to segment (Alice at 0-5)
      expect(resolveActiveSource(4.0, SEGMENTS, SOURCES, overrideConfig)).toBe("cam-a");
    });

    it("override wins even during active segment for different speaker", () => {
      // Alice is speaking at t=3, but override says show Bob
      expect(resolveActiveSource(3, SEGMENTS, SOURCES, overrideConfig)).toBe("cam-b");
    });
  });

  describe("single source", () => {
    it("always returns the sole source regardless of segments", () => {
      expect(resolveActiveSource(0, [], [ALICE], {})).toBe("cam-a");
      expect(resolveActiveSource(100, SEGMENTS, [ALICE], {})).toBe("cam-a");
    });
  });

  describe("segment-based resolution", () => {
    it("returns correct source when Alice is active", () => {
      expect(resolveActiveSource(2.5, SEGMENTS, SOURCES, {})).toBe("cam-a");
    });

    it("returns correct source when Bob is active", () => {
      expect(resolveActiveSource(7.0, SEGMENTS, SOURCES, {})).toBe("cam-b");
    });

    it("holds previous speaker during gap within holdMs", () => {
      // Gap 10-12, holdMs=1500ms → holds Bob until t=11.5
      expect(resolveActiveSource(10.5, SEGMENTS, SOURCES, { holdPreviousMs: 1500 })).toBe("cam-b");
    });

    it("falls back to default after holdMs expires", () => {
      // At t=11.8, gap started at 10.0, 1.8s > 1.5s holdMs
      expect(
        resolveActiveSource(11.8, SEGMENTS, SOURCES, {
          holdPreviousMs: 1500,
          defaultVideoSourceId: "wide",
        })
      ).toBe("wide");
    });
  });

  describe("fallback chain", () => {
    it("uses defaultVideoSourceId when no segments match", () => {
      expect(resolveActiveSource(20, SEGMENTS, SOURCES, { defaultVideoSourceId: "wide" })).toBe(
        "wide"
      );
    });

    it("uses first source when no default and no segments", () => {
      expect(resolveActiveSource(20, [], SOURCES, {})).toBe("cam-a");
    });

    it("uses order-based mapping when labels don't match any source", () => {
      // Segments use "Speaker A" and "Speaker B" which don't match source labels
      const segs: SpeakerSegmentLike[] = [
        { speakerLabel: "Speaker A", startTime: 0, endTime: 5 },
        { speakerLabel: "Speaker B", startTime: 5, endTime: 10 },
      ];
      // Order-based: first unique speaker → first source (cam-a), second → cam-b
      expect(resolveActiveSource(2, segs, [ALICE, BOB], {})).toBe("cam-a");
      expect(resolveActiveSource(7, segs, [ALICE, BOB], {})).toBe("cam-b");
    });
  });
});

describe("computeSwitchingTimeline", () => {
  it("produces contiguous intervals covering full clip range", () => {
    const tl = computeSwitchingTimeline(0, 18, SEGMENTS, SOURCES, {});
    expect(tl[0].startTime).toBe(0);
    expect(tl[tl.length - 1].endTime).toBe(18);
    // Verify no gaps between intervals
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i].startTime).toBeCloseTo(tl[i - 1].endTime, 1);
    }
  });

  it("assigns correct sources to intervals", () => {
    const tl = computeSwitchingTimeline(0, 18, SEGMENTS, SOURCES, {});
    // First interval should be Alice's camera
    expect(tl[0].videoSourceId).toBe("cam-a");
  });

  it("absorbs short segments into neighbors (minShotDuration)", () => {
    const shortSegs: SpeakerSegmentLike[] = [
      { speakerLabel: "Alice", speakerId: "person-1", startTime: 0, endTime: 5 },
      { speakerLabel: "Bob", speakerId: "person-2", startTime: 5, endTime: 5.5 }, // 0.5s < 1.5s min
      { speakerLabel: "Alice", speakerId: "person-1", startTime: 5.5, endTime: 10 },
    ];
    const tl = computeSwitchingTimeline(0, 10, shortSegs, SOURCES, {
      minShotDurationMs: 1500,
    });
    // Bob's 0.5s segment should be absorbed → all Alice
    expect(tl.every((i) => i.videoSourceId === "cam-a")).toBe(true);
  });

  it("integrates overrides into timeline", () => {
    const overrides = [{ startTime: 2, endTime: 4, activeVideoSourceId: "cam-b" }];
    const tl = computeSwitchingTimeline(0, 10, SEGMENTS, SOURCES, { overrides });
    // Should have an interval showing cam-b during the override period
    const overrideInterval = tl.find((i) => i.startTime <= 2.1 && i.endTime >= 3.9);
    expect(overrideInterval?.videoSourceId).toBe("cam-b");
  });

  it("returns single fallback interval for single source with no segments", () => {
    const tl = computeSwitchingTimeline(0, 10, [], [ALICE], {});
    expect(tl).toHaveLength(1);
    expect(tl[0]).toEqual({ startTime: 0, endTime: 10, videoSourceId: "cam-a" });
  });

  it("handles sub-clip ranges correctly", () => {
    // Clip only covers 6-9 (within Bob's segment 5-10)
    const tl = computeSwitchingTimeline(6, 9, SEGMENTS, SOURCES, {});
    expect(tl[0].startTime).toBe(6);
    expect(tl[tl.length - 1].endTime).toBe(9);
    expect(tl[0].videoSourceId).toBe("cam-b");
  });
});

describe("applyPreRoll", () => {
  it("returns unchanged for single interval", () => {
    const tl = [{ startTime: 0, endTime: 10, videoSourceId: "cam-a" }];
    expect(applyPreRoll(tl, 0.3)).toEqual(tl);
  });

  it("returns unchanged for empty timeline", () => {
    expect(applyPreRoll([], 0.3)).toEqual([]);
  });

  it("returns unchanged when preRollSeconds is 0", () => {
    const tl = [
      { startTime: 0, endTime: 5, videoSourceId: "cam-a" },
      { startTime: 5, endTime: 10, videoSourceId: "cam-b" },
    ];
    expect(applyPreRoll(tl, 0)).toEqual(tl);
  });

  it("shifts second interval start earlier by preRollSeconds", () => {
    const tl = [
      { startTime: 0, endTime: 5, videoSourceId: "cam-a" },
      { startTime: 5, endTime: 10, videoSourceId: "cam-b" },
    ];
    const result = applyPreRoll(tl, 0.3);
    expect(result[1].startTime).toBeCloseTo(4.7, 1);
    expect(result[0].endTime).toBeCloseTo(4.7, 1);
  });

  it("limits pre-roll to 30% of previous interval duration", () => {
    const tl = [
      { startTime: 0, endTime: 0.5, videoSourceId: "cam-a" }, // 0.5s duration
      { startTime: 0.5, endTime: 5, videoSourceId: "cam-b" },
    ];
    const result = applyPreRoll(tl, 0.3);
    // 30% of 0.5s = 0.15s, less than 0.3s requested
    expect(result[1].startTime).toBeCloseTo(0.35, 1);
  });

  it("preserves at least 100ms of previous interval", () => {
    const tl = [
      { startTime: 0, endTime: 0.2, videoSourceId: "cam-a" }, // 0.2s
      { startTime: 0.2, endTime: 5, videoSourceId: "cam-b" },
    ];
    const result = applyPreRoll(tl, 0.3);
    // Must keep at least 100ms → prev.endTime >= prev.startTime + 0.1
    expect(result[0].endTime).toBeGreaterThanOrEqual(0.1);
  });

  it("maintains contiguous timeline after pre-roll", () => {
    const tl = [
      { startTime: 0, endTime: 3, videoSourceId: "cam-a" },
      { startTime: 3, endTime: 6, videoSourceId: "cam-b" },
      { startTime: 6, endTime: 10, videoSourceId: "cam-a" },
    ];
    const result = applyPreRoll(tl, 0.3);
    // Each interval's end should match next's start
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].endTime).toBeCloseTo(result[i + 1].startTime, 5);
    }
  });
});

describe("toFrameTimeline", () => {
  it.each([
    {
      desc: "basic 5s interval at 30fps",
      interval: { startTime: 10, endTime: 15, videoSourceId: "a" },
      clipStart: 10,
      fps: 30,
      expected: { startFrame: 0, endFrame: 150, videoSourceId: "a" },
    },
    {
      desc: "fractional times at 30fps",
      interval: { startTime: 10.033, endTime: 10.066, videoSourceId: "a" },
      clipStart: 10,
      fps: 30,
      expected: { startFrame: 0, endFrame: 2, videoSourceId: "a" },
    },
    {
      desc: "non-zero clipStart at 24fps",
      interval: { startTime: 5, endTime: 6, videoSourceId: "a" },
      clipStart: 0,
      fps: 24,
      expected: { startFrame: 120, endFrame: 144, videoSourceId: "a" },
    },
  ])("$desc", ({ interval, clipStart, fps, expected }) => {
    expect(toFrameTimeline([interval], clipStart, fps)[0]).toEqual(expected);
  });

  it("handles multiple intervals", () => {
    const intervals = [
      { startTime: 0, endTime: 1, videoSourceId: "a" },
      { startTime: 1, endTime: 2, videoSourceId: "b" },
    ];
    const result = toFrameTimeline(intervals, 0, 30);
    expect(result).toHaveLength(2);
    expect(result[0].startFrame).toBe(0);
    expect(result[0].endFrame).toBe(30);
    expect(result[1].startFrame).toBe(30);
    expect(result[1].endFrame).toBe(60);
  });
});

describe("getVideoSeekTime", () => {
  it.each([
    [10, 0, 10],
    [10, 500, 10.5],
    [10, -500, 9.5],
    [0.3, -1000, 0], // clamped to 0
    [0, 0, 0],
  ] as [number, number, number][])(
    "getVideoSeekTime(%s, %s) → %s",
    (absTime, offsetMs, expected) => {
      expect(getVideoSeekTime(absTime, offsetMs)).toBeCloseTo(expected, 5);
    }
  );
});

describe("computeLayout", () => {
  describe("solo mode", () => {
    it("shows only active source, hides others", () => {
      const layouts = computeLayout(SOURCES, "cam-a", "solo", false, [], 0.2);
      expect(layouts.find((l) => l.sourceId === "cam-a")!.visible).toBe(true);
      expect(layouts.find((l) => l.sourceId === "cam-b")!.visible).toBe(false);
      expect(layouts.find((l) => l.sourceId === "wide")!.visible).toBe(false);
    });

    it("active source is full-screen at center", () => {
      const layouts = computeLayout(SOURCES, "cam-a", "solo", false, [], 0.2);
      const active = layouts.find((l) => l.sourceId === "cam-a")!;
      expect(active).toMatchObject({ x: 50, y: 50, width: 100, height: 100, zIndex: 1 });
    });
  });

  describe("active-speaker mode", () => {
    it("active source is full-screen, others hidden", () => {
      const layouts = computeLayout(SOURCES, "cam-a", "active-speaker", false, [], 0.2);
      const active = layouts.find((l) => l.sourceId === "cam-a")!;
      expect(active).toMatchObject({ visible: true, width: 100, height: 100, zIndex: 1 });
      const inactive = layouts.find((l) => l.sourceId === "cam-b")!;
      expect(inactive.visible).toBe(false);
    });

    it("shows PiP for inactive source when pipEnabled", () => {
      const pipPositions = [{ videoSourceId: "cam-b", positionX: 80, positionY: 20 }];
      const layouts = computeLayout(SOURCES, "cam-a", "active-speaker", true, pipPositions, 0.25);
      const pip = layouts.find((l) => l.sourceId === "cam-b")!;
      expect(pip).toMatchObject({
        visible: true,
        x: 80,
        y: 20,
        width: 25, // pipScale * 100
        height: 25,
        zIndex: 2, // PiP on top of active speaker
      });
    });

    it("hides inactive sources without PiP position", () => {
      const pipPositions = [{ videoSourceId: "cam-b", positionX: 80, positionY: 20 }];
      const layouts = computeLayout(SOURCES, "cam-a", "active-speaker", true, pipPositions, 0.25);
      // WIDE has no PiP position → should be hidden
      const wide = layouts.find((l) => l.sourceId === "wide")!;
      expect(wide.visible).toBe(false);
    });
  });

  describe("side-by-side mode", () => {
    it("positions two non-broll sources at 25% and 75%", () => {
      const layouts = computeLayout([ALICE, BOB, BROLL], "cam-a", "side-by-side", false, [], 0.2);
      const left = layouts.find((l) => l.sourceId === "cam-a")!;
      const right = layouts.find((l) => l.sourceId === "cam-b")!;
      expect(left).toMatchObject({ x: 25, width: 50, visible: true });
      expect(right).toMatchObject({ x: 75, width: 50, visible: true });
    });

    it("excludes broll sources from visible layout", () => {
      const layouts = computeLayout([ALICE, BOB, BROLL], "cam-a", "side-by-side", false, [], 0.2);
      expect(layouts.find((l) => l.sourceId === "broll")!.visible).toBe(false);
    });
  });

  describe("grid mode", () => {
    it("places 4 sources in 2x2 grid", () => {
      const four = [ALICE, BOB, WIDE, mkSource({ id: "d", label: "D", displayOrder: 3 })];
      const layouts = computeLayout(four, "cam-a", "grid", false, [], 0.2);
      // cols=2, rows=2, cellW=50, cellH=50
      const alice = layouts.find((l) => l.sourceId === "cam-a")!;
      expect(alice).toMatchObject({ x: 25, y: 25, width: 50, height: 50, visible: true });
      const bob = layouts.find((l) => l.sourceId === "cam-b")!;
      expect(bob).toMatchObject({ x: 75, y: 25, width: 50, height: 50, visible: true });
      const wide = layouts.find((l) => l.sourceId === "wide")!;
      expect(wide).toMatchObject({ x: 25, y: 75, width: 50, height: 50, visible: true });
      const d = layouts.find((l) => l.sourceId === "d")!;
      expect(d).toMatchObject({ x: 75, y: 75, width: 50, height: 50, visible: true });
    });

    it("excludes broll from grid", () => {
      const sources = [ALICE, BOB, BROLL];
      const layouts = computeLayout(sources, "cam-a", "grid", false, [], 0.2);
      expect(layouts.find((l) => l.sourceId === "broll")!.visible).toBe(false);
    });

    it("returns a layout entry for every source", () => {
      const layouts = computeLayout(SOURCES, "cam-a", "grid", false, [], 0.2);
      expect(layouts).toHaveLength(SOURCES.length);
    });
  });
});

describe("computeCropPosition", () => {
  it("returns 50% 50% when aspect ratios match", () => {
    expect(computeCropPosition(1920, 1080, 16 / 9, 50, 50)).toEqual({
      objectPosition: "50% 50%",
    });
  });

  it("uses crop offsets when aspects differ", () => {
    expect(computeCropPosition(1920, 1080, 1, 30, 70)).toEqual({
      objectPosition: "30% 70%",
    });
  });

  it("treats near-equal aspects (within 0.01) as matching", () => {
    // 1920/1080 = 1.7778, target = 1.78 → diff ≈ 0.002 < 0.01
    expect(computeCropPosition(1920, 1080, 1.78, 30, 70)).toEqual({
      objectPosition: "50% 50%",
    });
  });
});

describe("getAvailableLayoutModes", () => {
  it.each([
    { desc: "0 sources", sources: [] as VideoSourceLike[], expected: ["solo"] },
    { desc: "1 speaker", sources: [ALICE], expected: ["solo"] },
    {
      desc: "2 speakers",
      sources: [ALICE, BOB],
      expected: ["active-speaker", "side-by-side", "solo"],
    },
    {
      desc: "3 non-broll",
      sources: [ALICE, BOB, WIDE],
      expected: ["active-speaker", "side-by-side", "grid", "solo"],
    },
    { desc: "1 speaker + 1 broll", sources: [ALICE, BROLL], expected: ["solo"] },
    {
      desc: "2 speakers + 1 broll",
      sources: [ALICE, BOB, BROLL],
      expected: ["active-speaker", "side-by-side", "solo"],
    },
  ])("returns correct modes for $desc", ({ sources, expected }) => {
    expect(getAvailableLayoutModes(sources)).toEqual(expected);
  });
});
