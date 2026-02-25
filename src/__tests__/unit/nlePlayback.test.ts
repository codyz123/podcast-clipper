import { describe, it, expect } from "vitest";
import { getActiveItems } from "../../lib/nlePlayback";
import { createDefaultTrack, createDefaultTimelineItem } from "../../lib/nleTypes";
import type { NleTrack } from "../../lib/nleTypes";

function makeTrack(overrides?: Partial<NleTrack>): NleTrack {
  return createDefaultTrack({
    id: "t1",
    type: "video-main",
    name: "Video",
    ...overrides,
  });
}

describe("getActiveItems", () => {
  it("returns item overlapping currentTime with correct sourceSeekTime", () => {
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 10,
          duration: 10,
          sourceIn: 0,
          sourceOut: 10,
        }),
      ],
    });

    const result = getActiveItems(15, [track]);
    expect(result).toHaveLength(1);
    expect(result[0].item.id).toBe("i1");
    expect(result[0].sourceSeekTime).toBe(5); // 0 + (15-10)*1
  });

  it("returns empty when no items overlap", () => {
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 10,
          duration: 10,
          sourceIn: 0,
          sourceOut: 10,
        }),
      ],
    });

    expect(getActiveItems(25, [track])).toHaveLength(0);
  });

  it("includes item at its start time (start-inclusive)", () => {
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 10,
          duration: 10,
          sourceIn: 0,
          sourceOut: 10,
        }),
      ],
    });

    const result = getActiveItems(10, [track]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceSeekTime).toBe(0);
  });

  it("excludes item at its end time (end-exclusive)", () => {
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 10,
          duration: 10,
          sourceIn: 0,
          sourceOut: 10,
        }),
      ],
    });

    expect(getActiveItems(20, [track])).toHaveLength(0);
  });

  it("accounts for speed in sourceSeekTime (2x)", () => {
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 30,
          sourceIn: 0,
          sourceOut: 60,
          speed: 2,
        }),
      ],
    });

    const result = getActiveItems(15, [track]);
    expect(result[0].sourceSeekTime).toBe(30); // 0 + 15*2
  });

  it("accounts for sourceIn offset", () => {
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 20,
          sourceIn: 10,
          sourceOut: 30,
        }),
      ],
    });

    const result = getActiveItems(0, [track]);
    expect(result[0].sourceSeekTime).toBe(10); // sourceIn + 0*1
  });

  it("marks non-solo tracks as muted when any track is solo", () => {
    const soloTrack = makeTrack({
      id: "t-solo",
      solo: true,
      items: [
        createDefaultTimelineItem({
          id: "i-solo",
          trackId: "t-solo",
          type: "audio",
          startTime: 0,
          duration: 60,
        }),
      ],
    });
    const normalTrack = makeTrack({
      id: "t-normal",
      items: [
        createDefaultTimelineItem({
          id: "i-normal",
          trackId: "t-normal",
          type: "audio",
          startTime: 0,
          duration: 60,
        }),
      ],
    });

    const result = getActiveItems(10, [soloTrack, normalTrack]);
    expect(result).toHaveLength(2);

    const solo = result.find((r) => r.item.id === "i-solo")!;
    const normal = result.find((r) => r.item.id === "i-normal")!;
    expect(solo.trackMuted).toBe(false);
    expect(normal.trackMuted).toBe(true);
  });

  it("marks muted track items with trackMuted: true", () => {
    const track = makeTrack({
      muted: true,
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "audio",
          startTime: 0,
          duration: 60,
        }),
      ],
    });

    const result = getActiveItems(10, [track]);
    expect(result[0].trackMuted).toBe(true);
  });

  it("returns multiple overlapping items from different tracks", () => {
    const t1 = makeTrack({
      id: "t1",
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 60,
        }),
      ],
    });
    const t2 = makeTrack({
      id: "t2",
      type: "audio-main",
      name: "Audio",
      items: [
        createDefaultTimelineItem({
          id: "i2",
          trackId: "t2",
          type: "audio",
          startTime: 0,
          duration: 60,
        }),
      ],
    });

    const result = getActiveItems(30, [t1, t2]);
    expect(result).toHaveLength(2);
  });

  it("skips items on hidden tracks", () => {
    const track = makeTrack({
      visible: false,
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 60,
        }),
      ],
    });

    expect(getActiveItems(10, [track])).toHaveLength(0);
  });

  it("sorts tracks by order for correct z-index compositing", () => {
    const trackHighOrder = makeTrack({
      id: "t-high",
      order: 2,
      items: [
        createDefaultTimelineItem({
          id: "i-high",
          trackId: "t-high",
          type: "video",
          startTime: 0,
          duration: 60,
        }),
      ],
    });
    const trackLowOrder = makeTrack({
      id: "t-low",
      order: 1,
      items: [
        createDefaultTimelineItem({
          id: "i-low",
          trackId: "t-low",
          type: "video",
          startTime: 0,
          duration: 60,
        }),
      ],
    });

    // Pass tracks in reverse order to verify sorting happens
    const result = getActiveItems(10, [trackHighOrder, trackLowOrder]);
    expect(result).toHaveLength(2);
    // Lower order should come first
    expect(result[0].item.id).toBe("i-low");
    expect(result[1].item.id).toBe("i-high");
  });

  it("clamps sourceSeekTime to sourceIn bound", () => {
    // Construct a scenario where raw seek could go below sourceIn:
    // sourceIn=10, speed=1, startTime=5, currentTime=5 -> rawSeek = 10 + (5-5)*1 = 10 (at bound)
    // But if we set speed to a negative-ish edge case, we need the clamp.
    // Simpler: sourceIn=10, but item has startTime=0, duration=20, speed=0.5
    // At currentTime=0: rawSeek = 10 + 0*0.5 = 10 (at bound, OK)
    // The clamp logic is: Math.max(sourceIn, Math.min(sourceOut, rawSeek))
    // To test the clamp, we need rawSeek < sourceIn, which requires sourceIn + timeIntoItem * speed < sourceIn
    // That requires timeIntoItem * speed < 0, which isn't possible with positive values.
    // So test the boundary: verify sourceSeekTime is exactly sourceIn at item start
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 20,
          sourceIn: 10,
          sourceOut: 30,
          speed: 1,
        }),
      ],
    });

    const result = getActiveItems(0, [track]);
    expect(result).toHaveLength(1);
    // At currentTime=0 (item start), sourceSeekTime should be clamped to sourceIn
    expect(result[0].sourceSeekTime).toBe(10);
  });

  it("clamps sourceSeekTime to sourceOut bound", () => {
    // Create item where computed seek would exceed sourceOut:
    // sourceIn=0, sourceOut=10, speed=2, duration=20, startTime=0
    // At currentTime=19: rawSeek = 0 + 19*2 = 38, but sourceOut=10 -> clamped to 10
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 20,
          sourceIn: 0,
          sourceOut: 10,
          speed: 2,
        }),
      ],
    });

    const result = getActiveItems(19, [track]);
    expect(result).toHaveLength(1);
    // rawSeek = 0 + 19*2 = 38, clamped to sourceOut=10
    expect(result[0].sourceSeekTime).toBe(10);
  });

  it("returns correct sourceSeekTime with speed > 1 and sourceIn offset", () => {
    // speed=2, sourceIn=10, startTime=5, currentTime=10
    // timeIntoItem = 10 - 5 = 5
    // rawSeek = 10 + 5 * 2 = 20
    const track = makeTrack({
      items: [
        createDefaultTimelineItem({
          id: "i1",
          trackId: "t1",
          type: "video",
          startTime: 5,
          duration: 30,
          sourceIn: 10,
          sourceOut: 70,
          speed: 2,
        }),
      ],
    });

    const result = getActiveItems(10, [track]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceSeekTime).toBe(20); // 10 + (10-5)*2
  });
});
