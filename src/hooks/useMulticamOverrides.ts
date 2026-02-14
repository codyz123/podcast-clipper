import { useCallback, useMemo } from "react";
import { useProjectStore } from "../stores/projectStore";
import {
  computeSwitchingTimeline,
  type MulticamOverride,
  type VideoSourceLike,
  type SpeakerSegmentLike,
} from "../../shared/multicamTransform";
import { generateId } from "../lib/utils";
import type { Clip } from "../lib/types";

interface UseMulticamOverridesParams {
  clip: Clip | null;
  videoSources: VideoSourceLike[];
  speakerSegments: SpeakerSegmentLike[];
  defaultVideoSourceId?: string;
}

export function useMulticamOverrides({
  clip,
  videoSources,
  speakerSegments,
  defaultVideoSourceId,
}: UseMulticamOverridesParams) {
  const updateClip = useProjectStore((s) => s.updateClip);

  const EMPTY_OVERRIDES: MulticamOverride[] = useMemo(() => [], []);
  const overrides = clip?.multicamLayout?.overrides ?? EMPTY_OVERRIDES;

  const getOverrides = useCallback(
    (): MulticamOverride[] => clip?.multicamLayout?.overrides || [],
    [clip?.multicamLayout?.overrides]
  );

  const setOverrides = useCallback(
    (newOverrides: MulticamOverride[]) => {
      if (!clip) return;
      const currentLayout = clip.multicamLayout || {
        mode: "active-speaker" as const,
        pipEnabled: false,
        pipScale: 0.2,
        pipPositions: [],
        overrides: [],
        transitionStyle: "cut" as const,
        transitionDurationFrames: 0,
      };
      updateClip(clip.id, {
        multicamLayout: { ...currentLayout, overrides: newOverrides },
      });
    },
    [clip, updateClip]
  );

  const addOverride = useCallback(
    (startTime: number, endTime: number, videoSourceId: string) => {
      const current = getOverrides();
      setOverrides([...current, { startTime, endTime, activeVideoSourceId: videoSourceId }]);
    },
    [getOverrides, setOverrides]
  );

  const removeOverride = useCallback(
    (index: number) => {
      const current = getOverrides();
      setOverrides(current.filter((_, i) => i !== index));
    },
    [getOverrides, setOverrides]
  );

  const updateOverride = useCallback(
    (index: number, updates: Partial<MulticamOverride>) => {
      const current = getOverrides();
      setOverrides(current.map((o, i) => (i === index ? { ...o, ...updates } : o)));
    },
    [getOverrides, setOverrides]
  );

  const regenerateMulticamTrack = useCallback(() => {
    if (!clip?.tracks || !videoSources.length || !speakerSegments.length) return;

    const multicamTrack = clip.tracks.find((t) => t.type === "multicam");
    if (!multicamTrack) return;

    const currentOverrides = clip.multicamLayout?.overrides || [];

    const timeline = computeSwitchingTimeline(
      clip.startTime,
      clip.endTime,
      speakerSegments,
      videoSources,
      {
        defaultVideoSourceId,
        holdPreviousMs: 1500,
        minShotDurationMs: 1500,
        overrides: currentOverrides,
      }
    );

    const newClips = timeline.map((interval) => {
      const isOverride = currentOverrides.some(
        (o) => interval.startTime >= o.startTime - 0.05 && interval.endTime <= o.endTime + 0.05
      );
      return {
        id: generateId(),
        trackId: multicamTrack.id,
        startTime: interval.startTime - clip.startTime,
        duration: interval.endTime - interval.startTime,
        type: "video" as const,
        assetId: interval.videoSourceId,
        ...(isOverride ? { assetSource: "override" as const } : {}),
      };
    });

    const updatedTracks = clip.tracks.map((t) =>
      t.id === multicamTrack.id ? { ...t, clips: newClips } : t
    );
    updateClip(clip.id, { tracks: updatedTracks });
  }, [clip, videoSources, speakerSegments, defaultVideoSourceId, updateClip]);

  return {
    overrides,
    addOverride,
    removeOverride,
    updateOverride,
    setOverrides,
    regenerateMulticamTrack,
  };
}
