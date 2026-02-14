import { Word } from "./types";

/**
 * Binary search with gap handling and duplicate-start-time resolution.
 * Extracted from TranscriptEditor for reuse across pages.
 *
 * @param words - Sorted word array (by start time)
 * @param time  - Current playback time in seconds
 * @returns Index into `words`, or -1 if no word is active
 */
export function findActiveWord(words: Word[], time: number): number {
  if (!words.length) return -1;
  if (time < words[0].start) return -1;

  // Binary search: last word whose start <= time
  let left = 0;
  let right = words.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (words[mid].start <= time) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (result === -1) return -1;

  const getEffectiveEnd = (index: number): number => {
    const word = words[index];
    if (Number.isFinite(word.end) && word.end > word.start) return word.end;
    const next = words[index + 1];
    if (next && Number.isFinite(next.start) && next.start > word.start) return next.start;
    return word.start + 0.12;
  };

  // Handle identical start times: select the earliest word whose end still includes time
  const targetStart = words[result].start;
  let first = result;
  while (first > 0 && words[first - 1].start === targetStart) first--;
  for (let i = first; i <= result; i++) {
    if (time <= getEffectiveEnd(i) + 0.001) return i;
  }

  // Gap handling
  const currentEnd = getEffectiveEnd(result);
  if (time > currentEnd) {
    if (result + 1 < words.length) {
      const nextStart = words[result + 1].start;
      const gap = nextStart - currentEnd;
      if (gap > 1) return -1; // long silence — drop highlight
      const midpoint = (currentEnd + nextStart) / 2;
      return time >= midpoint ? result + 1 : result; // smooth handoff
    }
    return -1; // past last word
  }

  return result;
}
