/**
 * Shared multicam transform module.
 *
 * Imported by BOTH the editor preview (client) and the Remotion composition (renderer)
 * to guarantee WYSIWYG — identical camera selection, layout, crop, and transitions.
 *
 * Follows the same pattern as shared/clipTransform.ts.
 */

// ============ Types ============

export interface SpeakerSegmentLike {
  speakerLabel: string;
  speakerId?: string;
  startTime: number;
  endTime: number;
}

export interface VideoSourceLike {
  id: string;
  label: string;
  personId?: string | null;
  sourceType: string; // 'speaker' | 'wide' | 'broll'
  syncOffsetMs: number;
  cropOffsetX: number;
  cropOffsetY: number;
  width?: number | null;
  height?: number | null;
  displayOrder: number;
}

export type LayoutMode = "active-speaker" | "side-by-side" | "grid" | "solo";

export interface MulticamOverride {
  startTime: number;
  endTime: number;
  activeVideoSourceId: string;
}

export interface SwitchingInterval {
  startTime: number;
  endTime: number;
  videoSourceId: string;
}

export interface FrameInterval {
  startFrame: number;
  endFrame: number;
  videoSourceId: string;
}

export interface SourceLayout {
  sourceId: string;
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100
  height: number; // 0-100
  visible: boolean;
  zIndex: number;
}

export interface PipPosition {
  videoSourceId: string;
  positionX: number;
  positionY: number;
}

export interface MulticamConfig {
  defaultVideoSourceId?: string;
  holdPreviousMs?: number; // default 1500
  minShotDurationMs?: number; // default 1500
  overrides?: MulticamOverride[];
}

// ============ Speaker resolution ============

/**
 * Map a speaker label to the best video source for that person.
 * If a person has multiple sources, picks the one with sourceType === 'speaker'.
 */
export function resolveVideoSourceForSpeaker(
  speakerLabel: string,
  videoSources: VideoSourceLike[],
  speakerId?: string
): string | null {
  // Try speakerId → personId match first (most reliable)
  if (speakerId) {
    const byPersonId = videoSources.find(
      (s) => s.personId === speakerId && s.sourceType === "speaker"
    );
    if (byPersonId) return byPersonId.id;
  }

  // Try exact label match
  const byLabel = videoSources.filter(
    (s) => s.label === speakerLabel && s.sourceType === "speaker"
  );
  if (byLabel.length > 0) return byLabel[0].id;

  // Try case-insensitive match
  const byLabelCI = videoSources.filter(
    (s) => s.label.toLowerCase() === speakerLabel.toLowerCase() && s.sourceType === "speaker"
  );
  if (byLabelCI.length > 0) return byLabelCI[0].id;

  // Try any source with matching label (even non-speaker)
  const anyLabel = videoSources.filter((s) => s.label.toLowerCase() === speakerLabel.toLowerCase());
  if (anyLabel.length > 0) return anyLabel[0].id;

  return null;
}

// ============ Active source resolution ============

/**
 * Binary search for the segment active at a given time.
 * Returns the index of the segment, or -1 if no segment covers this time.
 */
function findSegmentAt(segments: SpeakerSegmentLike[], timeSeconds: number): number {
  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];

    if (timeSeconds < seg.startTime) {
      hi = mid - 1;
    } else if (timeSeconds >= seg.endTime) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

/**
 * Find the most recent segment that ended before or at the given time.
 */
function findPreviousSegment(segments: SpeakerSegmentLike[], timeSeconds: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].endTime <= timeSeconds) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

/**
 * Build an order-based fallback map: unique speaker labels → speaker sources
 * by display order. Used when label/speakerId matching fails entirely.
 */
function buildOrderBasedSpeakerMap(
  segments: SpeakerSegmentLike[],
  videoSources: VideoSourceLike[]
): Map<string, string> {
  const map = new Map<string, string>();
  const speakerSources = videoSources
    .filter((s) => s.sourceType === "speaker")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  if (speakerSources.length === 0) return map;

  // Collect unique speaker labels in order of first appearance
  const uniqueLabels: string[] = [];
  for (const seg of segments) {
    if (!uniqueLabels.includes(seg.speakerLabel)) {
      uniqueLabels.push(seg.speakerLabel);
    }
  }

  // Map each unique label to a source by position
  for (let i = 0; i < uniqueLabels.length && i < speakerSources.length; i++) {
    map.set(uniqueLabels[i], speakerSources[i].id);
  }

  return map;
}

/**
 * Determine which video source to show at a given time.
 *
 * Works for any configuration:
 * - Multiple speakers: binary search segments, map to source
 * - Single speaker: returns that speaker's source
 * - Wide shot only: returns that source
 * - No one speaking: holds previous speaker for holdMs, then defaultVideoSourceId
 */
