export type WordGroup = { start: number; end: number };

/**
 * Compute word groups with optional break points (e.g. speaker change boundaries).
 *
 * Without breakIndices: produces groups of exactly wordsPerGroup
 * (last group may be smaller) — equivalent to the existing modulo behaviour.
 *
 * With breakIndices: a sorted array of word indices where a new group must
 * begin. Groups break at these indices AND at wordsPerGroup boundaries
 * within each speaker run.
 */
export function computeWordGroups(
  wordCount: number,
  wordsPerGroup: number,
  breakIndices?: number[]
): WordGroup[] {
  if (wordCount <= 0) return [];
  if (wordsPerGroup <= 0) wordsPerGroup = 4;

  if (!breakIndices || breakIndices.length === 0) {
    const groups: WordGroup[] = [];
    for (let i = 0; i < wordCount; i += wordsPerGroup) {
      groups.push({ start: i, end: Math.min(i + wordsPerGroup, wordCount) });
    }
    return groups;
  }

  // Deduplicate, sort, and filter out 0 (break at start is meaningless)
  const breaks = [...new Set(breakIndices)]
    .filter((idx) => idx > 0 && idx < wordCount)
    .sort((a, b) => a - b);

  const groups: WordGroup[] = [];
  let cursor = 0;

  for (const brk of breaks) {
    if (brk <= cursor) continue;
    // Fill from cursor to brk in chunks of wordsPerGroup
    while (cursor < brk) {
      const end = Math.min(cursor + wordsPerGroup, brk);
      groups.push({ start: cursor, end });
      cursor = end;
    }
  }

  // Fill remaining words after last break
  while (cursor < wordCount) {
    const end = Math.min(cursor + wordsPerGroup, wordCount);
    groups.push({ start: cursor, end });
    cursor = end;
  }

  return groups;
}

/**
 * Binary search to find the group containing wordIndex.
 * Groups must be sorted and non-overlapping (start inclusive, end exclusive).
 * Returns null if wordIndex is out of range.
 */
export function findGroupForWord(groups: WordGroup[], wordIndex: number): WordGroup | null {
  if (groups.length === 0) return null;

  let lo = 0;
  let hi = groups.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const g = groups[mid];
    if (wordIndex < g.start) {
      hi = mid - 1;
    } else if (wordIndex >= g.end) {
      lo = mid + 1;
    } else {
      return g;
    }
  }

  return null;
}

/**
 * Compute break indices from speaker segment times and word timings.
 *
 * For each segment boundary (starting from segment index 1), finds the first
 * wordTiming whose startTime >= segment.startTime - clipStartTime (with 10ms
 * tolerance). Returns sorted, deduplicated array of word indices.
 *
 * This time-based approach avoids the index mismatch between clip.words[]
 * and WordTiming[] caused by toWordTimings() filtering and reindexing.
 */
export function speakerBreakIndicesFromTimes(
  segments: Array<{ startTime: number; endTime: number }>,
  wordTimings: Array<{ startTime: number }>,
  clipStartTime: number
): number[] {
  if (segments.length <= 1 || wordTimings.length === 0) return [];

  const tolerance = 0.01; // 10ms
  const breaks: Set<number> = new Set();

  for (let i = 1; i < segments.length; i++) {
    const segStart = segments[i].startTime - clipStartTime;

    // Find first word at or after segment start
    for (let w = 0; w < wordTimings.length; w++) {
      if (wordTimings[w].startTime >= segStart - tolerance) {
        if (w > 0) {
          breaks.add(w);
        }
        break;
      }
    }
  }

  return [...breaks].sort((a, b) => a - b);
}
