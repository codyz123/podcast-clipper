// @vitest-environment jsdom

/**
 * Tests for usePlaybackLoop — the hook that drives the NLE playhead.
 *
 * These are behavioral tests: they verify that pressing play actually moves
 * the playhead, that it stops at the right boundaries, that speed works, etc.
 * We mock requestAnimationFrame to control frame progression manually.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNleStore } from "../../stores/nleStore";
import { usePlaybackLoop } from "../../hooks/usePlaybackLoop";
import { createDefaultTimeline } from "../../lib/nleTypes";

// ============ RAF + performance.now mock ============

let rafCallbacks: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextRafId = 1;
let mockNow = 0;

function mockRequestAnimationFrame(cb: FrameRequestCallback): number {
  const id = nextRafId++;
  rafCallbacks.push({ id, cb });
  return id;
}

function mockCancelAnimationFrame(id: number) {
  rafCallbacks = rafCallbacks.filter((entry) => entry.id !== id);
}

/** Flush pending rAF callbacks at the current mockNow. */
function flushRaf() {
  const pending = rafCallbacks;
  rafCallbacks = [];
  for (const entry of pending) {
    entry.cb(mockNow);
  }
}

/** Simulate multiple frames, each advancing by `msPerFrame`. Wrapped in act(). */
function advanceFrames(count: number, msPerFrame: number) {
  act(() => {
    for (let i = 0; i < count; i++) {
      mockNow += msPerFrame;
      flushRaf();
    }
  });
}

// ============ Helpers ============

function seedTimeline(duration: number) {
  const tl = {
    ...createDefaultTimeline("test-project"),
    id: "tl-1",
    duration,
  };
  useNleStore.setState({
    timeline: tl,
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1,
    inPoint: null,
    outPoint: null,
    isDirty: false,
    undoStack: [],
    redoStack: [],
  });
}

function getState() {
  return useNleStore.getState();
}

// ============ Setup / Teardown ============

