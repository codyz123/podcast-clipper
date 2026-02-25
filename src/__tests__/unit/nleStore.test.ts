import { describe, it, expect, beforeEach } from "vitest";
import { useNleStore } from "../../stores/nleStore";
import type { EpisodeTimeline, NleTrack } from "../../lib/nleTypes";
import {
  createDefaultTimeline,
  createDefaultTrack,
  createDefaultTimelineItem,
} from "../../lib/nleTypes";

// ============ Helpers ============

function seedTimeline(overrides?: Partial<EpisodeTimeline>): EpisodeTimeline {
  const tl: EpisodeTimeline = {
    ...createDefaultTimeline("test-project"),
    id: "tl-1",
    duration: 120,
    ...overrides,
  };
  useNleStore.setState({
    timeline: tl,
    isDirty: false,
    undoStack: [],
    redoStack: [],
  });
  return tl;
}

function seedTrackWithItems(): { track: NleTrack; itemId: string } {
  const itemId = "item-1";
  const track = createDefaultTrack({
    id: "track-1",
    type: "video-main",
    name: "Video",
    items: [
      createDefaultTimelineItem({
        id: itemId,
        trackId: "track-1",
        type: "video",
        startTime: 0,
        duration: 60,
        sourceIn: 0,
        sourceOut: 60,
        mediaSourceId: "src-1",
        mediaSourceType: "video-source",
      }),
    ],
  });
  seedTimeline({ tracks: [track], duration: 60 });
  return { track, itemId };
}

function getState() {
  return useNleStore.getState();
}

// ============ Tests ============

beforeEach(() => {
  useNleStore.getState().resetStore();
});

// ---- Track CRUD ----

describe("Track CRUD", () => {
  it("addTrack creates a track with auto-incremented order", () => {
    seedTimeline();
    getState().addTrack("video-main", "Video");

    const { timeline, isDirty, undoStack } = getState();
    expect(timeline!.tracks).toHaveLength(1);
    expect(timeline!.tracks[0].name).toBe("Video");
    expect(timeline!.tracks[0].type).toBe("video-main");
    expect(timeline!.tracks[0].order).toBe(0);
    expect(isDirty).toBe(true);
    expect(undoStack).toHaveLength(1);
  });

  it("second addTrack gets order = first + 1", () => {
    seedTimeline();
    getState().addTrack("video-main", "Video");
    getState().addTrack("audio-main", "Audio");

    const tracks = getState().timeline!.tracks;
    expect(tracks).toHaveLength(2);
    expect(tracks[0].order).toBe(0);
    expect(tracks[1].order).toBe(1);
  });

  it("removeTrack removes the correct track", () => {
    const t1 = createDefaultTrack({ id: "t1", type: "video-main", name: "V", order: 0 });
    const t2 = createDefaultTrack({ id: "t2", type: "audio-main", name: "A", order: 1 });
    seedTimeline({ tracks: [t1, t2] });

    getState().removeTrack("t1");

    const tracks = getState().timeline!.tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("t2");
  });

  it("updateTrack toggles muted", () => {
    const t = createDefaultTrack({ id: "t1", type: "audio-main", name: "Audio" });
    seedTimeline({ tracks: [t] });

    expect(getState().timeline!.tracks[0].muted).toBe(false);
    getState().updateTrack("t1", { muted: true });
    expect(getState().timeline!.tracks[0].muted).toBe(true);
    expect(getState().isDirty).toBe(true);
  });

  it("updateTrack toggles solo", () => {
    const t = createDefaultTrack({ id: "t1", type: "audio-main", name: "Audio" });
    seedTimeline({ tracks: [t] });

    getState().updateTrack("t1", { solo: true });
    expect(getState().timeline!.tracks[0].solo).toBe(true);
  });

  it("updateTrack toggles locked", () => {
    const t = createDefaultTrack({ id: "t1", type: "video-main", name: "Video" });
    seedTimeline({ tracks: [t] });

    getState().updateTrack("t1", { locked: true });
    expect(getState().timeline!.tracks[0].locked).toBe(true);
  });

  it("reorderTracks reassigns order values", () => {
    const t1 = createDefaultTrack({ id: "t1", type: "video-main", name: "V", order: 0 });
    const t2 = createDefaultTrack({ id: "t2", type: "audio-main", name: "A", order: 1 });
    const t3 = createDefaultTrack({ id: "t3", type: "captions", name: "C", order: 2 });
    seedTimeline({ tracks: [t1, t2, t3] });

    getState().reorderTracks(["t3", "t1", "t2"]);

    const tracks = getState().timeline!.tracks;
    expect(tracks.find((t) => t.id === "t3")!.order).toBe(0);
    expect(tracks.find((t) => t.id === "t1")!.order).toBe(1);
    expect(tracks.find((t) => t.id === "t2")!.order).toBe(2);
  });
});

