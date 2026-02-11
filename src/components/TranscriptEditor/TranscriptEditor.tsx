import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import {
  ReloadIcon,
  CheckIcon,
  TextIcon,
  PlayIcon,
  PauseIcon,
  ChevronDownIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore, getAudioBlob } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAuthStore } from "../../stores/authStore";
import { useEpisodes } from "../../hooks/useEpisodes";
import { usePodcastPeople } from "../../hooks/usePodcastPeople";
import { SpeakerLineup } from "./SpeakerLineup";
import { Transcript, Word, SpeakerSegment, PodcastPerson } from "../../lib/types";
import { generateId, cn } from "../../lib/utils";
import { formatTimestamp, formatRelativeTime } from "../../lib/formats";
import { authFetch, getMediaUrl } from "../../lib/api";

interface ProgressState {
  stage: string;
  progress: number;
  message: string;
  detail?: string;
}

const TRANSCRIPTION_PROMPT =
  "This is a podcast conversation with natural speech. Transcribe only spoken words; ignore music, singing, and other non-speech audio. Do not include lyrics or music notation.";

const SERVICE_LABELS: Record<string, string> = {
  assemblyai: "AssemblyAI",
  "openai-whisper": "Whisper",
};

function formatServiceName(service: string): string {
  return SERVICE_LABELS[service] || service;
}

// --- Transcript version selector extracted to avoid re-rendering word spans on open/close ---

