import { useRef, useEffect, useCallback } from "react";
import { Track } from "../lib/types";

interface UseAudioFadeOptions {
  audioElement: HTMLAudioElement | null;
  track: Track | undefined;
  clipDuration: number;
  currentTime: number; // Relative time within clip (0 to clipDuration)
  isPlaying: boolean;
}

/**
 * Hook to apply fade-in/fade-out effects to audio using Web Audio API
 * Returns the audio context and gain node for external control if needed
 */
export function useAudioFade({
  audioElement,
  track,
  clipDuration,
  currentTime,
  isPlaying,
}: UseAudioFadeOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const isConnectedRef = useRef(false);

  // Initialize Web Audio API
  useEffect(() => {
    if (!audioElement) return;

    // Create audio context on first use (must be after user interaction)
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    // Only connect once per audio element
    if (!isConnectedRef.current) {
      try {
        // Create gain node
        gainNodeRef.current = ctx.createGain();
        gainNodeRef.current.connect(ctx.destination);

        // Create source from audio element
        sourceNodeRef.current = ctx.createMediaElementSource(audioElement);
        sourceNodeRef.current.connect(gainNodeRef.current);

        isConnectedRef.current = true;
      } catch (e) {
        // Audio element might already be connected to a context
        console.warn("Audio already connected to context:", e);
      }
    }

    return () => {
      // Don't disconnect on cleanup as it can cause issues with hot reload
      // The audio context will be garbage collected when component unmounts
    };
  }, [audioElement]);

  // Resume audio context if suspended (required for autoplay policies)
  useEffect(() => {
    if (isPlaying && audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [isPlaying]);

  // Calculate and apply fade volume
  const calculateFadeVolume = useCallback(
    (time: number): number => {
      if (!track) return 1;

      const fadeIn = track.fadeIn || 0;
      const fadeOut = track.fadeOut || 0;
      const trackVolume = track.muted ? 0 : track.volume;

      let fadeMultiplier = 1;

      // Apply fade-in
      if (fadeIn > 0 && time < fadeIn) {
        fadeMultiplier = time / fadeIn;
      }

      // Apply fade-out
      const timeUntilEnd = clipDuration - time;
      if (fadeOut > 0 && timeUntilEnd < fadeOut) {
        fadeMultiplier = Math.min(fadeMultiplier, timeUntilEnd / fadeOut);
      }

      // Clamp to valid range
      fadeMultiplier = Math.max(0, Math.min(1, fadeMultiplier));

      return trackVolume * fadeMultiplier;
    },
    [track, clipDuration]
  );

  // Update gain based on current time
  useEffect(() => {
    if (!gainNodeRef.current || !track) return;

    const targetVolume = calculateFadeVolume(currentTime);

    // Use setTargetAtTime for smooth transitions (avoids clicks)
    const ctx = audioContextRef.current;
    if (ctx) {
      gainNodeRef.current.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.015);
    }
  }, [currentTime, track, calculateFadeVolume]);

  // Expose method to get current fade volume (for visualization)
  const getCurrentFadeVolume = useCallback(() => {
    return calculateFadeVolume(currentTime);
  }, [currentTime, calculateFadeVolume]);

  return {
    audioContext: audioContextRef.current,
    gainNode: gainNodeRef.current,
    getCurrentFadeVolume,
  };
}

/**
 * Calculate fade envelope for a given time range
 * Useful for visualizing fades on the timeline
 */
export function calculateFadeEnvelope(
  fadeIn: number,
  fadeOut: number,
  duration: number,
  sampleCount: number = 100
): number[] {
  const envelope: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const time = (i / (sampleCount - 1)) * duration;
    let value = 1;

    // Fade in
    if (fadeIn > 0 && time < fadeIn) {
      value = time / fadeIn;
    }

    // Fade out
    const timeUntilEnd = duration - time;
    if (fadeOut > 0 && timeUntilEnd < fadeOut) {
      value = Math.min(value, timeUntilEnd / fadeOut);
    }

    envelope.push(Math.max(0, Math.min(1, value)));
  }

  return envelope;
}
