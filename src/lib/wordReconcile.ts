import { Word } from "./types";

/**
 * Reconcile edited text with existing word timings.
 * Handles: 1:1 replacement, merging (e.g. "5 000" → "$5,000"),
 * and insertions/deletions.
 */
export function reconcileWords(oldWords: Word[], newText: string): Word[] {
  const newTokens = newText.trim().split(/\s+/);
  if (newTokens.length === 0) return [];
  if (oldWords.length === 0) {
    return newTokens.map((t) => ({
      text: t,
      start: 0,
      end: 0,
      confidence: 0.5,
    }));
  }

  // Same word count: 1:1 mapping, update text, keep timings
  if (newTokens.length === oldWords.length) {
    return oldWords.map((w, i) => ({ ...w, text: newTokens[i] }));
  }

  // Different word count: sequential alignment with merge detection
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const result: Word[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (newIdx < newTokens.length && oldIdx < oldWords.length) {
    const newToken = newTokens[newIdx];

    // Try merge: consecutive old words whose normalized text concatenates to new token
    let mergeCount = 0;
    let joined = "";
    for (let k = 0; k < Math.min(5, oldWords.length - oldIdx); k++) {
      joined += normalize(oldWords[oldIdx + k].text);
      if (joined === normalize(newToken)) {
        mergeCount = k + 1;
        break;
      }
    }

    if (mergeCount > 1) {
      // Merge: start of first, end of last
      result.push({
        text: newToken,
        start: oldWords[oldIdx].start,
        end: oldWords[oldIdx + mergeCount - 1].end,
        confidence: Math.min(
          ...oldWords.slice(oldIdx, oldIdx + mergeCount).map((w) => w.confidence)
        ),
      });
      oldIdx += mergeCount;
    } else {
      // 1:1 replacement: keep timing, update text
      result.push({ ...oldWords[oldIdx], text: newToken });
      oldIdx++;
    }
    newIdx++;
  }

  // Remaining new tokens = insertions at end
  while (newIdx < newTokens.length) {
    const last = result[result.length - 1];
    result.push({
      text: newTokens[newIdx],
      start: last ? last.end : 0,
      end: last ? last.end + 0.2 : 0.2,
      confidence: 0.5,
    });
    newIdx++;
  }

  return result;
}
