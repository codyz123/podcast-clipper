import type { NleTimelineItem, NleTrack } from "./nleTypes";

export interface ActiveItem {
  item: NleTimelineItem;
  trackMuted: boolean;
  trackVolume: number;
  trackOpacity: number;
  /** Time in the source media to seek to (seconds), accounting for sourceIn and speed */
  sourceSeekTime: number;
}

/**
 * Given the current playhead time and all tracks, returns the items whose
 * time range overlaps the playhead, along with computed seek times and
 * effective mute/volume/opacity from track state.
 *
 * Tracks are sorted by `order` so results come out in correct compositing
 * order (lower order = rendered first / behind higher order).
 */
export function getActiveItems(currentTime: number, tracks: NleTrack[]): ActiveItem[] {
  const results: ActiveItem[] = [];
  const hasSolo = tracks.some((t) => t.solo);

  // Sort by track.order for correct z-index compositing
  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);

  for (const track of sortedTracks) {
    if (!track.visible) continue;

    const effectiveMuted = track.muted || (hasSolo && !track.solo);

    for (const item of track.items) {
      const itemEnd = item.startTime + item.duration;
      if (currentTime >= item.startTime && currentTime < itemEnd) {
        const timeIntoItem = currentTime - item.startTime;
        // Clamp sourceSeekTime to [sourceIn, sourceOut] bounds
        const rawSeekTime = item.sourceIn + timeIntoItem * item.speed;
        const sourceSeekTime = Math.max(item.sourceIn, Math.min(item.sourceOut, rawSeekTime));

        results.push({
          item,
          trackMuted: effectiveMuted,
          trackVolume: track.volume,
          trackOpacity: track.opacity,
          sourceSeekTime,
        });
      }
    }
  }

  return results;
}