interface TranscriptVersionSelectorProps {
  transcripts: Transcript[];
  activeTranscriptId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const TranscriptVersionSelector = React.memo<TranscriptVersionSelectorProps>(
  ({ transcripts, activeTranscriptId, onSelect, onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const activeTranscript = transcripts.find((t) => t.id === activeTranscriptId);
    const activeIndex = transcripts.findIndex((t) => t.id === activeTranscriptId);

    useEffect(() => {
      if (!isOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    if (!activeTranscript) return null;

    return (
      <div className="mb-4 border-b border-[hsl(var(--glass-border))] pb-4">
        <div className="relative" ref={ref}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg p-3",
              "bg-[hsl(var(--surface))]",
              "border border-[hsl(var(--glass-border))]",
              "hover:bg-[hsl(var(--raised))]",
              "transition-colors"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[hsl(var(--text))]">
                Version {activeIndex + 1} of {transcripts.length}
              </span>
              <span className="text-xs text-[hsl(var(--text-muted))]">
                · {formatRelativeTime(activeTranscript.createdAt)}
                {activeTranscript.service && <> · {formatServiceName(activeTranscript.service)}</>}
              </span>
            </div>
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-[hsl(var(--text-muted))] transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </button>

          {isOpen && (
            <div
              className={cn(
                "absolute top-full right-0 left-0 z-10 mt-1",
                "bg-[hsl(var(--raised))]",
                "border border-[hsl(var(--glass-border))]",
                "overflow-hidden rounded-lg shadow-lg"
              )}
            >
              {transcripts.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => {
                    onSelect(t.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between p-3",
                    "hover:bg-[hsl(var(--surface))]",
                    t.id === activeTranscriptId && "bg-[hsl(185_50%_15%/0.3)]"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[hsl(var(--text))]">
                        Version {idx + 1}
                      </span>
                      {t.id === activeTranscriptId && (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            "bg-[hsl(var(--cyan))]",
                            "text-[hsl(var(--bg))]"
                          )}
                        >
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">
                      {t.words.length.toLocaleString()} words · {formatRelativeTime(t.createdAt)}
                      {t.service && <> · {formatServiceName(t.service)}</>}
                    </p>
                  </div>
                  {transcripts.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this transcript version?")) {
                          onDelete(t.id);
                        }
                      }}
                      className={cn(
                        "rounded-lg p-2",
                        "hover:bg-[hsl(var(--error)/0.1)]",
                        "text-[hsl(var(--text-muted))]",
                        "hover:text-[hsl(var(--error))]"
                      )}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

// --- Context menu extracted as its own component to avoid re-rendering the word spans ---

interface ContextMenuData {
  x: number;
  y: number;
  nearestIndex: number;
  secondNearestIndex: number;
  segmentIndex: number;
  clickedBefore: boolean;
  nearestWord: string;
  leftWord: string;
  rightWord: string;
  isBetween: boolean;
  canSplit: boolean;
  canMerge: boolean;
}

interface ContextMenuHandle {
  show: (data: ContextMenuData) => void;
  hide: () => void;
}

interface ContextMenuProps {
  onEdit: (nearestIndex: number) => void;
  onRemove: (nearestIndex: number) => void;
  onInsert: (nearestIndex: number, secondNearestIndex: number, clickedBefore: boolean) => void;
  onSplit: (nearestIndex: number, segmentIndex: number) => void;
  onMerge: (nearestIndex: number, segmentIndex: number) => void;
}

const TranscriptContextMenu = React.memo(
  React.forwardRef<ContextMenuHandle, ContextMenuProps>(
    ({ onEdit, onRemove, onInsert, onSplit, onMerge }, ref) => {
      const [data, setData] = useState<ContextMenuData | null>(null);
      const menuRef = useRef<HTMLDivElement>(null);

      useImperativeHandle(ref, () => ({
        show: (d) => setData(d),
        hide: () => setData(null),
      }));

      useEffect(() => {
        if (!data) return;
        const handleClick = (e: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            setData(null);
          }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
      }, [data]);

      if (!data) return null;

      return createPortal(
        <div
          ref={menuRef}
          className={cn(
            "fixed z-50 min-w-[200px]",
            "rounded-lg border border-[hsl(var(--glass-border))]",
            "bg-[hsl(var(--raised))] py-1 shadow-xl"
          )}
          style={{ left: data.x, top: data.y }}
        >
          <button
            onClick={() => {
              onEdit(data.nearestIndex);
              setData(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface))]"
          >
            Edit &ldquo;{data.nearestWord}&rdquo;
          </button>
          <button
            onClick={() => {
              onRemove(data.nearestIndex);
              setData(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[hsl(var(--error))] hover:bg-[hsl(var(--surface))]"
          >
            Remove &ldquo;{data.nearestWord}&rdquo;
          </button>
          <div className="my-1 border-t border-[hsl(var(--glass-border))]" />
          <button
            onClick={() => {
              onInsert(data.nearestIndex, data.secondNearestIndex, data.clickedBefore);
              setData(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface))]"
          >
            {data.isBetween ? (
              <>
                Add word between &ldquo;{data.leftWord}&rdquo; and &ldquo;{data.rightWord}&rdquo;
              </>
            ) : data.clickedBefore ? (
              <>Add word before &ldquo;{data.nearestWord}&rdquo;</>
            ) : (
              <>Add word after &ldquo;{data.nearestWord}&rdquo;</>
            )}
          </button>
          {(data.canSplit || data.canMerge) && (
            <>
              <div className="my-1 border-t border-[hsl(var(--glass-border))]" />
              {data.canSplit && (
                <button
                  onClick={() => {
                    onSplit(data.nearestIndex, data.segmentIndex);
                    setData(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface))]"
                >
                  Split speaker from &ldquo;{data.nearestWord}&rdquo;
                </button>
              )}
              {data.canMerge && (
                <button
                  onClick={() => {
                    onMerge(data.nearestIndex, data.segmentIndex);
                    setData(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface))]"
                >
                  Merge with next speaker from &ldquo;{data.nearestWord}&rdquo;
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      );
    }
  )
);

export const TranscriptEditor: React.FC = () => {
  const {
    currentProject,
    addTranscript,
    setActiveTranscript,
    deleteTranscript,
    getActiveTranscript,
    updateTranscriptWord,
    updateTranscriptSegments,
    removeTranscriptWord,
    insertTranscriptWord,
    deleteSegmentWithWords,
  } = useProjectStore();
  const { settings, updateSettings } = useSettingsStore();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { saveTranscript, saveTranscriptSegments, updateTranscript } = useEpisodes();
  const { people: podcastPeople, createPerson } = usePodcastPeople();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState>({
    stage: "idle",
    progress: 0,
    message: "Ready",
  });
  const [error, setError] = useState<string | null>(null);
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // Transcription guard - ref persists across renders to prevent concurrent requests
  const transcribingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const activeWordIndexRef = useRef<number>(-1);
  const currentTimeDisplayRef = useRef<HTMLSpanElement>(null);
  const wordsContainerRef = useRef<HTMLDivElement>(null);

  // Speaker editing state
  const [editingSpeakerIdx, setEditingSpeakerIdx] = useState<number | null>(null);
  const [confirmDeleteSegIdx, setConfirmDeleteSegIdx] = useState<number | null>(null);
  const confirmDeleteRef = useRef<HTMLDivElement>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState("");
  const [applyToAllSpeakers, setApplyToAllSpeakers] = useState(true);

  // Context menu ref (extracted component manages its own state)
  const contextMenuApiRef = useRef<ContextMenuHandle>(null);

  // Ref for click-outside dismissal
  const speakerPopoverRef = useRef<HTMLDivElement>(null);

  // --- Debounced backend sync for transcript word edits ---
  // Tracks the text at time of last backend sync to avoid saving on initial load
  const lastSyncedTextRef = useRef<string | null>(null);

  // Get active transcript (handles both legacy and new format)
  const activeTranscript = getActiveTranscript();
  const transcripts = currentProject?.transcripts || [];
  const hasTranscript = !!activeTranscript;
  const hasMultipleTranscripts = transcripts.length > 1;
  const timedWords = useMemo(() => {
    if (!activeTranscript?.words || activeTranscript.words.length === 0) return [];

    const normalized: Word[] = [];
    let lastStart = -Infinity;

    for (const word of activeTranscript.words) {
      let start = Number.isFinite(word.start) ? word.start : lastStart + 0.02;
      if (start <= lastStart) {
        start = lastStart + 0.02;
      }

      let end = Number.isFinite(word.end) ? word.end : start + 0.12;
      if (end <= start) {
        end = start + 0.12;
      }

      normalized.push({ ...word, start, end });
      lastStart = start;
    }

    return normalized;
  }, [activeTranscript?.words]);

  // Load audio URL from IndexedDB or blob URL
  useEffect(() => {
    const loadAudio = async () => {
      if (!currentProject?.id) return;

      // Try to get blob from IndexedDB first
      const blob = await getAudioBlob(currentProject.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        return () => URL.revokeObjectURL(url);
      }

      // Fall back to audioPath if available
      if (currentProject.audioPath) {
        setAudioUrl(currentProject.audioPath);
      }
    };

    loadAudio();
  }, [currentProject?.id, currentProject?.audioPath]);

  // Click-outside handler for speaker popover
  useEffect(() => {
    if (editingSpeakerIdx === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (speakerPopoverRef.current && !speakerPopoverRef.current.contains(e.target as Node)) {
        setEditingSpeakerIdx(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingSpeakerIdx]);

  // Click-outside handler for delete confirmation popover
  useEffect(() => {
    if (confirmDeleteSegIdx === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (confirmDeleteRef.current && !confirmDeleteRef.current.contains(e.target as Node)) {
        setConfirmDeleteSegIdx(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmDeleteSegIdx]);

  // Find active word based on current playback time using binary search
  // Returns the active word, accounting for duplicate start times and missing end timestamps.
  const findActiveWord = useCallback(
    (time: number) => {
      if (!timedWords || timedWords.length === 0) return -1;

      const words = timedWords;

      // If before first word, no highlight
      if (time < words[0].start) return -1;

      // Binary search for the last word that starts at or before current time
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

      const getEffectiveEnd = (index: number) => {
        const word = words[index];
        if (Number.isFinite(word.end) && word.end > word.start) {
          return word.end;
        }

        const next = words[index + 1];
        if (next && Number.isFinite(next.start) && next.start > word.start) {
          return next.start;
        }

        return word.start + 0.12;
      };

      // Handle identical start times by selecting the earliest word whose end still includes the time.
      const targetStart = words[result].start;
      let first = result;
      while (first > 0 && words[first - 1].start === targetStart) {
        first--;
      }

      for (let i = first; i <= result; i++) {
        if (time <= getEffectiveEnd(i) + 0.001) {
          return i;
        }
      }

      // Gap handling: for short gaps between words, use midpoint advancement
      // (smooth handoff). For long silences (>1s), drop the highlight entirely.
      const currentEnd = getEffectiveEnd(result);
      if (time > currentEnd) {
        if (result + 1 < words.length) {
          const nextStart = words[result + 1].start;
          const gap = nextStart - currentEnd;
          if (gap > 1) {
            // Long silence — no highlight until the next word starts
            return -1;
          }
          // Short gap — midpoint advancement for smooth feel
          const midpoint = (currentEnd + nextStart) / 2;
          return time >= midpoint ? result + 1 : result;
        }
        // Past the last word's end — no highlight
        return -1;
      }

      return result;
    },
    [timedWords]
  );

  // Handle audio time updates with requestAnimationFrame for smooth highlighting
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let animationFrameId: number;
    let isPlayingLocal = false;

    const updateTime = () => {
      if (audio && isPlayingLocal) {
        const time = audio.currentTime;

        // Update time display directly (no React re-render)
        if (currentTimeDisplayRef.current) {
          currentTimeDisplayRef.current.textContent = formatTimestamp(time);
        }

        const newActiveIndex = findActiveWord(time);
        const prevIndex = activeWordIndexRef.current;

        if (newActiveIndex !== prevIndex) {
          // Direct DOM manipulation — toggle data-active attribute
          const prevEl = wordRefs.current[prevIndex];
          const nextEl = wordRefs.current[newActiveIndex];
          if (prevEl) prevEl.removeAttribute("data-active");
          if (nextEl) {
            nextEl.setAttribute("data-active", "");
            // Auto-scroll within transcript container only (not the page)
            const container = wordsContainerRef.current;
            if (container) {
              const elTop = nextEl.offsetTop - container.offsetTop;
              const elBottom = elTop + nextEl.offsetHeight;
              const viewTop = container.scrollTop;
              const viewBottom = viewTop + container.clientHeight;
              if (elTop < viewTop + 40 || elBottom > viewBottom - 40) {
                container.scrollTo({ top: elTop - container.clientHeight / 2, behavior: "smooth" });
              }
            }
          }
          activeWordIndexRef.current = newActiveIndex;
        }

        animationFrameId = requestAnimationFrame(updateTime);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      isPlayingLocal = true;

      animationFrameId = requestAnimationFrame(updateTime);
    };

    const handlePause = () => {
      setIsPlaying(false);
      isPlayingLocal = false;
      cancelAnimationFrame(animationFrameId);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      isPlayingLocal = false;
      // Clear highlight via DOM
      const prevEl = wordRefs.current[activeWordIndexRef.current];
      if (prevEl) prevEl.removeAttribute("data-active");
      activeWordIndexRef.current = -1;
      cancelAnimationFrame(animationFrameId);
    };

    // Also update on seek (when clicking words)
    const handleSeeked = () => {
      const time = audio.currentTime;
      if (currentTimeDisplayRef.current) {
        currentTimeDisplayRef.current.textContent = formatTimestamp(time);
      }
      const nextIndex = findActiveWord(time);
      // Update highlight via DOM
      const prevEl = wordRefs.current[activeWordIndexRef.current];
      const nextEl = wordRefs.current[nextIndex];
      if (prevEl) prevEl.removeAttribute("data-active");
      if (nextEl) nextEl.setAttribute("data-active", "");
      activeWordIndexRef.current = nextIndex;
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("seeked", handleSeeked);

    return () => {
      cancelAnimationFrame(animationFrameId);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("seeked", handleSeeked);
    };
  }, [findActiveWord, audioUrl]);

  // --- Debounced backend sync: save transcript word edits to server ---
  // Reset sync ref when switching transcripts so initial text isn't treated as a change
  useEffect(() => {
    lastSyncedTextRef.current = null;
  }, [activeTranscript?.id]);

  useEffect(() => {
    if (!activeTranscript || !currentProject) return;

    // On first render or transcript switch, record current text — don't save
    if (lastSyncedTextRef.current === null) {
      lastSyncedTextRef.current = activeTranscript.text;
      return;
    }

    // If text hasn't changed from last sync, nothing to do
    if (activeTranscript.text === lastSyncedTextRef.current) return;

    // Debounce: save 2 seconds after last change
    const timer = setTimeout(() => {
      updateTranscript(currentProject.id, activeTranscript.id, {
        text: activeTranscript.text,
        words: activeTranscript.words,
        segments: activeTranscript.segments,
      }).then((ok) => {
        if (ok) lastSyncedTextRef.current = activeTranscript.text;
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [activeTranscript?.text, activeTranscript?.id, currentProject?.id, updateTranscript]);

  // Flush pending transcript save on unmount (e.g., navigating away)
  useEffect(() => {
    return () => {
      const state = useProjectStore.getState();
      const transcript = state.getActiveTranscript?.();
      const project = state.currentProject;
      if (
        transcript &&
        project &&
        lastSyncedTextRef.current !== null &&
        transcript.text !== lastSyncedTextRef.current
      ) {
        // Fire-and-forget — component is unmounting
        updateTranscript(project.id, transcript.id, {
          text: transcript.text,
          words: transcript.words,
          segments: transcript.segments,
        });
      }
    };
  }, [updateTranscript]);

  // Play/pause toggle
  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Seek to word when clicked (while playing)
  const seekToWord = (index: number) => {
    if (!audioRef.current || !timedWords[index]) return;

    const word = timedWords[index];
    audioRef.current.currentTime = word.start;
    // Update highlight via DOM
    const prevEl = wordRefs.current[activeWordIndexRef.current];
    const nextEl = wordRefs.current[index];
    if (prevEl) prevEl.removeAttribute("data-active");
    if (nextEl) nextEl.setAttribute("data-active", "");
    activeWordIndexRef.current = index;

    // If not playing, start playback
    if (!isPlaying) {
      audioRef.current.play();
    }
  };

  const shouldDropWord = (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return true;
    if (/^[♪♫]+$/.test(trimmed)) return true;

    const lower = trimmed.toLowerCase();
    if (lower === "music" || lower === "singing" || lower === "instrumental") return true;

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("(") && trimmed.endsWith(")"))
    ) {
      const inner = trimmed.slice(1, -1).toLowerCase();
      if (/(music|singing|instrumental|applause|laughter|noise)/.test(inner)) {
        return true;
      }
    }

    return false;
  };

  const buildTranscriptWords = (
    rawWords: any[],
    fallbackText?: string
  ): { words: Word[]; indexMap: number[] } => {
    const mapped =
      rawWords?.map((w: any) => ({
        text: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence ?? w.probability ?? 1,
      })) || [];

    // Build index mapping: indexMap[oldIndex] = newIndex (or -1 if dropped)
    const indexMap: number[] = [];
    let newIdx = 0;
    const filtered: Word[] = [];

    for (let i = 0; i < mapped.length; i++) {
      if (!shouldDropWord(mapped[i].text)) {
        indexMap.push(newIdx);
        filtered.push(mapped[i]);
        newIdx++;
      } else {
        indexMap.push(-1);
      }
    }

    if (filtered.length === 0 && fallbackText) {
      const textWords = fallbackText.split(/\s+/).filter((word) => !shouldDropWord(word));
      const duration = currentProject?.audioDuration || 60;
      const avgWordDuration = textWords.length > 0 ? duration / textWords.length : 0.2;

      return {
        words: textWords.map((word: string, i: number) => ({
          text: word,
          start: i * avgWordDuration,
          end: (i + 1) * avgWordDuration,
          confidence: 0.8,
        })),
        indexMap: [], // No meaningful mapping for fallback words
      };
    }

    return { words: filtered, indexMap };
  };

  /** Remap segment indices when words have been filtered */
  const remapSegments = (
    segments: SpeakerSegment[],
    indexMap: number[],
    filteredWordCount: number
  ): SpeakerSegment[] => {
    if (indexMap.length === 0 || segments.length === 0) return segments;

    return segments
      .map((seg) => {
        // Find the new start index (first non-dropped word at or after original start)
        let newStart = -1;
        for (let i = seg.startWordIndex; i < indexMap.length && i < seg.endWordIndex; i++) {
          if (indexMap[i] !== -1) {
            newStart = indexMap[i];
            break;
          }
        }

        // Find the new end index (last non-dropped word before original end, + 1)
        let newEnd = -1;
        for (
          let i = Math.min(seg.endWordIndex - 1, indexMap.length - 1);
          i >= seg.startWordIndex;
          i--
        ) {
          if (indexMap[i] !== -1) {
            newEnd = indexMap[i] + 1;
            break;
          }
        }

        // Skip segment if all its words were dropped
        if (newStart === -1 || newEnd === -1 || newStart >= newEnd) return null;

        return {
          ...seg,
          startWordIndex: newStart,
          endWordIndex: Math.min(newEnd, filteredWordCount),
        };
      })
      .filter((seg): seg is SpeakerSegment => seg !== null);
  };

  // Check if backend is configured
  const useBackend = !!settings.backendUrl;

  const startTranscription = async () => {
    // Prevent concurrent transcription requests
    if (transcribingRef.current) {
      return;
    }

    if (!currentProject?.id) {
      setError("No episode selected");
      return;
    }

    // Check auth requirements
    if (useBackend) {
      if (!settings.backendUrl) {
        setError("Please configure the backend URL in Settings");
        return;
      }
      if (!settings.accessCode && !accessToken) {
        setError("Please sign in or set an access code in Settings to use the backend.");
        return;
      }
    } else {
      if (!settings.openaiApiKey) {
        setError("Please set your OpenAI API key in Settings, or configure a backend");
        return;
      }
      const apiKey = settings.openaiApiKey.trim();
      if (!apiKey.startsWith("sk-")) {
        setError("Invalid API key format. OpenAI keys should start with 'sk-'");
        return;
      }
    }

    transcribingRef.current = true;
    setIsTranscribing(true);
    setError(null);

    // Create AbortController for this request
    abortControllerRef.current = new AbortController();

    setProgressState({
      stage: "preparing",
      progress: 2,
      message: "Preparing audio",
      detail: "Loading from storage...",
    });

    try {
      // Try to get the audio blob from IndexedDB
      let audioBlob = currentProject.id ? await getAudioBlob(currentProject.id) : undefined;

      if (!audioBlob) {
        if (!currentProject.audioPath) {
          setError("Audio file not available. Please re-import your audio file.");
          setIsTranscribing(false);
          return;
        }

        try {
          const response = await fetch(currentProject.audioPath);
          audioBlob = await response.blob();
        } catch {
          setError("Audio file not available. Please re-import your audio file.");
          setIsTranscribing(false);
          return;
        }
      }

      setProgressState({
        stage: "preparing",
        progress: 3,
        message: "Audio loaded",
        detail: `${(audioBlob.size / 1024 / 1024).toFixed(1)} MB`,
      });

      // Determine filename
      let filename: string;
      if (currentProject.audioFileName) {
        filename = currentProject.audioFileName;
      } else {
        const mimeToExt: Record<string, string> = {
          "audio/mpeg": "mp3",
          "audio/mp3": "mp3",
          "audio/wav": "wav",
          "audio/x-wav": "wav",
          "audio/mp4": "m4a",
          "audio/x-m4a": "m4a",
          "audio/flac": "flac",
          "audio/ogg": "ogg",
          "audio/aiff": "aif",
          "audio/x-aiff": "aif",
          "audio/aif": "aif",
        };
        const ext = mimeToExt[audioBlob.type] || "mp3";
        filename = `audio.${ext}`;
      }

      // Create FormData
      const formData = new FormData();
      formData.append("file", audioBlob, filename);

      setProgressState({
        stage: "uploading",
        progress: 4,
        message: "Uploading to server",
        detail: "Starting upload...",
      });

      if (useBackend) {
        // Use SSE streaming for real-time progress
        const headers = new Headers({
          Accept: "text/event-stream",
        });
        if (settings.accessCode) {
          headers.set("X-Access-Code", settings.accessCode);
        }
        if (settings.openaiApiKey) {
          headers.set("X-OpenAI-Key", settings.openaiApiKey);
        }
        if (settings.assemblyaiApiKey) {
          headers.set("X-AssemblyAI-Key", settings.assemblyaiApiKey);
        }

        const response = await authFetch(`${settings.backendUrl}/api/transcribe`, {
          method: "POST",
          headers,
          body: formData,
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || errorData.error || `API error: ${response.status}`
          );
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let transcriptResponse: any = null;

        if (reader) {
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.stage === "error") {
                    throw new Error(data.error);
                  }

                  if (data.stage === "result") {
                    transcriptResponse = data;
                  } else {
                    // Update progress
                    setProgressState({
                      stage: data.stage,
                      progress: data.progress,
                      message: data.message,
                      detail: data.detail,
                    });
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) {
                    console.warn("Failed to parse SSE data:", line);
                  } else {
                    throw e;
                  }
                }
              }
            }
          }
        }

        if (!transcriptResponse) {
          throw new Error("No transcription result received");
        }

        // Process the response
        const rawWords = transcriptResponse.words || [];
        const { words, indexMap } = buildTranscriptWords(rawWords, transcriptResponse.text);
        const hadFiltering = Array.isArray(rawWords) && words.length < rawWords.length;
        const transcriptText =
          hadFiltering || !transcriptResponse.text
            ? words.map((w) => w.text).join(" ")
            : transcriptResponse.text;

        // Include segments from diarization (AssemblyAI), remapping indices if words were filtered
        const rawSegments: SpeakerSegment[] = transcriptResponse.segments || [];
        const segments = hadFiltering
          ? remapSegments(rawSegments, indexMap, words.length)
          : rawSegments;

        const transcript: Transcript = {
          id: generateId(),
          projectId: currentProject.id,
          audioFingerprint: currentProject.audioFingerprint,
          text: transcriptText,
          words,
          segments: segments.length > 0 ? segments : undefined,
          language: transcriptResponse.language || "en",
          createdAt: new Date().toISOString(),
          service: transcriptResponse.service || "assemblyai",
        };

        addTranscript(transcript);

        // Sync to backend
        saveTranscript(currentProject.id, {
          text: transcript.text,
          words: transcript.words,
          segments: transcript.segments,
          language: transcript.language,
          name: transcript.name,
          audioFingerprint: transcript.audioFingerprint,
          service: transcript.service,
        }).catch((err) => console.error("[TranscriptEditor] Backend sync failed:", err));

        setProgressState({
          stage: "complete",
          progress: 100,
          message: "Transcription complete",
          detail: `${words.length.toLocaleString()} words${segments.length > 0 ? `, ${new Set(segments.map((s: SpeakerSegment) => s.speakerLabel)).size} speakers` : ""}`,
        });
      } else {
        // Direct OpenAI call (legacy mode - no streaming)
        setProgressState({
          stage: "transcribing",
          progress: 40,
          message: "Transcribing audio",
          detail: "Sending to OpenAI Whisper...",
        });

        formData.append("model", "whisper-1");
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");
        formData.append("prompt", TRANSCRIPTION_PROMPT);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3600000);

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.openaiApiKey}`,
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || errorData.error || `API error: ${res.status}`
          );
        }

        const transcriptResponse = await res.json();

        const rawWords = transcriptResponse.words || [];
        const { words } = buildTranscriptWords(rawWords, transcriptResponse.text);
        const hadFiltering = Array.isArray(rawWords) && words.length < rawWords.length;
        const transcriptText =
          hadFiltering || !transcriptResponse.text
            ? words.map((w) => w.text).join(" ")
            : transcriptResponse.text;

        const transcript: Transcript = {
          id: generateId(),
          projectId: currentProject.id,
          audioFingerprint: currentProject.audioFingerprint,
          text: transcriptText,
          words,
          language: transcriptResponse.language || "en",
          createdAt: new Date().toISOString(),
          service: "openai-whisper",
        };

        addTranscript(transcript);

        // Sync to backend (direct OpenAI mode — no segments)
        saveTranscript(currentProject.id, {
          text: transcript.text,
          words: transcript.words,
          language: transcript.language,
          name: transcript.name,
          audioFingerprint: transcript.audioFingerprint,
          service: transcript.service,
        }).catch((err) => console.error("[TranscriptEditor] Backend sync failed:", err));

        setProgressState({
          stage: "complete",
          progress: 100,
          message: "Transcription complete",
          detail: `${words.length.toLocaleString()} words`,
        });
      }
    } catch (err) {
      console.error("Transcription error:", err);
      const message = err instanceof Error ? err.message : "Transcription failed";

      if (useBackend) {
        if (
          message.includes("401") ||
          message.includes("Access code required") ||
          message.toLowerCase().includes("authentication required") ||
          message.toLowerCase().includes("invalid or expired token")
        ) {
          setError("Please sign in again or verify your access code in Settings.");
        } else if (message.includes("403")) {
          setError("Invalid access code.");
        } else if (
          message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("network")
        ) {
          setError("Cannot reach backend server. Check the URL in Settings.");
        } else if (message.toLowerCase().includes("openai api key not configured")) {
          setError(
            "Backend is missing an OpenAI API key. Add OPENAI_API_KEY on the server or set your OpenAI key in Settings."
          );
        } else {
          setError(message);
        }
      } else {
        if (
          message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("network") ||
          message.toLowerCase().includes("cors")
        ) {
          setError("Request blocked. This usually means your API key is invalid.");
        } else if (message.includes("401") || message.toLowerCase().includes("invalid")) {
          setError("Invalid API key. Please check your OpenAI API key in Settings.");
        } else if (message.includes("429")) {
          setError("Rate limited. Please wait a moment and try again.");
        } else {
          setError(message);
        }
      }
    } finally {
      transcribingRef.current = false;
      abortControllerRef.current = null;
      setIsTranscribing(false);
    }
  };

  const handleWordClick = (index: number, e: React.MouseEvent) => {
    if (!activeTranscript?.words[index]) return;
    contextMenuApiRef.current?.hide();

    // If holding Alt/Option key, edit the word instead of seeking
    if (e.altKey) {
      setEditingWordIndex(index);
      setEditValue(activeTranscript.words[index].text);
    } else {
      // Seek to this word and play
      seekToWord(index);
    }
  };

  const handleWordSave = () => {
    if (editingWordIndex !== null) {
      const trimmed = editValue.trim();
      if (trimmed) {
        updateTranscriptWord(editingWordIndex, trimmed);
      } else if (activeTranscript?.words[editingWordIndex]?.text === "") {
        // Remove empty placeholder word (from cancelled insert)
        removeTranscriptWord(editingWordIndex);
      }
    }
    setEditingWordIndex(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleWordSave();
    } else if (e.key === "Escape") {
      // If editing an empty placeholder (from insert), remove it
      if (editingWordIndex !== null && activeTranscript?.words[editingWordIndex]?.text === "") {
        removeTranscriptWord(editingWordIndex);
      }
      setEditingWordIndex(null);
      setEditValue("");
    }
  };

  // Handle speaker label change
  const handleSpeakerChange = useCallback(
    (segmentIndex: number, label: string, personId?: string, applyToAll?: boolean) => {
      if (!activeTranscript?.segments || !currentProject) return;
      const oldLabel = activeTranscript.segments[segmentIndex].speakerLabel;
      const newSegments = activeTranscript.segments.map((seg, i) => {
        if (i === segmentIndex || (applyToAll && seg.speakerLabel === oldLabel)) {
          return { ...seg, speakerLabel: label, speakerId: personId };
        }
        return seg;
      });
      updateTranscriptSegments(newSegments);
      // Persist to backend
      saveTranscriptSegments(currentProject.id, activeTranscript.id, newSegments).catch((err) =>
        console.error("[TranscriptEditor] Failed to save segments:", err)
      );
    },
    [activeTranscript, currentProject, updateTranscriptSegments, saveTranscriptSegments]
  );

  // Handle linking a speaker to a recurring person
  const handleLinkPerson = useCallback(
    (segmentIndex: number, person: PodcastPerson) => {
      handleSpeakerChange(segmentIndex, person.name, person.id, applyToAllSpeakers);
      setEditingSpeakerIdx(null);
    },
    [handleSpeakerChange, applyToAllSpeakers]
  );

  // Handle saving speaker name edit
  const handleSpeakerSave = useCallback(() => {
    if (editingSpeakerIdx !== null && speakerNameInput.trim()) {
      handleSpeakerChange(
        editingSpeakerIdx,
        speakerNameInput.trim(),
        undefined,
        applyToAllSpeakers
      );
    }
    setEditingSpeakerIdx(null);
    setSpeakerNameInput("");
  }, [editingSpeakerIdx, speakerNameInput, applyToAllSpeakers, handleSpeakerChange]);

  // Unique speakers for lineup
  const speakers = useMemo(() => {
    if (!activeTranscript?.segments) return [];
    const seen = new Map<string, { label: string; speakerId?: string }>();
    for (const seg of activeTranscript.segments) {
      if (!seen.has(seg.speakerLabel)) {
        seen.set(seg.speakerLabel, {
          label: seg.speakerLabel,
          speakerId: seg.speakerId,
        });
      }
    }
    return Array.from(seen.values());
  }, [activeTranscript?.segments]);

  // Handle speaker rename from lineup (delegates to existing handleSpeakerChange)
  const handleLineupRename = useCallback(
    (oldLabel: string, newLabel: string, personId?: string) => {
      if (!activeTranscript?.segments) return;
      const segIdx = activeTranscript.segments.findIndex((s) => s.speakerLabel === oldLabel);
      if (segIdx >= 0) {
        handleSpeakerChange(segIdx, newLabel, personId, true);
      }
    },
    [activeTranscript?.segments, handleSpeakerChange]
  );

  // Context menu: find nearest word via data attribute (O(1) instead of O(n))
  // Shows the extracted TranscriptContextMenu component (no parent re-render)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!activeTranscript?.words.length) return;

      // Fast path: check if right-clicked directly on a word span
      let nearestIndex = -1;
      const target = (e.target as HTMLElement).closest("[data-word-index]") as HTMLElement | null;

      if (target) {
        nearestIndex = parseInt(target.getAttribute("data-word-index")!, 10);
      } else {
        // Probe nearby points for clicks in gaps between words
        for (const [dx, dy] of [
          [-12, 0],
          [12, 0],
          [0, -8],
          [0, 8],
          [-24, 0],
          [24, 0],
        ]) {
          const el = document.elementFromPoint(e.clientX + dx, e.clientY + dy);
          const wordEl =
            el && ((el as HTMLElement).closest("[data-word-index]") as HTMLElement | null);
          if (wordEl) {
            nearestIndex = parseInt(wordEl.getAttribute("data-word-index")!, 10);
            break;
          }
        }
      }

      if (nearestIndex === -1 || nearestIndex >= activeTranscript.words.length) return;

      // Determine adjacent word for "add between" based on click side
      const el = wordRefs.current[nearestIndex];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const clickedBefore = e.clientX < centerX;

      // Find which segment this word belongs to
      let segmentIndex = -1;
      let segStart = 0;
      let segEnd = activeTranscript.words.length;
      if (activeTranscript.segments) {
        segmentIndex = activeTranscript.segments.findIndex(
          (seg) => nearestIndex >= seg.startWordIndex && nearestIndex < seg.endWordIndex
        );
        if (segmentIndex >= 0) {
          segStart = activeTranscript.segments[segmentIndex].startWordIndex;
          segEnd = activeTranscript.segments[segmentIndex].endWordIndex;
        }
      }

      // Scope secondIndex to segment boundaries
      let secondIndex = nearestIndex;
      if (clickedBefore && nearestIndex > segStart) {
        secondIndex = nearestIndex - 1;
      } else if (!clickedBefore && nearestIndex < segEnd - 1) {
        secondIndex = nearestIndex + 1;
      }

      // Pre-compute display data for the context menu
      const isBetween = nearestIndex !== secondIndex;
      const leftIdx = Math.min(nearestIndex, secondIndex);
      const rightIdx = Math.max(nearestIndex, secondIndex);
      const seg = segmentIndex >= 0 ? activeTranscript.segments?.[segmentIndex] : undefined;

      contextMenuApiRef.current?.show({
        x: e.clientX,
        y: e.clientY,
        nearestIndex,
        secondNearestIndex: secondIndex,
        segmentIndex,
        clickedBefore,
        nearestWord: activeTranscript.words[nearestIndex]?.text || "",
        leftWord: activeTranscript.words[leftIdx]?.text || "",
        rightWord: activeTranscript.words[rightIdx]?.text || "",
        isBetween,
        canSplit: !!(seg && nearestIndex > seg.startWordIndex),
        canMerge: !!(seg && segmentIndex < (activeTranscript.segments?.length ?? 0) - 1),
      });
    },
    [activeTranscript?.words, activeTranscript?.segments]
  );

  // Context menu action handlers (called by TranscriptContextMenu with data params)
  const handleMenuEdit = useCallback(
    (nearestIndex: number) => {
      if (!activeTranscript) return;
      setEditingWordIndex(nearestIndex);
      setEditValue(activeTranscript.words[nearestIndex]?.text || "");
    },
    [activeTranscript]
  );

  const handleMenuRemove = useCallback(
    (nearestIndex: number) => {
      removeTranscriptWord(nearestIndex);
    },
    [removeTranscriptWord]
  );

  const handleMenuInsert = useCallback(
    (nearestIndex: number, secondNearestIndex: number, clickedBefore: boolean) => {
      let insertAfterIdx: number;
      if (nearestIndex === secondNearestIndex) {
        insertAfterIdx = clickedBefore ? nearestIndex - 1 : nearestIndex;
      } else {
        insertAfterIdx = Math.min(nearestIndex, secondNearestIndex);
      }
      insertTranscriptWord(insertAfterIdx, "");
      setEditingWordIndex(insertAfterIdx + 1);
      setEditValue("");
    },
    [insertTranscriptWord]
  );

  const handleMenuSplit = useCallback(
    (nearestIndex: number, segmentIndex: number) => {
      if (!activeTranscript?.segments || !currentProject) return;
      const seg = activeTranscript.segments[segmentIndex];
      if (nearestIndex <= seg.startWordIndex) return;

      const existingNumbers = activeTranscript.segments.map((s) => {
        const match = s.speakerLabel.match(/^Speaker (\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      });
      const nextNumber = Math.max(0, ...existingNumbers) + 1;

      const newSegments = [...activeTranscript.segments];
      newSegments[segmentIndex] = {
        ...seg,
        endWordIndex: nearestIndex,
        endTime: activeTranscript.words[nearestIndex - 1]?.end ?? seg.endTime,
      };
      newSegments.splice(segmentIndex + 1, 0, {
        speakerLabel: `Speaker ${nextNumber}`,
        startWordIndex: nearestIndex,
        endWordIndex: seg.endWordIndex,
        startTime: activeTranscript.words[nearestIndex]?.start ?? seg.startTime,
        endTime: seg.endTime,
      });

      updateTranscriptSegments(newSegments);
      saveTranscriptSegments(currentProject.id, activeTranscript.id, newSegments).catch((err) =>
        console.error("[TranscriptEditor] Failed to save segments:", err)
      );
    },
    [activeTranscript, currentProject, updateTranscriptSegments, saveTranscriptSegments]
  );

  const handleMenuMerge = useCallback(
    (nearestIndex: number, segmentIndex: number) => {
      if (!activeTranscript?.segments || !currentProject) return;
      if (segmentIndex >= activeTranscript.segments.length - 1) return;

      const currentSeg = activeTranscript.segments[segmentIndex];
      const nextSeg = activeTranscript.segments[segmentIndex + 1];
      const newSegments = [...activeTranscript.segments];

      if (nearestIndex <= currentSeg.startWordIndex) {
        newSegments[segmentIndex + 1] = {
          ...nextSeg,
          startWordIndex: currentSeg.startWordIndex,
          startTime: currentSeg.startTime,
        };
        newSegments.splice(segmentIndex, 1);
      } else {
        newSegments[segmentIndex] = {
          ...currentSeg,
          endWordIndex: nearestIndex,
          endTime: activeTranscript.words[nearestIndex - 1]?.end ?? currentSeg.endTime,
        };
        newSegments[segmentIndex + 1] = {
          ...nextSeg,
          startWordIndex: nearestIndex,
          startTime: activeTranscript.words[nearestIndex]?.start ?? nextSeg.startTime,
        };
      }

      updateTranscriptSegments(newSegments);
      saveTranscriptSegments(currentProject.id, activeTranscript.id, newSegments).catch((err) =>
        console.error("[TranscriptEditor] Failed to save segments:", err)
      );
    },
    [activeTranscript, currentProject, updateTranscriptSegments, saveTranscriptSegments]
  );

  // Stage icons and colors
  const stageConfig: Record<string, { icon: string; color: string }> = {
    preparing: { icon: "📁", color: "text-[hsl(var(--text-muted))]" },
    uploading: { icon: "📤", color: "text-[hsl(var(--text-muted))]" },
    received: { icon: "✓", color: "text-[hsl(var(--success))]" },
    converting: { icon: "🔄", color: "text-[hsl(var(--warning))]" },
    analyzing: { icon: "📊", color: "text-[hsl(var(--cyan))]" },
    compressing: { icon: "📦", color: "text-[hsl(var(--warning))]" },
    splitting: { icon: "✂️", color: "text-[hsl(var(--warning))]" },
    transcribing: { icon: "🎙️", color: "text-[hsl(var(--cyan))]" },
    merging: { icon: "🔗", color: "text-[hsl(var(--cyan))]" },
    complete: { icon: "✅", color: "text-[hsl(var(--success))]" },
  };

  const currentStageConfig = stageConfig[progressState.stage] || {
    icon: "⏳",
    color: "text-[hsl(var(--text-muted))]",
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl">
        {/* Transcription Controls */}
        {!hasTranscript && (
          <div className="animate-blurIn">
            {isTranscribing ? (
              <Card variant="default" className="animate-fadeInUp">
                <CardContent className="py-8">
                  <div className="mx-auto max-w-sm">
                    {/* Progress header with stage icon */}
                    <div className="mb-6 flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-xl text-xl",
                          "bg-[hsl(185_50%_15%/0.5)]"
                        )}
                      >
                        {progressState.stage === "complete" ? (
                          <CheckIcon className="h-6 w-6 text-[hsl(var(--success))]" />
                        ) : (
                          <Spinner size="lg" variant="cyan" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={cn("text-sm font-semibold", currentStageConfig.color)}>
                          {progressState.message}
                        </p>
                        {progressState.detail && (
                          <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">
                            {progressState.detail}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[hsl(var(--text))] tabular-nums">
                          {progressState.progress}%
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <Progress value={progressState.progress} variant="cyan" className="mb-4" />

                    {/* Stage indicator */}
                    <div
                      className={cn(
                        "rounded-lg p-3 text-center",
                        "bg-[hsl(var(--surface))]",
                        "border border-[hsl(var(--glass-border))]"
                      )}
                    >
                      <p className="text-xs text-[hsl(var(--text-subtle))]">
                        {progressState.stage === "transcribing" &&
                        progressState.detail?.includes("chunk") ? (
                          <>Processing audio in segments for accuracy</>
                        ) : progressState.stage === "converting" ? (
                          <>Converting to optimal format for transcription</>
                        ) : progressState.stage === "compressing" ? (
                          <>Optimizing file size for faster processing</>
                        ) : progressState.stage === "splitting" ? (
                          <>Preparing audio segments for parallel processing</>
                        ) : progressState.stage === "merging" ? (
                          <>Combining all segments with aligned timestamps</>
                        ) : progressState.stage === "complete" ? (
                          <>All done! Your transcript is ready.</>
                        ) : (
                          <>Processing your audio file...</>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div
                onClick={startTranscription}
                className={cn(
                  "cursor-pointer rounded-xl px-6 py-10 text-center transition-all duration-150",
                  "border-2 border-dashed",
                  "bg-[hsl(var(--surface)/0.4)]",
                  "border-[hsl(var(--glass-border))]",
                  "hover:border-[hsl(0_0%_100%/0.12)]",
                  "hover:bg-[hsl(var(--surface)/0.6)]"
                )}
              >
                <div
                  className={cn(
                    "mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl",
                    "bg-[hsl(var(--raised))]",
                    "border border-[hsl(var(--glass-border))]"
                  )}
                >
                  <TextIcon className="h-6 w-6 text-[hsl(var(--text-ghost))]" />
                </div>
                <h3 className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[hsl(var(--text))]">
                  Ready to transcribe
                </h3>
                <p className="mx-auto mb-5 max-w-xs text-sm text-[hsl(var(--text-subtle))]">
                  {settings.assemblyaiApiKey || process.env.ASSEMBLYAI_API_KEY
                    ? "Using AssemblyAI with speaker diarization"
                    : "Using OpenAI Whisper for accurate word-level timestamps"}
                </p>
                <Button glow>Start Transcription</Button>

                {error && (
                  <div
                    className={cn(
                      "mt-6 rounded-lg p-4",
                      "bg-[hsl(0_50%_15%/0.4)]",
                      "border border-[hsl(var(--error)/0.2)]"
                    )}
                  >
                    <p className="text-sm font-medium text-[hsl(var(--error))]">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Transcript Display */}
        {hasTranscript && activeTranscript && (
          <Card variant="default" className="animate-scaleIn">
            <CardContent className="p-5">
              {/* Hidden audio element */}
              {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

              {/* Transcript Version Selector */}
              {hasMultipleTranscripts && activeTranscript && (
                <TranscriptVersionSelector
                  transcripts={transcripts}
                  activeTranscriptId={activeTranscript.id}
                  onSelect={setActiveTranscript}
                  onDelete={deleteTranscript}
                />
              )}

              {/* Header with playback controls */}
              <div className="mb-4 flex items-center justify-between border-b border-[hsl(var(--glass-border))] pb-4">
                <div className="flex items-center gap-3">
                  {/* Play/Pause button */}
                  <button
                    onClick={togglePlayback}
                    disabled={!audioUrl}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl transition-all",
                      "bg-[hsl(185_50%_15%/0.5)]",
                      "border border-[hsl(var(--glass-border))]",
                      "hover:bg-[hsl(185_50%_20%/0.6)]",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    {isPlaying ? (
                      <PauseIcon className="h-5 w-5 text-[hsl(var(--cyan))]" />
                    ) : (
                      <PlayIcon className="h-5 w-5 text-[hsl(var(--cyan))]" />
                    )}
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">
                      {isPlaying ? (
                        "Playing"
                      ) : (
                        <>
                          Version {transcripts.findIndex((t) => t.id === activeTranscript.id) + 1}{" "}
                          of {transcripts.length}
                          {activeTranscript.service && (
                            <span className="ml-1.5 text-xs font-normal text-[hsl(var(--text-muted))]">
                              · {formatServiceName(activeTranscript.service)}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-[hsl(var(--text-muted))] tabular-nums">
                      <span ref={currentTimeDisplayRef}>{formatTimestamp(0)}</span> /{" "}
                      {formatTimestamp(currentProject?.audioDuration || 0)}
                      <span className="mx-2">·</span>
                      {activeTranscript.words.length.toLocaleString()} words
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startTranscription}
                  disabled={isTranscribing}
                  className="text-[hsl(var(--text-subtle))]"
                >
                  {isTranscribing ? (
                    <>
                      <Spinner size="sm" variant="cyan" />
                      <span className="ml-1.5">{progressState.progress}%</span>
                    </>
                  ) : (
                    <>
                      <ReloadIcon className="mr-1.5 h-3.5 w-3.5" />
                      {hasMultipleTranscripts ? "New version" : "Re-transcribe"}
                    </>
                  )}
                </Button>
              </div>

              {/* Inline progress bar for retranscription */}
              {isTranscribing && (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[hsl(var(--cyan))]">
                      {progressState.message}
                    </span>
                    <span className="text-[hsl(var(--text-muted))] tabular-nums">
                      {progressState.progress}%
                    </span>
                  </div>
                  <Progress value={progressState.progress} variant="cyan" />
                  {progressState.detail && (
                    <p className="text-xs text-[hsl(var(--text-muted))]">{progressState.detail}</p>
                  )}
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-lg border border-[hsl(var(--error)/0.2)] bg-[hsl(0_50%_15%/0.4)] p-3">
                  <p className="text-sm font-medium text-[hsl(var(--error))]">{error}</p>
                </div>
              )}

              {/* Speaker lineup */}
              {speakers.length > 0 && (
                <SpeakerLineup
                  speakers={speakers}
                  podcastPeople={podcastPeople}
                  onSpeakerRename={handleLineupRename}
                  onCreatePerson={createPerson}
                />
              )}

              {/* Words - Segmented or Flat layout */}
              <div
                ref={wordsContainerRef}
                onContextMenu={handleContextMenu}
                className={cn(
                  "scrollbar-thin max-h-[500px] overflow-y-auto rounded-lg",
                  "bg-[hsl(var(--surface))]",
                  "border border-[hsl(var(--glass-border))]"
                )}
              >
                {activeTranscript.segments && activeTranscript.segments.length > 0 ? (
                  /* Segmented speaker view */
                  <div className="divide-y divide-[hsl(var(--glass-border))]">
                    {activeTranscript.segments.map((segment, segIdx) => {
                      const person = segment.speakerId
                        ? podcastPeople.find((p) => p.id === segment.speakerId)
                        : undefined;
                      const initials = segment.speakerLabel
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <div key={segIdx} className="group/seg p-4">
                          {/* Speaker header */}
                          <div className="mb-2 flex items-center gap-3">
                            {/* Avatar */}
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                "bg-[hsl(var(--raised))]",
                                "border border-[hsl(var(--glass-border))]"
                              )}
                            >
                              {person?.photoUrl ? (
                                <img
                                  src={getMediaUrl(person.photoUrl)}
                                  alt={person.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] font-semibold text-[hsl(var(--text-muted))]">
                                  {initials}
                                </span>
                              )}
                            </div>

                            {/* Speaker name (clickable to edit) */}
                            <div
                              className="relative"
                              ref={editingSpeakerIdx === segIdx ? speakerPopoverRef : undefined}
                            >
                              <button
                                onClick={() => {
                                  setEditingSpeakerIdx(
                                    editingSpeakerIdx === segIdx ? null : segIdx
                                  );
                                  setSpeakerNameInput(segment.speakerLabel);
                                }}
                                className={cn(
                                  "rounded-md px-2 py-0.5 text-sm font-semibold transition-colors",
                                  "text-[hsl(var(--text))]",
                                  "hover:bg-[hsl(var(--raised))]"
                                )}
                              >
                                {segment.speakerLabel}
                                <ChevronDownIcon className="ml-1 inline h-3 w-3 text-[hsl(var(--text-muted))]" />
                              </button>

                              {/* Speaker editing popover */}
                              {editingSpeakerIdx === segIdx && (
                                <div
                                  className={cn(
                                    "absolute top-full left-0 z-20 mt-1 w-64",
                                    "rounded-lg border border-[hsl(var(--glass-border))]",
                                    "bg-[hsl(var(--raised))] p-3 shadow-xl"
                                  )}
                                >
                                  {/* Name input */}
                                  <Input
                                    value={speakerNameInput}
                                    onChange={(e) => setSpeakerNameInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSpeakerSave();
                                      if (e.key === "Escape") setEditingSpeakerIdx(null);
                                    }}
                                    placeholder="Speaker name"
                                    className="mb-2 h-8 text-sm"
                                    autoFocus
                                  />

                                  {/* Apply to all checkbox */}
                                  <label className="mb-3 flex items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
                                    <input
                                      type="checkbox"
                                      checked={applyToAllSpeakers}
                                      onChange={(e) => setApplyToAllSpeakers(e.target.checked)}
                                      className="rounded"
                                    />
                                    Apply to all &quot;{segment.speakerLabel}&quot;
                                  </label>

                                  {/* Recurring people list */}
                                  {podcastPeople.length > 0 && (
                                    <>
                                      <div className="mb-2 border-t border-[hsl(var(--glass-border))] pt-2">
                                        <p className="text-[10px] font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                                          Recurring People
                                        </p>
                                      </div>
                                      <div className="max-h-32 space-y-1 overflow-y-auto">
                                        {podcastPeople.map((p) => (
                                          <button
                                            key={p.id}
                                            onClick={() => handleLinkPerson(segIdx, p)}
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors",
                                              "hover:bg-[hsl(var(--surface))]",
                                              segment.speakerId === p.id &&
                                                "bg-[hsl(185_50%_15%/0.3)]"
                                            )}
                                          >
                                            <div
                                              className={cn(
                                                "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                                "bg-[hsl(var(--surface))]"
                                              )}
                                            >
                                              {p.photoUrl ? (
                                                <img
                                                  src={getMediaUrl(p.photoUrl)}
                                                  alt={p.name}
                                                  className="h-full w-full object-cover"
                                                />
                                              ) : (
                                                <span className="text-[8px] font-semibold text-[hsl(var(--text-muted))]">
                                                  {p.name[0]?.toUpperCase()}
                                                </span>
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-xs font-medium text-[hsl(var(--text))]">
                                                {p.name}
                                              </p>
                                              <p className="text-[10px] text-[hsl(var(--text-muted))] capitalize">
                                                {p.role}
                                              </p>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    </>
                                  )}

                                  {/* Save button */}
                                  <div className="mt-2 border-t border-[hsl(var(--glass-border))] pt-2">
                                    <Button
                                      size="sm"
                                      className="w-full"
                                      onClick={handleSpeakerSave}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Timestamp */}
                            <span className="ml-auto text-xs text-[hsl(var(--text-subtle))] tabular-nums">
                              {formatTimestamp(segment.startTime)}
                            </span>

                            {/* Delete segment */}
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setConfirmDeleteSegIdx(
                                    confirmDeleteSegIdx === segIdx ? null : segIdx
                                  )
                                }
                                className={cn(
                                  "rounded p-1 transition-colors",
                                  "text-[hsl(var(--text-ghost))]",
                                  "opacity-0 group-hover/seg:opacity-100",
                                  "hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]",
                                  confirmDeleteSegIdx === segIdx &&
                                    "text-[hsl(var(--error))] opacity-100"
                                )}
                                title="Delete paragraph"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                              {confirmDeleteSegIdx === segIdx && (
                                <div
                                  ref={confirmDeleteRef}
                                  className={cn(
                                    "absolute top-full right-0 z-20 mt-1 w-48",
                                    "rounded-lg border border-[hsl(var(--glass-border))]",
                                    "bg-[hsl(var(--raised))] p-3 shadow-xl"
                                  )}
                                >
                                  <p className="mb-2 text-xs text-[hsl(var(--text-muted))]">
                                    Delete this paragraph?
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setConfirmDeleteSegIdx(null)}
                                      className={cn(
                                        "flex-1 rounded-md px-2 py-1 text-xs font-medium",
                                        "border border-[hsl(var(--glass-border))]",
                                        "text-[hsl(var(--text-muted))]",
                                        "hover:bg-[hsl(var(--surface))]"
                                      )}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => {
                                        deleteSegmentWithWords(segIdx);
                                        setConfirmDeleteSegIdx(null);
                                      }}
                                      className={cn(
                                        "flex-1 rounded-md px-2 py-1 text-xs font-medium",
                                        "bg-[hsl(var(--error))] text-white",
                                        "hover:bg-[hsl(var(--error)/0.8)]"
                                      )}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Segment words */}
                          <p className="pl-11 text-sm leading-relaxed text-[hsl(var(--text))]">
                            {activeTranscript.words
                              .slice(segment.startWordIndex, segment.endWordIndex)
                              .map((word, localIdx) => {
                                const globalIdx = segment.startWordIndex + localIdx;
                                const threshold = settings.confidenceThreshold || 0;
                                if (threshold > 0 && word.confidence < threshold) {
                                  wordRefs.current[globalIdx] = null;
                                  return null;
                                }
                                return (
                                  <React.Fragment key={globalIdx}>
                                    {editingWordIndex === globalIdx ? (
                                      <span className="mx-1 inline-flex items-center gap-1">
                                        <Input
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          onBlur={handleWordSave}
                                          className="inline-block h-6 w-auto min-w-[60px] px-2 py-0 text-sm"
                                          autoFocus
                                        />
                                        <button
                                          onClick={handleWordSave}
                                          className="text-[hsl(var(--success))] hover:opacity-80"
                                        >
                                          <CheckIcon className="h-3.5 w-3.5" />
                                        </button>
                                      </span>
                                    ) : (
                                      <span
                                        ref={(el) => {
                                          wordRefs.current[globalIdx] = el;
                                        }}
                                        data-word-index={globalIdx}
                                        onClick={(e) => handleWordClick(globalIdx, e)}
                                        className={cn(
                                          "cursor-pointer rounded px-0.5",
                                          "data-[active]:bg-[hsl(var(--cyan))] data-[active]:font-semibold data-[active]:text-[hsl(var(--bg))]",
                                          "hover:bg-[hsl(185_50%_20%/0.4)] hover:text-[hsl(var(--cyan))]"
                                        )}
                                        title={`${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}`}
                                      >
                                        {word.text}
                                      </span>
                                    )}{" "}
                                  </React.Fragment>
                                );
                              })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Flat word list (backward compat for old transcripts) */
                  <div className="p-4">
                    <p className="text-sm leading-relaxed text-[hsl(var(--text))]">
                      {activeTranscript.words.map((word, index) => {
                        const threshold = settings.confidenceThreshold || 0;
                        if (threshold > 0 && (word.confidence ?? 1) < threshold) {
                          wordRefs.current[index] = null;
                          return null;
                        }
                        return (
                          <React.Fragment key={index}>
                            {editingWordIndex === index ? (
                              <span className="mx-1 inline-flex items-center gap-1">
                                <Input
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  onBlur={handleWordSave}
                                  className="inline-block h-6 w-auto min-w-[60px] px-2 py-0 text-sm"
                                  autoFocus
                                />
                                <button
                                  onClick={handleWordSave}
                                  className="text-[hsl(var(--success))] hover:opacity-80"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <span
                                ref={(el) => {
                                  wordRefs.current[index] = el;
                                }}
                                data-word-index={index}
                                onClick={(e) => handleWordClick(index, e)}
                                className={cn(
                                  "cursor-pointer rounded px-0.5",
                                  "data-[active]:bg-[hsl(var(--cyan))] data-[active]:font-semibold data-[active]:text-[hsl(var(--bg))]",
                                  "hover:bg-[hsl(185_50%_20%/0.4)] hover:text-[hsl(var(--cyan))]"
                                )}
                                title={`${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}`}
                              >
                                {word.text}
                              </span>
                            )}{" "}
                          </React.Fragment>
                        );
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Confidence threshold slider */}
              {activeTranscript.words.some(
                (w) => w.confidence !== undefined && w.confidence < 1
              ) && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="shrink-0 text-xs text-[hsl(var(--text-subtle))]">
                    Confidence threshold
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.05"
                    value={settings.confidenceThreshold || 0}
                    onChange={(e) =>
                      updateSettings({ confidenceThreshold: parseFloat(e.target.value) })
                    }
                    className="h-1 flex-1 accent-[hsl(var(--cyan))]"
                  />
                  <span className="min-w-[2.5rem] text-right font-mono text-xs text-[hsl(var(--text-muted))] tabular-nums">
                    {(settings.confidenceThreshold || 0) === 0
                      ? "Off"
                      : (settings.confidenceThreshold || 0).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Context menu (own component to avoid re-rendering word spans) */}
              <TranscriptContextMenu
                ref={contextMenuApiRef}
                onEdit={handleMenuEdit}
                onRemove={handleMenuRemove}
                onInsert={handleMenuInsert}
                onSplit={handleMenuSplit}
                onMerge={handleMenuMerge}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
