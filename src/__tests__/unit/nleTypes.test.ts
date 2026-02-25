import { describe, it, expect } from "vitest";
import {
  createDefaultTimelineItem,
  createDefaultTrack,
  createDefaultTimeline,
} from "../../lib/nleTypes";

describe("createDefaultTimelineItem", () => {
  it("applies correct defaults with only required fields", () => {
    const item = createDefaultTimelineItem({
      id: "item-1",
      trackId: "track-1",
      type: "video",
    });

    expect(item.id).toBe("item-1");
    expect(item.trackId).toBe("track-1");
    expect(item.type).toBe("video");
    expect(item.startTime).toBe(0);
    expect(item.duration).toBe(0);
    expect(item.sourceIn).toBe(0);
    expect(item.sourceOut).toBe(0);
    expect(item.positionX).toBe(50);
    expect(item.positionY).toBe(50);
    expect(item.scale).toBe(1);
    expect(item.rotation).toBe(0);
    expect(item.opacity).toBe(1);
    expect(item.volume).toBe(1);
    expect(item.fadeIn).toBe(0);
    expect(item.fadeOut).toBe(0);
    expect(item.speed).toBe(1);
  });

  it("respects overrides without clobbering other defaults", () => {
    const item = createDefaultTimelineItem({
      id: "item-2",
      trackId: "track-1",
      type: "audio",
      duration: 30,
      volume: 0.5,
      startTime: 10,
    });

    expect(item.duration).toBe(30);
    expect(item.volume).toBe(0.5);
    expect(item.startTime).toBe(10);
    // Other defaults unchanged
    expect(item.positionX).toBe(50);
    expect(item.scale).toBe(1);
    expect(item.opacity).toBe(1);
    expect(item.speed).toBe(1);
  });
});

describe("createDefaultTrack", () => {
  it("applies correct defaults with only required fields", () => {
    const track = createDefaultTrack({
      id: "track-1",
      type: "video-main",
      name: "Video",
    });

    expect(track.id).toBe("track-1");
    expect(track.type).toBe("video-main");
    expect(track.name).toBe("Video");
    expect(track.order).toBe(0);
    expect(track.locked).toBe(false);
    expect(track.muted).toBe(false);
    expect(track.visible).toBe(true);
    expect(track.solo).toBe(false);
    expect(track.volume).toBe(1);
    expect(track.opacity).toBe(1);
    expect(track.height).toBe(72);
    expect(track.items).toEqual([]);
  });

  it("respects overrides", () => {
    const track = createDefaultTrack({
      id: "track-2",
      type: "audio-music",
      name: "Music",
      height: 100,
      muted: true,
      volume: 0.7,
    });

    expect(track.height).toBe(100);
    expect(track.muted).toBe(true);
    expect(track.volume).toBe(0.7);
    // Other defaults unchanged
    expect(track.locked).toBe(false);
    expect(track.solo).toBe(false);
    expect(track.visible).toBe(true);
  });
});

describe("createDefaultTimeline", () => {
  it("creates a valid empty timeline", () => {
    const tl = createDefaultTimeline("project-123");

    expect(tl.projectId).toBe("project-123");
    expect(tl.id).toBe(""); // Set by DB
    expect(tl.tracks).toEqual([]);
    expect(tl.duration).toBe(0);
    expect(tl.fps).toBe(30);
    expect(tl.format).toBe("16:9");
    expect(tl.markers).toEqual([]);
    expect(tl.clipMarkers).toEqual([]);
    expect(tl.version).toBe(1);
  });

  it("sets createdAt and updatedAt to ISO date strings", () => {
    const before = new Date().toISOString();
    const tl = createDefaultTimeline("project-456");
    const after = new Date().toISOString();

    expect(tl.createdAt).toBeDefined();
    expect(tl.updatedAt).toBeDefined();
    // Timestamps should be between before and after
    expect(tl.createdAt >= before).toBe(true);
    expect(tl.createdAt <= after).toBe(true);
  });
});
