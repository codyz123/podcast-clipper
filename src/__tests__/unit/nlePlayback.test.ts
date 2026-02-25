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
});