beforeEach(() => {
  rafCallbacks = [];
  nextRafId = 1;
  mockNow = 0;

  vi.stubGlobal("requestAnimationFrame", mockRequestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", mockCancelAnimationFrame);
  vi.spyOn(performance, "now").mockImplementation(() => mockNow);

  useNleStore.setState(useNleStore.getInitialState());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============ Tests ============

describe("usePlaybackLoop", () => {
  it("does NOT advance currentTime when isPlaying is false", () => {
    seedTimeline(60);
    renderHook(() => usePlaybackLoop());

    advanceFrames(10, 16.67); // ~10 frames at 60fps
    expect(getState().currentTime).toBe(0);
  });

  it("advances currentTime when isPlaying is set to true", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    // Start playback
    act(() => {
      useNleStore.setState({ isPlaying: true });
    });
    rerender();

    // Simulate 10 frames at ~60fps (16.67ms each = ~167ms total)
    advanceFrames(10, 16.67);

    const time = getState().currentTime;
    expect(time).toBeGreaterThan(0);
    // 10 frames × 16.67ms = ~166.7ms = ~0.167s at 1x speed
    expect(time).toBeCloseTo(0.167, 1);
  });

  it("stops advancing when paused", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    // Play
    act(() => {
      useNleStore.setState({ isPlaying: true });
    });
    rerender();
    advanceFrames(5, 16.67);
    const timeAtPause = getState().currentTime;
    expect(timeAtPause).toBeGreaterThan(0);

    // Pause
    act(() => {
      useNleStore.setState({ isPlaying: false });
    });
    rerender();

    // More frames — time should NOT change
    advanceFrames(10, 16.67);
    expect(getState().currentTime).toBe(timeAtPause);
  });

  it("respects playbackSpeed (2x plays twice as fast)", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    act(() => {
      useNleStore.setState({ isPlaying: true, playbackSpeed: 2 });
    });
    rerender();

    // 60 frames × 16.67ms = ~1 second wall time
    advanceFrames(60, 16.67);

    // At 2x speed over ~1s wall time, should advance ~2s of timeline
    const time = getState().currentTime;
    expect(time).toBeCloseTo(2.0, 0);
  });

  it("respects playbackSpeed (0.5x plays at half speed)", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    act(() => {
      useNleStore.setState({ isPlaying: true, playbackSpeed: 0.5 });
    });
    rerender();

    // 60 frames × 16.67ms = ~1 second wall time
    advanceFrames(60, 16.67);

    // At 0.5x speed over ~1s, should advance ~0.5s of timeline
    const time = getState().currentTime;
    expect(time).toBeCloseTo(0.5, 0);
  });

  it("stops at timeline duration and sets isPlaying to false", () => {
    seedTimeline(2); // 2 second timeline
    const { rerender } = renderHook(() => usePlaybackLoop());

    act(() => {
      useNleStore.setState({ isPlaying: true, currentTime: 1.9 });
    });
    rerender();

    // Advance enough frames to pass the 2s mark
    // 0.1s remaining at 1x = ~6 frames at 60fps, advance 20 to be safe
    advanceFrames(20, 16.67);

    expect(getState().currentTime).toBe(2); // clamped to duration
    expect(getState().isPlaying).toBe(false); // auto-stopped
  });

  it("stops at outPoint instead of duration when outPoint is set", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    act(() => {
      useNleStore.setState({
        isPlaying: true,
        currentTime: 9.5,
        outPoint: 10,
      });
    });
    rerender();

    // 0.5s remaining, advance plenty of frames
    advanceFrames(60, 16.67);

    expect(getState().currentTime).toBe(10); // stopped at outPoint
    expect(getState().isPlaying).toBe(false);
  });

  it("does NOT stop early when outPoint is null (plays to duration)", () => {
    seedTimeline(5);
    const { rerender } = renderHook(() => usePlaybackLoop());

    act(() => {
      useNleStore.setState({
        isPlaying: true,
        currentTime: 4.5,
        outPoint: null,
      });
    });
    rerender();

    advanceFrames(60, 16.67);

    expect(getState().currentTime).toBe(5); // plays to duration
    expect(getState().isPlaying).toBe(false);
  });

  it("resumes from current position after pause+play", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    // Play and advance to ~0.5s
    act(() => {
      useNleStore.setState({ isPlaying: true });
    });
    rerender();
    advanceFrames(30, 16.67); // ~0.5s
    const timeAfterFirstPlay = getState().currentTime;
    expect(timeAfterFirstPlay).toBeCloseTo(0.5, 0);

    // Pause
    act(() => {
      useNleStore.setState({ isPlaying: false });
    });
    rerender();

    // Resume
    act(() => {
      useNleStore.setState({ isPlaying: true });
    });
    rerender();
    advanceFrames(30, 16.67); // another ~0.5s

    // Should be at ~1.0s total, not reset to 0
    expect(getState().currentTime).toBeCloseTo(1.0, 0);
  });

  it("changing speed mid-playback takes effect on the next frame", () => {
    seedTimeline(60);
    const { rerender } = renderHook(() => usePlaybackLoop());

    // Start at 1x
    act(() => {
      useNleStore.setState({ isPlaying: true, playbackSpeed: 1 });
    });
    rerender();

    // 30 frames at 1x (~0.5s wall time = ~0.5s timeline)
    advanceFrames(30, 16.67);
    const timeAt1x = getState().currentTime;
    expect(timeAt1x).toBeCloseTo(0.5, 0);

    // Switch to 4x mid-playback
    act(() => {
      useNleStore.setState({ playbackSpeed: 4 });
    });

    // 30 more frames (~0.5s wall time at 4x = ~2.0s more timeline)
    advanceFrames(30, 16.67);
    const timeAt4x = getState().currentTime;
    expect(timeAt4x).toBeCloseTo(2.5, 0); // 0.5 + 2.0
  });

  it("cleans up rAF on unmount (no lingering callbacks)", () => {
    seedTimeline(60);
    const { rerender, unmount } = renderHook(() => usePlaybackLoop());

    act(() => {
      useNleStore.setState({ isPlaying: true });
    });
    rerender();

    // One rAF should be pending
    expect(rafCallbacks.length).toBe(1);

    unmount();

    // After unmount, no pending callbacks
    expect(rafCallbacks.length).toBe(0);
  });
});