// ---- Item CRUD ----

describe("Item CRUD", () => {
  it("addItem adds an item to the correct track", () => {
    const track = createDefaultTrack({ id: "t1", type: "video-main", name: "V" });
    seedTimeline({ tracks: [track] });

    getState().addItem("t1", {
      type: "video",
      startTime: 10,
      duration: 30,
      sourceIn: 0,
      sourceOut: 30,
    });

    const items = getState().timeline!.tracks[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("video");
    expect(items[0].startTime).toBe(10);
    expect(items[0].duration).toBe(30);
    expect(items[0].trackId).toBe("t1");
  });

  it("addItem extends timeline duration when item exceeds current end", () => {
    const track = createDefaultTrack({ id: "t1", type: "video-main", name: "V" });
    seedTimeline({ tracks: [track], duration: 60 });

    getState().addItem("t1", {
      type: "video",
      startTime: 50,
      duration: 30, // ends at 80
      sourceIn: 0,
      sourceOut: 30,
    });

    expect(getState().timeline!.duration).toBe(80);
  });

  it("addItem does not shrink timeline duration", () => {
    const track = createDefaultTrack({ id: "t1", type: "video-main", name: "V" });
    seedTimeline({ tracks: [track], duration: 60 });

    getState().addItem("t1", {
      type: "video",
      startTime: 0,
      duration: 10, // ends at 10 — should not shrink from 60
      sourceIn: 0,
      sourceOut: 10,
    });

    expect(getState().timeline!.duration).toBe(60);
  });

  it("removeItem removes the item from the correct track", () => {
    const { itemId } = seedTrackWithItems();

    expect(getState().timeline!.tracks[0].items).toHaveLength(1);
    getState().removeItem(itemId);
    expect(getState().timeline!.tracks[0].items).toHaveLength(0);
  });

  it("moveItem on same track updates startTime", () => {
    const { itemId } = seedTrackWithItems();

    getState().moveItem(itemId, 20);
    expect(getState().timeline!.tracks[0].items[0].startTime).toBe(20);
  });

  it("moveItem clamps startTime to >= 0", () => {
    const { itemId } = seedTrackWithItems();

    getState().moveItem(itemId, -10);
    expect(getState().timeline!.tracks[0].items[0].startTime).toBe(0);
  });

  it("moveItem cross-track moves item between tracks", () => {
    const t1 = createDefaultTrack({
      id: "t1",
      type: "video-main",
      name: "V",
      items: [
        createDefaultTimelineItem({
          id: "item-1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 30,
        }),
      ],
    });
    const t2 = createDefaultTrack({ id: "t2", type: "video-overlay", name: "Overlay" });
    seedTimeline({ tracks: [t1, t2] });

    getState().moveItem("item-1", 10, "t2");

    const tracks = getState().timeline!.tracks;
    expect(tracks.find((t) => t.id === "t1")!.items).toHaveLength(0);
    expect(tracks.find((t) => t.id === "t2")!.items).toHaveLength(1);
    expect(tracks.find((t) => t.id === "t2")!.items[0].trackId).toBe("t2");
    expect(tracks.find((t) => t.id === "t2")!.items[0].startTime).toBe(10);
  });

  it("moveItem recalculates timeline duration", () => {
    // Item at 0-60 on a 60s timeline. Move to 0-60 stays 60.
    // But if we have another item, moving the long one earlier may reduce duration.
    const t = createDefaultTrack({
      id: "t1",
      type: "video-main",
      name: "V",
      items: [
        createDefaultTimelineItem({
          id: "item-1",
          trackId: "t1",
          type: "video",
          startTime: 30,
          duration: 30, // ends at 60
        }),
      ],
    });
    seedTimeline({ tracks: [t], duration: 60 });

    getState().moveItem("item-1", 0); // now ends at 30, duration should shrink to 30
    expect(getState().timeline!.duration).toBe(30);
  });
});

// ---- Split ----

describe("splitItemAtPlayhead", () => {
  it("splits a 60s item at 20s into two items", () => {
    const { itemId } = seedTrackWithItems(); // 0-60s item
    useNleStore.setState({ currentTime: 20 });

    getState().splitItemAtPlayhead(itemId);

    const items = getState().timeline!.tracks[0].items;
    expect(items).toHaveLength(2);

    const left = items[0];
    const right = items[1];
    expect(left.duration).toBe(20);
    expect(left.startTime).toBe(0);
    expect(right.startTime).toBe(20);
    expect(right.duration).toBe(40);
  });

  it("preserves source range after split", () => {
    const { itemId } = seedTrackWithItems(); // sourceIn=0, sourceOut=60
    useNleStore.setState({ currentTime: 20 });

    getState().splitItemAtPlayhead(itemId);

    const items = getState().timeline!.tracks[0].items;
    expect(items[0].sourceIn).toBe(0);
    expect(items[0].sourceOut).toBe(20); // sourceSplitPoint = 0 + 20*1
    expect(items[1].sourceIn).toBe(20);
    expect(items[1].sourceOut).toBe(60);
  });

  it("accounts for speed in source split", () => {
    const track = createDefaultTrack({
      id: "t1",
      type: "video-main",
      name: "V",
      items: [
        createDefaultTimelineItem({
          id: "item-1",
          trackId: "t1",
          type: "video",
          startTime: 0,
          duration: 30, // 60s source at 2x speed
          sourceIn: 0,
          sourceOut: 60,
          speed: 2,
        }),
      ],
    });
    seedTimeline({ tracks: [track], duration: 30 });
    useNleStore.setState({ currentTime: 15 }); // midpoint of the item

    getState().splitItemAtPlayhead("item-1");

    const items = getState().timeline!.tracks[0].items;
    expect(items).toHaveLength(2);
    // sourceSplitPoint = 0 + 15 * 2 = 30
    expect(items[0].sourceOut).toBe(30);
    expect(items[1].sourceIn).toBe(30);
  });

  it("does nothing when playhead is at item start", () => {
    const { itemId } = seedTrackWithItems();
    useNleStore.setState({ currentTime: 0 });

    getState().splitItemAtPlayhead(itemId);

    expect(getState().timeline!.tracks[0].items).toHaveLength(1);
  });

  it("does nothing when playhead is at item end", () => {
    const { itemId } = seedTrackWithItems(); // ends at 60
    useNleStore.setState({ currentTime: 60 });

    getState().splitItemAtPlayhead(itemId);

    expect(getState().timeline!.tracks[0].items).toHaveLength(1);
  });

  it("does nothing when playhead is outside the item", () => {
    const { itemId } = seedTrackWithItems(); // 0-60s
    useNleStore.setState({ currentTime: 100 }); // beyond item

    getState().splitItemAtPlayhead(itemId);

    expect(getState().timeline!.tracks[0].items).toHaveLength(1);
  });
});

// ---- Undo/Redo ----

describe("Undo/Redo", () => {
  it("undo restores previous state", () => {
    seedTimeline();
    getState().addTrack("video-main", "Video");
    expect(getState().timeline!.tracks).toHaveLength(1);

    getState().undo();
    expect(getState().timeline!.tracks).toHaveLength(0);
    expect(getState().undoStack).toHaveLength(0);
    expect(getState().redoStack).toHaveLength(1);
  });

  it("redo re-applies mutation", () => {
    seedTimeline();
    getState().addTrack("video-main", "Video");
    getState().undo();
    expect(getState().timeline!.tracks).toHaveLength(0);

    getState().redo();
    expect(getState().timeline!.tracks).toHaveLength(1);
    expect(getState().undoStack).toHaveLength(1);
    expect(getState().redoStack).toHaveLength(0);
  });

  it("new mutation after undo clears redo stack", () => {
    seedTimeline();
    getState().addTrack("video-main", "V1");
    getState().undo();
    expect(getState().redoStack).toHaveLength(1);

    getState().addTrack("audio-main", "A1"); // new mutation
    expect(getState().redoStack).toHaveLength(0);
  });

  it("respects MAX_UNDO_DEPTH of 100", () => {
    seedTimeline();

    for (let i = 0; i < 105; i++) {
      getState().addTrack("audio-sfx", `SFX ${i}`);
    }

    expect(getState().undoStack.length).toBeLessThanOrEqual(100);
  });

  it("undo on empty stack is a no-op", () => {
    seedTimeline();
    expect(getState().undoStack).toHaveLength(0);

    getState().undo(); // should not throw
    expect(getState().timeline!.tracks).toHaveLength(0);
  });

  it("redo on empty stack is a no-op", () => {
    seedTimeline();
    expect(getState().redoStack).toHaveLength(0);

    getState().redo(); // should not throw
    expect(getState().timeline!.tracks).toHaveLength(0);
  });
});

// ---- Selection / UI ----

describe("Selection and UI", () => {
  it("setSelectedItemIds sets values", () => {
    getState().setSelectedItemIds(["a", "b"]);
    expect(getState().selectedItemIds).toEqual(["a", "b"]);
  });

  it("setSelectedTrackIds sets values", () => {
    getState().setSelectedTrackIds(["t1"]);
    expect(getState().selectedTrackIds).toEqual(["t1"]);
  });

  it("clearSelection clears both arrays", () => {
    getState().setSelectedItemIds(["a"]);
    getState().setSelectedTrackIds(["t1"]);

    getState().clearSelection();
    expect(getState().selectedItemIds).toEqual([]);
    expect(getState().selectedTrackIds).toEqual([]);
  });

  it("setCurrentTime clamps to >= 0", () => {
    getState().setCurrentTime(10);
    expect(getState().currentTime).toBe(10);
  });

  it("setCurrentTime with negative clamps to 0", () => {
    getState().setCurrentTime(-5);
    expect(getState().currentTime).toBe(0);
  });

  it("togglePlayback toggles isPlaying", () => {
    expect(getState().isPlaying).toBe(false);
    getState().togglePlayback();
    expect(getState().isPlaying).toBe(true);
    getState().togglePlayback();
    expect(getState().isPlaying).toBe(false);
  });

  it("zoomIn increases by factor 1.25", () => {
    useNleStore.setState({ zoomLevel: 10 });
    getState().zoomIn();
    expect(getState().zoomLevel).toBe(12.5);
  });

  it("zoomOut decreases by factor 1.25", () => {
    useNleStore.setState({ zoomLevel: 10 });
    getState().zoomOut();
    expect(getState().zoomLevel).toBe(8);
  });

  it("zoomIn clamps at MAX_ZOOM (100)", () => {
    useNleStore.setState({ zoomLevel: 95 });
    getState().zoomIn(); // 95 * 1.25 = 118.75 → clamped to 100
    expect(getState().zoomLevel).toBe(100);
  });

  it("zoomOut clamps at MIN_ZOOM (1)", () => {
    useNleStore.setState({ zoomLevel: 1.1 });
    getState().zoomOut(); // 1.1 / 1.25 = 0.88 → clamped to 1
    expect(getState().zoomLevel).toBe(1);
  });

  it("setSnapEnabled toggles", () => {
    expect(getState().snapEnabled).toBe(true);
    getState().setSnapEnabled(false);
    expect(getState().snapEnabled).toBe(false);
  });
});

// ---- Markers ----

describe("Markers", () => {
  it("addMarker creates a marker with auto-generated ID", () => {
    seedTimeline();
    getState().addMarker({
      time: 30,
      label: "Chapter 1",
      color: "#ff0000",
      type: "chapter",
    });

    const markers = getState().timeline!.markers;
    expect(markers).toHaveLength(1);
    expect(markers[0].id).toBeTruthy();
    expect(markers[0].time).toBe(30);
    expect(markers[0].label).toBe("Chapter 1");
  });

  it("removeMarker removes the correct marker", () => {
    seedTimeline();
    getState().addMarker({ time: 10, label: "A", color: "#f00", type: "note" });
    getState().addMarker({ time: 20, label: "B", color: "#0f0", type: "note" });

    const markers = getState().timeline!.markers;
    expect(markers).toHaveLength(2);

    getState().removeMarker(markers[0].id);
    expect(getState().timeline!.markers).toHaveLength(1);
    expect(getState().timeline!.markers[0].label).toBe("B");
  });

  it("updateMarker updates specified fields", () => {
    seedTimeline();
    getState().addMarker({ time: 10, label: "Draft", color: "#f00", type: "note" });

    const markerId = getState().timeline!.markers[0].id;
    getState().updateMarker(markerId, { label: "Final", color: "#0f0" });

    const marker = getState().timeline!.markers[0];
    expect(marker.label).toBe("Final");
    expect(marker.color).toBe("#0f0");
    expect(marker.time).toBe(10); // unchanged
  });
});

// ---- Clip Markers ----

describe("Clip Markers", () => {
  it("addClipMarker creates a clip marker", () => {
    seedTimeline();
    getState().addClipMarker({
      name: "Highlight",
      startTime: 30,
      endTime: 60,
    });

    const clipMarkers = getState().timeline!.clipMarkers;
    expect(clipMarkers).toHaveLength(1);
    expect(clipMarkers[0].id).toBeTruthy();
    expect(clipMarkers[0].name).toBe("Highlight");
    expect(clipMarkers[0].startTime).toBe(30);
    expect(clipMarkers[0].endTime).toBe(60);
  });

  it("removeClipMarker removes the correct clip marker", () => {
    seedTimeline();
    getState().addClipMarker({ name: "A", startTime: 0, endTime: 30 });
    getState().addClipMarker({ name: "B", startTime: 30, endTime: 60 });

    const markers = getState().timeline!.clipMarkers;
    getState().removeClipMarker(markers[0].id);

    expect(getState().timeline!.clipMarkers).toHaveLength(1);
    expect(getState().timeline!.clipMarkers[0].name).toBe("B");
  });
});

// ---- Playback store setters ----
// NOTE: Behavioral playback tests (rAF loop, stop-at-end, speed) are in usePlaybackLoop.test.ts

describe("Playback store setters", () => {
  it("setInPoint and setOutPoint set marker times", () => {
    getState().setInPoint(10);
    getState().setOutPoint(50);
    expect(getState().inPoint).toBe(10);
    expect(getState().outPoint).toBe(50);
  });

  it("clearInOutPoints resets both to null", () => {
    getState().setInPoint(10);
    getState().setOutPoint(50);
    getState().clearInOutPoints();
    expect(getState().inPoint).toBeNull();
    expect(getState().outPoint).toBeNull();
  });

  it("setPlaybackSpeed updates speed", () => {
    getState().setPlaybackSpeed(2);
    expect(getState().playbackSpeed).toBe(2);
  });
});

// ---- Reset ----

describe("resetStore", () => {
  it("resets all state to initial values", () => {
    seedTimeline();
    getState().addTrack("video-main", "V");
    getState().setSelectedItemIds(["item-1"]);
    getState().setCurrentTime(50);
    useNleStore.setState({ isPlaying: true, zoomLevel: 25 });

    getState().resetStore();

    const state = getState();
    expect(state.timeline).toBeNull();
    expect(state.isDirty).toBe(false);
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.zoomLevel).toBe(10);
    expect(state.selectedItemIds).toEqual([]);
    expect(state.selectedTrackIds).toEqual([]);
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
  });
});