export function resolveActiveSource(
  timeSeconds: number,
  segments: SpeakerSegmentLike[],
  videoSources: VideoSourceLike[],
  config: MulticamConfig
): string {
  const holdMs = config.holdPreviousMs ?? 1500;
  const holdSec = holdMs / 1000;

  // Check manual overrides first (they win unconditionally)
  if (config.overrides) {
    for (const override of config.overrides) {
      if (timeSeconds >= override.startTime && timeSeconds < override.endTime) {
        return override.activeVideoSourceId;
      }
    }
  }

  // Single source: always show it
  if (videoSources.length === 1) {
    return videoSources[0].id;
  }

  // No speaker sources: show default or first source
  const speakerSources = videoSources.filter((s) => s.sourceType === "speaker");
  if (speakerSources.length === 0) {
    return config.defaultVideoSourceId || videoSources[0].id;
  }

  // No segments: show default
  if (segments.length === 0) {
    return config.defaultVideoSourceId || speakerSources[0].id;
  }

  // Resolve speaker label → source ID with fallback chain:
  // 1. speakerId → personId match
  // 2. Label match (exact, case-insensitive)
  // 3. Order-based fallback (first speaker → first source, etc.)
  let orderMap: Map<string, string> | null = null;

  const resolveSource = (seg: SpeakerSegmentLike): string | null => {
    // Try speakerId / label matching first
    const matched = resolveVideoSourceForSpeaker(seg.speakerLabel, videoSources, seg.speakerId);
    if (matched) return matched;

    // Fallback: map speakers to sources by order of appearance
    if (!orderMap) {
      orderMap = buildOrderBasedSpeakerMap(segments, videoSources);
    }
    return orderMap.get(seg.speakerLabel) || null;
  };

  // Check if someone is speaking right now
  const segIdx = findSegmentAt(segments, timeSeconds);
  if (segIdx >= 0) {
    const sourceId = resolveSource(segments[segIdx]);
    return sourceId || config.defaultVideoSourceId || videoSources[0].id;
  }

  // No one speaking — hold previous speaker for holdMs, then fall back
  const prevIdx = findPreviousSegment(segments, timeSeconds);
  if (prevIdx >= 0) {
    const prevSeg = segments[prevIdx];
    const gapDuration = timeSeconds - prevSeg.endTime;

    if (gapDuration < holdSec) {
      const sourceId = resolveSource(prevSeg);
      if (sourceId) return sourceId;
    }
  }

  // Fall back to default
  return config.defaultVideoSourceId || videoSources[0].id;
}

// ============ Switching timeline ============

/**
 * Pre-compute full switching timeline for a clip range.
 * Collapses resolveActiveSource into contiguous intervals.
 * Enforces minShotDurationMs — short segments absorbed into neighbors.
 */
