import { useEffect, useRef } from "react";
import { useNleStore } from "../stores/nleStore";

/**
 * Drives the NLE playhead forward using requestAnimationFrame while isPlaying is true.
 * Stops automatically when currentTime reaches outPoint (if set) or timeline duration.
 */
export function usePlaybackLoop() {
  const isPlaying = useNleStore((s) => s.isPlaying);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    lastFrameRef.current = performance.now();

    const tick = (now: number) => {
      // Clamp delta to 100ms to handle tab backgrounding (rAF suspends,
      // causing a huge jump when the tab is foregrounded again)
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = now;

      const state = useNleStore.getState();
      const newTime = state.currentTime + delta * state.playbackSpeed;
      const end = state.outPoint ?? state.timeline?.duration ?? 0;

      if (end > 0 && newTime >= end) {
        state.setCurrentTime(end);
        state.setIsPlaying(false);
        return;
      }

      state.setCurrentTime(newTime);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);
}