export function computeSwitchingTimeline(
  clipStart: number,
  clipEnd: number,
  segments: SpeakerSegmentLike[],
  videoSources: VideoSourceLike[],
  config: MulticamConfig
): SwitchingInterval[] {
  const minShot = (config.minShotDurationMs ?? 1500) / 1000;

  // Sample at a fine resolution (every 50ms) to build raw timeline
  const step = 0.05;
  const raw: SwitchingInterval[] = [];
  let currentSource = "";
  let intervalStart = clipStart;

  for (let t = clipStart; t < clipEnd; t += step) {
    const source = resolveActiveSource(t, segments, videoSources, config);

    if (source !== currentSource) {
      if (currentSource) {
        raw.push({
          startTime: intervalStart,
          endTime: t,
          videoSourceId: currentSource,
        });
      }
      currentSource = source;
      intervalStart = t;
    }
  }

  // Push final interval
  if (currentSource) {
    raw.push({
      startTime: intervalStart,
      endTime: clipEnd,
      videoSourceId: currentSource,
    });
  }

  if (raw.length === 0) {
    return [
      {
        startTime: clipStart,
        endTime: clipEnd,
        videoSourceId: videoSources[0]?.id || "",
      },
    ];
  }

  // Enforce minimum shot duration: absorb short segments into neighbors
  const merged: SwitchingInterval[] = [raw[0]];

  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = raw[i];
    const currDuration = curr.endTime - curr.startTime;

    if (currDuration < minShot) {
      // Absorb into previous interval
      prev.endTime = curr.endTime;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Professional pre-roll: shift switch points earlier so the camera
 * cuts to the next speaker before they start talking.
 */
export function applyPreRoll(
  timeline: SwitchingInterval[],
  preRollSeconds: number = 0.3
): SwitchingInterval[] {
  if (timeline.length <= 1 || preRollSeconds <= 0) return timeline;

  const result: SwitchingInterval[] = [];

  for (let i = 0; i < timeline.length; i++) {
    const interval = { ...timeline[i] };

    // Shift start time earlier (except for the first interval)
    if (i > 0) {
      const maxShift = Math.min(
        preRollSeconds,
        (timeline[i - 1].endTime - timeline[i - 1].startTime) * 0.3 // Don't eat more than 30% of previous
      );
      interval.startTime = Math.max(
        timeline[i - 1].startTime + 0.1, // Keep at least 100ms of previous
        interval.startTime - maxShift
      );
    }

    // Adjust previous interval's end to match
    if (result.length > 0) {
      result[result.length - 1].endTime = interval.startTime;
    }

    result.push(interval);
  }

  return result;
}

/**
 * Convert time-based switching timeline to frame-based for Remotion.
 */
export function toFrameTimeline(
  timeline: SwitchingInterval[],
  clipStart: number,
  fps: number
): FrameInterval[] {
  return timeline.map((interval) => ({
    startFrame: Math.floor((interval.startTime - clipStart) * fps),
    endFrame: Math.ceil((interval.endTime - clipStart) * fps),
    videoSourceId: interval.videoSourceId,
  }));
}

// ============ Video seek ============

/**
 * Compute the correct seek position in a video source,
 * accounting for its sync offset.
 */
export function getVideoSeekTime(absoluteTime: number, syncOffsetMs: number): number {
  return Math.max(0, absoluteTime + syncOffsetMs / 1000);
}

// ============ Layout computation ============

/**
 * Compute layout for all sources given the current mode.
 * Returns position/size for EVERY source.
 */
export function computeLayout(
  videoSources: VideoSourceLike[],
  activeSourceId: string,
  layoutMode: LayoutMode,
  pipEnabled: boolean,
  pipPositions: PipPosition[],
  pipScale: number = 0.2
): SourceLayout[] {
  switch (layoutMode) {
    case "solo": {
      return videoSources.map((s) => ({
        sourceId: s.id,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        visible: s.id === activeSourceId,
        zIndex: s.id === activeSourceId ? 1 : 0,
      }));
    }

    case "active-speaker": {
      return videoSources.map((s) => {
        if (s.id === activeSourceId) {
          return {
            sourceId: s.id,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            visible: true,
            zIndex: 1,
          };
        }

        // PiP position
        if (pipEnabled) {
          const pip = pipPositions.find((p) => p.videoSourceId === s.id);
          if (pip) {
            return {
              sourceId: s.id,
              x: pip.positionX,
              y: pip.positionY,
              width: pipScale * 100,
              height: pipScale * 100,
              visible: true,
              zIndex: 2, // PiP on top
            };
          }
        }

        return {
          sourceId: s.id,
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          visible: false,
          zIndex: 0,
        };
      });
    }

    case "side-by-side": {
      const visibleSources = videoSources.filter((s) => s.sourceType !== "broll").slice(0, 2);

      return videoSources.map((s) => {
        const idx = visibleSources.findIndex((vs) => vs.id === s.id);
        if (idx === -1) {
          return {
            sourceId: s.id,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            visible: false,
            zIndex: 0,
          };
        }

        return {
          sourceId: s.id,
          x: idx === 0 ? 25 : 75,
          y: 50,
          width: 50,
          height: 100,
          visible: true,
          zIndex: 1,
        };
      });
    }

    case "grid": {
      const gridSources = videoSources.filter((s) => s.sourceType !== "broll");
      const count = gridSources.length;
      const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / cols);

      return videoSources.map((s) => {
        const idx = gridSources.findIndex((gs) => gs.id === s.id);
        if (idx === -1) {
          return {
            sourceId: s.id,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            visible: false,
            zIndex: 0,
          };
        }

        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cellW = 100 / cols;
        const cellH = 100 / rows;

        return {
          sourceId: s.id,
          x: cellW * col + cellW / 2,
          y: cellH * row + cellH / 2,
          width: cellW,
          height: cellH,
          visible: true,
          zIndex: 1,
        };
      });
    }

    default:
      return videoSources.map((s) => ({
        sourceId: s.id,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        visible: s.id === activeSourceId,
        zIndex: s.id === activeSourceId ? 1 : 0,
      }));
  }
}

// ============ Crop ============

/**
 * Compute CSS object-position for aspect ratio crop.
 * Maps the 0-100 crop offset to a CSS object-position value.
 */
export function computeCropPosition(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
  cropOffsetX: number,
  cropOffsetY: number
): { objectPosition: string } {
  const sourceAspect = sourceWidth / sourceHeight;

  if (Math.abs(sourceAspect - targetAspect) < 0.01) {
    // Same aspect ratio, no crop needed
    return { objectPosition: "50% 50%" };
  }

  // The crop offset maps 0-100 to the panning range
  return {
    objectPosition: `${cropOffsetX}% ${cropOffsetY}%`,
  };
}

// ============ Utility: available layout modes ============

/**
 * Determine which layout modes are available given the source configuration.
 */
export function getAvailableLayoutModes(videoSources: VideoSourceLike[]): LayoutMode[] {
  const nonBroll = videoSources.filter((s) => s.sourceType !== "broll");

  if (nonBroll.length <= 1) return ["solo"];
  if (nonBroll.length === 2) return ["active-speaker", "side-by-side", "solo"];
  return ["active-speaker", "side-by-side", "grid", "solo"];
}
