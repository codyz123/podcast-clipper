import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  PlayIcon,
  PauseIcon,
  TrashIcon,
  Pencil1Icon,
  TrackPreviousIcon,
  TrackNextIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { formatTimestamp, formatDuration } from "../../lib/formats";
import { Clip, Word } from "../../lib/types";
import { STOP_WORDS } from "../../lib/constants";
import { findActiveWord } from "../../lib/findActiveWord";
import { MulticamPreview } from "../VideoEditor/Preview/MulticamPreview";
import type { VideoSource } from "../../hooks/useEpisodes";
import type { SpeakerSegmentLike, MulticamOverride } from "../../../shared/multicamTransform";
import { computeSwitchingTimeline } from "../../../shared/multicamTransform";
import type { MulticamLayout } from "../../lib/types";

interface ClipEditorProps {
  clip: Clip;
  index: number;
  totalClips: number;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  currentTimeRef?: React.RefObject<number>;
  audioDuration: number;
  transcriptWords: Word[];
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onDelete: () => void;
  onBoundaryChange: (newStart: number, newEnd: number, newWords: Word[]) => void;
  onTranscriptEdit: (newTranscript: string) => void;
  onPrevClip: () => void;
  onNextClip: () => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onMuteToggle: () => void;
  // Waveform visualization
  waveformPeaks?: Float32Array | null;
  waveformPeaksPerSecond?: number;
  onPlayRange?: (start: number, end: number) => void;
  // Word timing editor
  onWordsChange: (words: Word[]) => void;
  onWordSeek?: (time: number) => void;
  // Multicam video preview
  videoSources?: VideoSource[];
  segments?: SpeakerSegmentLike[];
  defaultVideoSourceId?: string;
  // Multicam override editing
  multicamLayout?: MulticamLayout;
  onOverridesChange?: (overrides: MulticamOverride[]) => void;
  // Transcript-level word operations (propagate to source of truth)
  onWordDelete?: (word: Word) => void;
  onWordTextEdit?: (word: Word, newText: string) => void;
}

export const ClipEditor: React.FC<ClipEditorProps> = ({
  clip,
  index,
  totalClips,
  isPlaying,
  isMuted,
  currentTime,
  currentTimeRef,
  audioDuration,
  transcriptWords,
  onPlay,
  onPause,
  onSeek,
  onDelete,
  onBoundaryChange,
  onTranscriptEdit,
  onPrevClip,
  onNextClip,
  onScrubStart,
  onScrubEnd,
  onMuteToggle,
  onWordsChange,
  onWordSeek,
  videoSources,
  segments,
  defaultVideoSourceId,
  multicamLayout,
  onOverridesChange,
  onWordDelete,
  onWordTextEdit,
  waveformPeaks,
  waveformPeaksPerSecond,
  onPlayRange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(clip.transcript);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dragging, setDragging] = useState<"start" | "end" | "scrub" | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  // Word timing editor state
  const [editorMode, setEditorMode] = useState<"text" | "words" | "speakers">("words");
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [editingWordText, setEditingWordText] = useState("");

  // Imperative word highlighting — uses rAF + DOM manipulation (no React re-renders)
  const activeWordIndexRef = useRef(-1);
  const timelineWordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const chipWordRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // rAF loop for smooth word highlighting — reads time from ref, manipulates DOM directly
  useEffect(() => {
    if (!currentTimeRef) return;
    let frameId: number;

    const update = () => {
      const time = currentTimeRef.current;
      const newIndex = findActiveWord(clip.words, time);
      const prevIndex = activeWordIndexRef.current;

      if (newIndex !== prevIndex) {
        // Toggle data-active on timeline words
        const prevTimeline = timelineWordRefs.current[prevIndex];
        const nextTimeline = timelineWordRefs.current[newIndex];
        if (prevTimeline) prevTimeline.removeAttribute("data-active");
        if (nextTimeline) nextTimeline.setAttribute("data-active", "");

        // Toggle data-active on word chips
        const prevChip = chipWordRefs.current[prevIndex];
        const nextChip = chipWordRefs.current[newIndex];
        if (prevChip) prevChip.removeAttribute("data-active");
        if (nextChip) nextChip.setAttribute("data-active", "");

        activeWordIndexRef.current = newIndex;
      }

      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [clip.words, currentTimeRef]);

  // Override data and handlers
  const overrides = multicamLayout?.overrides || [];

  // Speaker colors for the speaker bar
  const SPEAKER_COLORS = [
    { bg: "hsl(200 80% 50%/0.3)", border: "hsl(200 80% 50%)", text: "hsl(200 80% 70%)" },
    { bg: "hsl(340 80% 50%/0.3)", border: "hsl(340 80% 50%)", text: "hsl(340 80% 70%)" },
    { bg: "hsl(130 60% 45%/0.3)", border: "hsl(130 60% 45%)", text: "hsl(130 60% 65%)" },
    { bg: "hsl(40 90% 50%/0.3)", border: "hsl(40 90% 50%)", text: "hsl(40 90% 70%)" },
    { bg: "hsl(270 70% 55%/0.3)", border: "hsl(270 70% 55%)", text: "hsl(270 70% 70%)" },
    { bg: "hsl(15 80% 55%/0.3)", border: "hsl(15 80% 55%)", text: "hsl(15 80% 70%)" },
  ];

  // Compute switching intervals for the speaker bar
  const switchingIntervals = useMemo(() => {
    if (!videoSources || videoSources.length <= 1 || !segments?.length) return [];
    const sourcesForTimeline = videoSources.map((s) => ({
      id: s.id,
      label: s.label,
      personId: s.personId ?? null,
      sourceType: s.sourceType,
      syncOffsetMs: s.syncOffsetMs,
      cropOffsetX: s.cropOffsetX,
      cropOffsetY: s.cropOffsetY,
      width: s.width ?? null,
      height: s.height ?? null,
      displayOrder: s.displayOrder,
    }));
    return computeSwitchingTimeline(clip.startTime, clip.endTime, segments, sourcesForTimeline, {
      defaultVideoSourceId,
      holdPreviousMs: 1500,
      minShotDurationMs: 1500,
      overrides,
    });
  }, [clip.startTime, clip.endTime, segments, videoSources, defaultVideoSourceId, overrides]);

  const handleAddOverrideAtPlayhead = useCallback(
    (videoSourceId: string) => {
      const absTime = currentTime;
      const startTime = Math.max(clip.startTime, absTime - 1);
      const endTime = Math.min(clip.endTime, absTime + 1);
      onOverridesChange?.([
        ...overrides,
        { startTime, endTime, activeVideoSourceId: videoSourceId },
      ]);
    },
    [clip, currentTime, overrides, onOverridesChange]
  );

  const handleRemoveOverride = useCallback(
    (index: number) => {
      onOverridesChange?.(overrides.filter((_, i) => i !== index));
    },
    [overrides, onOverridesChange]
  );

  const handleBoundaryChange = useCallback(
    (newStart: number, newEnd: number) => {
      const eps = 0.05;
      const newWords = transcriptWords.filter(
        (w) => w.start >= newStart - eps && w.end <= newEnd + eps
      );
      onBoundaryChange(newStart, newEnd, newWords);
    },
    [transcriptWords, onBoundaryChange]
  );

  // Timeline calculations
  const clipDuration = clip.endTime - clip.startTime;
  const BUFFER_SECONDS = Math.max(5, clipDuration * 0.2); // 20% buffer or 5s min
  const visibleStart = Math.max(0, clip.startTime - BUFFER_SECONDS);
  const visibleEnd = Math.min(audioDuration, clip.endTime + BUFFER_SECONDS);
  const visibleDuration = visibleEnd - visibleStart;

  const displayStart = useMemo(() => {
    if (dragging === "start" && dragTime !== null) {
      return Math.max(0, Math.min(dragTime, clip.endTime - 2));
    }
    return clip.startTime;
  }, [dragging, dragTime, clip.startTime, clip.endTime]);

  const displayEnd = useMemo(() => {
    if (dragging === "end" && dragTime !== null) {
      return Math.min(audioDuration, Math.max(dragTime, clip.startTime + 2));
    }
    return clip.endTime;
  }, [dragging, dragTime, clip.endTime, clip.startTime, audioDuration]);

  const clipStartPercent = ((displayStart - visibleStart) / visibleDuration) * 100;
  const clipEndPercent = ((displayEnd - visibleStart) / visibleDuration) * 100;

  const displayTime = dragging === "scrub" && dragTime !== null ? dragTime : currentTime;
  const playheadPercent = ((displayTime - visibleStart) / visibleDuration) * 100;

  const getTimeFromPosition = useCallback(
    (clientX: number): number => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return visibleStart + percent * visibleDuration;
    },
    [visibleStart, visibleDuration]
  );

  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const time = getTimeFromPosition(e.clientX);
    const clampedTime = Math.max(clip.startTime, Math.min(clip.endTime, time));

    setDragging("scrub");
    setDragTime(clampedTime);
    onScrubStart();
    onSeek(clampedTime);
  };

  const handleHandleMouseDown = (handle: "start" | "end") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    setDragTime(handle === "start" ? clip.startTime : clip.endTime);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newTime = getTimeFromPosition(e.clientX);

      if (dragging === "scrub") {
        const clampedTime = Math.max(clip.startTime, Math.min(clip.endTime, newTime));
        setDragTime(clampedTime);
        onSeek(clampedTime);
      } else {
        setDragTime(newTime);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragging === "start" || dragging === "end") {
        const newTime = getTimeFromPosition(e.clientX);
        let newStart = clip.startTime;
        let newEnd = clip.endTime;

        if (dragging === "start") {
          newStart = Math.max(0, Math.min(newTime, clip.endTime - 2));
        } else {
          newEnd = Math.min(audioDuration, Math.max(newTime, clip.startTime + 2));
        }

        handleBoundaryChange(newStart, newEnd);
      } else if (dragging === "scrub") {
        onScrubEnd();
      }

      setDragging(null);
      setDragTime(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragging,
    clip.startTime,
    clip.endTime,
    audioDuration,
    getTimeFromPosition,
    handleBoundaryChange,
    onSeek,
    onScrubEnd,
  ]);

  // Render waveform on canvas
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformPeaks || !waveformPeaksPerSecond) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const startPeak = Math.floor(visibleStart * waveformPeaksPerSecond);
    const endPeak = Math.ceil(visibleEnd * waveformPeaksPerSecond);
    const totalVisiblePeaks = endPeak - startPeak;

    if (totalVisiblePeaks <= 0) return;

    // Render pixel-aligned bars: 2px wide with 1px gap
    const BAR_WIDTH = 2;
    const BAR_GAP = 1;
    const slotWidth = BAR_WIDTH + BAR_GAP;
    const barCount = Math.floor(width / slotWidth);
    const centerY = height / 2;

    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";

    for (let i = 0; i < barCount; i++) {
      // Map each bar to a range of peaks and take the max
      const pStart = startPeak + Math.floor((i / barCount) * totalVisiblePeaks);
      const pEnd = startPeak + Math.floor(((i + 1) / barCount) * totalVisiblePeaks);

      let max = 0;
      for (let j = Math.max(0, pStart); j < Math.min(pEnd, waveformPeaks.length); j++) {
        if (waveformPeaks[j] > max) max = waveformPeaks[j];
      }

      const barHeight = Math.max(1, max * height * 0.8);
      const x = i * slotWidth;

      ctx.fillRect(x, centerY - barHeight / 2, BAR_WIDTH, barHeight);
    }
  }, [waveformPeaks, waveformPeaksPerSecond, visibleStart, visibleEnd]);

  const cleanTimestamps = (text: string) => text.replace(/\[\d+\.?\d*\]\s*/g, "").trim();

  const startEditing = () => {
    setEditText(cleanTimestamps(clip.transcript));
    setIsEditing(true);
  };

  const saveEdit = () => {
    onTranscriptEdit(editText);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditText(cleanTimestamps(clip.transcript));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // Word timing editor handlers
  const handleWordClick = useCallback(
    (index: number) => {
      setSelectedWordIndex(index);
      setEditingWordText(clip.words[index]?.text || "");
      if (onWordSeek && clip.words[index]) {
        onWordSeek(clip.words[index].start);
      }
    },
    [clip.words, onWordSeek]
  );

  const handleWordTextSave = useCallback(
    (index: number, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed || !clip.words[index]) return;
      if (onWordTextEdit) {
        // Propagate to transcript (source of truth) — also re-derives clip words
        onWordTextEdit(clip.words[index], trimmed);
      } else {
        // Fallback: update clip words only
        const updated = clip.words.map((w, i) => (i === index ? { ...w, text: trimmed } : w));
        onWordsChange(updated);
      }
    },
    [clip.words, onWordsChange, onWordTextEdit]
  );

  const handleWordTimeNudge = useCallback(
    (index: number, field: "start" | "end", deltaMs: number) => {
      const word = clip.words[index];
      if (!word) return;
      const delta = deltaMs / 1000;
      const updated = clip.words.map((w, i) => {
        if (i !== index) return w;
        if (field === "start") {
          const newStart = Math.max(clip.startTime, Math.min(w.start + delta, w.end - 0.01));
          return { ...w, start: Math.round(newStart * 1000) / 1000 };
        } else {
          const newEnd = Math.min(clip.endTime, Math.max(w.end + delta, w.start + 0.01));
          return { ...w, end: Math.round(newEnd * 1000) / 1000 };
        }
      });
      onWordsChange(updated);
    },
    [clip.words, clip.startTime, clip.endTime, onWordsChange]
  );

  const handleMergeWords = useCallback(
    (index: number, direction: "left" | "right") => {
      const targetIdx = direction === "left" ? index - 1 : index;
      if (targetIdx < 0 || targetIdx + 1 >= clip.words.length) return;
      const a = clip.words[targetIdx];
      const b = clip.words[targetIdx + 1];
      const merged: Word = {
        text: `${a.text} ${b.text}`,
        start: a.start,
        end: b.end,
        confidence: Math.min(a.confidence, b.confidence),
      };
      const updated = [
        ...clip.words.slice(0, targetIdx),
        merged,
        ...clip.words.slice(targetIdx + 2),
      ];
      onWordsChange(updated);
      setSelectedWordIndex(targetIdx);
      setEditingWordText(merged.text);
    },
    [clip.words, onWordsChange]
  );

  const handleSplitWord = useCallback(
    (index: number) => {
      const word = clip.words[index];
      if (!word || word.text.length < 2) return;
      const midChar = Math.floor(word.text.length / 2);
      const midTime = (word.start + word.end) / 2;
      const first: Word = {
        text: word.text.slice(0, midChar),
        start: word.start,
        end: midTime,
        confidence: word.confidence,
      };
      const second: Word = {
        text: word.text.slice(midChar),
        start: midTime,
        end: word.end,
        confidence: word.confidence,
      };
      const updated = [
        ...clip.words.slice(0, index),
        first,
        second,
        ...clip.words.slice(index + 1),
      ];
      onWordsChange(updated);
      setSelectedWordIndex(index);
      setEditingWordText(first.text);
    },
    [clip.words, onWordsChange]
  );

  const handleDeleteWord = useCallback(
    (index: number) => {
      const word = clip.words[index];
      if (!word) return;
      if (onWordDelete) {
        // Propagate to transcript (source of truth) — also re-derives clip words
        onWordDelete(word);
      } else {
        // Fallback: update clip words only (won't persist across remounts)
        const updated = clip.words.filter((_, i) => i !== index);
        onWordsChange(updated);
      }
      setSelectedWordIndex(null);
    },
    [clip.words, onWordsChange, onWordDelete]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return;
      // Don't capture shortcuts when typing in word editor input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) {
          onPause();
        } else {
          onPlay();
        }
      } else if (e.code === "ArrowLeft" && e.metaKey) {
        e.preventDefault();
        onPrevClip();
      } else if (e.code === "ArrowRight" && e.metaKey) {
        e.preventDefault();
        onNextClip();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        onSeek(Math.max(clip.startTime, currentTime - 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        onSeek(Math.min(clip.endTime, currentTime + 1));
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    isEditing,
    isPlaying,
    onPlay,
    onPause,
    onPrevClip,
    onNextClip,
    onSeek,
    currentTime,
    clip.startTime,
    clip.endTime,
  ]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevClip}
              disabled={index === 0}
              className={cn(
                "rounded-md p-2 transition-all",
                index === 0
                  ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.5)]"
                  : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
              )}
              title="Previous clip (⌘←)"
            >
              <TrackPreviousIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[60px] text-center font-mono text-sm text-[hsl(var(--text-secondary))]">
              {index + 1} / {totalClips}
            </span>
            <button
              onClick={onNextClip}
              disabled={index === totalClips - 1}
              className={cn(
                "rounded-md p-2 transition-all",
                index === totalClips - 1
                  ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.5)]"
                  : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
              )}
              title="Next clip (⌘→)"
            >
              <TrackNextIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-[hsl(var(--border-subtle))]" />

          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-[hsl(var(--text))]">{clip.name}</h2>
            {clip.isManual && (
              <span className="rounded bg-[hsl(var(--bg-surface))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-tertiary))]">
                Manual
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[hsl(var(--text-secondary))]">Delete this clip?</span>
              <button
                onClick={() => {
                  onDelete();
                  setConfirmingDelete(false);
                }}
                className="rounded-md bg-[hsl(var(--error))] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[hsl(var(--error)/0.85)]"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Video preview (multicam) */}
        {videoSources && videoSources.length > 0 && (
          <div className="flex items-center justify-center border-b border-[hsl(var(--border-subtle))] bg-black p-4">
            <div
              className="relative overflow-hidden rounded-lg"
              style={{ width: 480, height: 270 }}
            >
              <MulticamPreview
                videoSources={videoSources.map((s) => ({
                  id: s.id,
                  label: s.label,
                  personId: s.personId ?? null,
                  sourceType: s.sourceType,
                  syncOffsetMs: s.syncOffsetMs,
                  cropOffsetX: s.cropOffsetX,
                  cropOffsetY: s.cropOffsetY,
                  width: s.width ?? null,
                  height: s.height ?? null,
                  displayOrder: s.displayOrder,
                  proxyBlobUrl: s.proxyBlobUrl,
                }))}
                segments={segments || []}
                currentTime={currentTime - clip.startTime}
                clipStartTime={clip.startTime}
                width={480}
                height={270}
                layoutMode={multicamLayout?.mode || "active-speaker"}
                pipEnabled={false}
                pipPositions={[]}
                pipScale={0.2}
                defaultVideoSourceId={defaultVideoSourceId}
                overrides={multicamLayout?.overrides}
                transitionStyle={multicamLayout?.transitionStyle || "cut"}
              />
            </div>
          </div>
        )}

        {/* Speaker segment bar (multicam episodes with 2+ sources) */}
        {videoSources && videoSources.length > 1 && switchingIntervals.length > 0 && (
          <div className="relative mx-6 mt-3 h-6 overflow-hidden rounded border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))]">
            {switchingIntervals.map((interval, i) => {
              const clipDur = clip.endTime - clip.startTime;
              const left = ((interval.startTime - clip.startTime) / clipDur) * 100;
              const width = ((interval.endTime - interval.startTime) / clipDur) * 100;
              const source = videoSources.find((s) => s.id === interval.videoSourceId);
              const colorIdx = source ? videoSources.indexOf(source) : 0;
              const color = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length];
              const isOverride = overrides.some(
                (o) =>
                  interval.startTime >= o.startTime - 0.05 && interval.endTime <= o.endTime + 0.05
              );
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 cursor-pointer"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: color.bg,
                    borderTop: isOverride ? `2px dashed ${color.border}` : undefined,
                  }}
                  onClick={() => onSeek(interval.startTime)}
                  title={`${source?.label || "Unknown"} (${isOverride ? "manual" : "auto"})`}
                >
                  {width > 8 && (
                    <span
                      className="truncate px-1 text-[8px] leading-6 font-medium"
                      style={{ color: color.text }}
                    >
                      {source?.label}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Playhead on speaker bar */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-white"
              style={{
                left: `${((currentTime - clip.startTime) / (clip.endTime - clip.startTime)) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Timeline section */}
        <div className="flex-1 p-6">
          {/* Large timeline */}
          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            className={cn(
              "relative h-32 cursor-crosshair overflow-hidden rounded-lg",
              "bg-[hsl(var(--bg-base))]",
              "border border-[hsl(var(--border-subtle))]",
              dragging === "scrub" && "cursor-ew-resize"
            )}
          >
            {/* Background track */}
            <div className="absolute inset-0 bg-[hsl(var(--bg-surface))]" />

            {/* Waveform */}
            {waveformPeaks && (
              <canvas
                ref={waveformCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            )}

            {/* Selected region */}
            <div
              className={cn(
                "absolute top-0 bottom-0",
                dragging ? "bg-[hsl(var(--cyan)/0.35)]" : "bg-[hsl(var(--cyan)/0.2)]"
              )}
              style={{
                left: `${clipStartPercent}%`,
                width: `${Math.max(0, clipEndPercent - clipStartPercent)}%`,
              }}
            />

            {/* Waveform placeholder / Words overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-8">
              <div className="relative h-full w-full">
                {(() => {
                  // First pass: determine which words to show based on spacing alone
                  const MIN_PERCENT_GAP = 4;
                  let lastShownPercent = -Infinity;
                  const wordsToShow = new Set<number>();

                  clip.words.forEach((word, i) => {
                    const wordMidpoint = (word.start + word.end) / 2;
                    const wordPercent = ((wordMidpoint - visibleStart) / visibleDuration) * 100;

                    if (wordPercent < -5 || wordPercent > 105) return;

                    const isStopWord = STOP_WORDS.has(
                      word.text.toLowerCase().replace(/[^a-z]/g, "")
                    );

                    if (isStopWord && wordPercent - lastShownPercent < MIN_PERCENT_GAP * 1.5) {
                      return;
                    }
                    if (wordPercent - lastShownPercent < MIN_PERCENT_GAP) {
                      return;
                    }

                    wordsToShow.add(i);
                    lastShownPercent = wordPercent;
                  });

                  // Second pass: render the words (active word always shown via data-active)
                  return clip.words.map((word, i) => {
                    const wordMidpoint = (word.start + word.end) / 2;
                    const wordPercent = ((wordMidpoint - visibleStart) / visibleDuration) * 100;

                    if (wordPercent < -5 || wordPercent > 105) return null;

                    if (!wordsToShow.has(i)) return null;

                    return (
                      <span
                        key={i}
                        ref={(el) => {
                          timelineWordRefs.current[i] = el;
                        }}
                        className={cn(
                          "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-medium whitespace-nowrap transition-all duration-75",
                          "text-xs text-[hsl(var(--text-tertiary))] opacity-60",
                          "data-[active]:z-10 data-[active]:rounded-md data-[active]:bg-[hsl(var(--text))] data-[active]:px-2 data-[active]:py-1 data-[active]:text-sm data-[active]:text-[hsl(var(--bg-base))] data-[active]:opacity-100"
                        )}
                        style={{ left: `${wordPercent}%` }}
                      >
                        {word.text}
                      </span>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-[hsl(var(--text))]"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm bg-[hsl(var(--text))]" />
            </div>

            {/* Start handle */}
            <div
              className="group/handle absolute top-0 bottom-0 z-30 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${clipStartPercent}%` }}
              onMouseDown={handleHandleMouseDown("start")}
            >
              <div
                className={cn(
                  "h-full w-[2px] rounded-full transition-all duration-150",
                  dragging === "start"
                    ? "bg-[hsl(var(--cyan))] shadow-[0_0_8px_hsl(var(--cyan)/0.6)]"
                    : "bg-[hsl(var(--cyan)/0.35)] group-hover/handle:bg-[hsl(var(--cyan)/0.7)]"
                )}
              />
            </div>

            {/* End handle */}
            <div
              className="group/handle absolute top-0 bottom-0 z-30 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${clipEndPercent}%` }}
              onMouseDown={handleHandleMouseDown("end")}
            >
              <div
                className={cn(
                  "h-full w-[2px] rounded-full transition-all duration-150",
                  dragging === "end"
                    ? "bg-[hsl(var(--cyan))] shadow-[0_0_8px_hsl(var(--cyan)/0.6)]"
                    : "bg-[hsl(var(--cyan)/0.35)] group-hover/handle:bg-[hsl(var(--cyan)/0.7)]"
                )}
              />
            </div>

            {/* Time markers */}
            <div className="absolute bottom-2 left-3 font-mono text-xs text-[hsl(var(--text-tertiary))] opacity-60">
              {formatTimestamp(visibleStart)}
            </div>
            <div className="absolute right-3 bottom-2 font-mono text-xs text-[hsl(var(--text-tertiary))] opacity-60">
              {formatTimestamp(visibleEnd)}
            </div>
          </div>

          {/* Time display row */}
          <div className="mt-4 flex items-center justify-between">
            <div className="font-mono text-lg text-[hsl(var(--text-secondary))]">
              <span className="text-[hsl(var(--text))]">{formatTimestamp(displayTime)}</span>
              <span className="mx-2 text-[hsl(var(--text-tertiary))]">/</span>
              <span>{formatDuration(clip.endTime - clip.startTime)}</span>
            </div>

            {/* Transport controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSeek(clip.startTime)}
                className="rounded-md p-2 text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                title="Go to start"
              >
                <TrackPreviousIcon className="h-5 w-5" />
              </button>

              <button
                onClick={isPlaying ? onPause : onPlay}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-all",
                  isPlaying
                    ? "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))] hover:bg-[hsl(var(--cyan)/0.85)]"
                    : "bg-[hsl(var(--bg-surface))] text-[hsl(var(--text))] hover:bg-[hsl(var(--bg-elevated))]"
                )}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? (
                  <PauseIcon className="h-6 w-6" />
                ) : (
                  <PlayIcon className="h-6 w-6 translate-x-0.5" />
                )}
              </button>

              <button
                onClick={() => onSeek(clip.endTime)}
                className="rounded-md p-2 text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                title="Go to end"
              >
                <TrackNextIcon className="h-5 w-5" />
              </button>

              <div className="mx-2 h-5 w-px bg-[hsl(var(--border-subtle))]" />

              <button
                onClick={onMuteToggle}
                className={cn(
                  "rounded-md p-2 transition-all",
                  isMuted
                    ? "text-[hsl(var(--error))]"
                    : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                )}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <SpeakerOffIcon className="h-5 w-5" />
                ) : (
                  <SpeakerLoudIcon className="h-5 w-5" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onPlayRange && (
                <button
                  onClick={() =>
                    onPlayRange(Math.max(0, clip.startTime - 1.5), clip.startTime + 1.5)
                  }
                  className="rounded-md px-2 py-1 text-[10px] font-medium text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--cyan))]"
                  title="Preview around start point"
                >
                  Preview In
                </button>
              )}
              <span className="font-mono text-sm text-[hsl(var(--text-tertiary))]">
                {formatTimestamp(clip.startTime)} — {formatTimestamp(clip.endTime)}
              </span>
              {onPlayRange && (
                <button
                  onClick={() =>
                    onPlayRange(clip.endTime - 1.5, Math.min(audioDuration, clip.endTime + 1.5))
                  }
                  className="rounded-md px-2 py-1 text-[10px] font-medium text-[hsl(var(--text-tertiary))] transition-all hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--cyan))]"
                  title="Preview around end point"
                >
                  Preview Out
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Transcript section with Words/Text tabs */}
        <div className="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface)/0.5)] p-6">
          {/* Tab bar */}
          <div className="mb-3 flex items-center gap-1">
            <button
              onClick={() => {
                setEditorMode("words");
                setSelectedWordIndex(null);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                editorMode === "words"
                  ? "bg-[hsl(var(--bg-surface))] text-[hsl(var(--text))]"
                  : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
              )}
            >
              Words
            </button>
            <button
              onClick={() => {
                setEditorMode("text");
                setSelectedWordIndex(null);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                editorMode === "text"
                  ? "bg-[hsl(var(--bg-surface))] text-[hsl(var(--text))]"
                  : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
              )}
            >
              Text
            </button>
            {videoSources && videoSources.length > 1 && (
              <button
                onClick={() => {
                  setEditorMode("speakers");
                  setSelectedWordIndex(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  editorMode === "speakers"
                    ? "bg-[hsl(var(--bg-surface))] text-[hsl(var(--text))]"
                    : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
                )}
              >
                Speakers
              </button>
            )}
          </div>

          {editorMode === "speakers" && videoSources ? (
            /* Speakers mode: override list + add buttons */
            <div>
              <p className="mb-3 text-xs text-[hsl(var(--text-muted))]">
                Add manual overrides to control which camera is active at specific times.
              </p>

              {/* Existing overrides list */}
              {overrides.map((o, idx) => (
                <div
                  key={idx}
                  className="mb-1.5 flex items-center gap-2 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] px-3 py-2"
                >
                  <span className="font-mono text-xs text-[hsl(var(--text-muted))]">
                    {formatTimestamp(o.startTime)} – {formatTimestamp(o.endTime)}
                  </span>
                  <span className="flex-1 text-xs font-medium text-[hsl(var(--text-secondary))]">
                    {videoSources.find((s) => s.id === o.activeVideoSourceId)?.label || "Unknown"}
                  </span>
                  <button
                    onClick={() => handleRemoveOverride(idx)}
                    className="rounded p-1 text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Add at playhead */}
              <div className="mt-3">
                <span className="mb-1.5 block text-xs text-[hsl(var(--text-muted))]">
                  Set speaker at {formatTimestamp(currentTime)}:
                </span>
                <div className="flex flex-wrap gap-2">
                  {videoSources
                    .filter((s) => s.sourceType === "speaker")
                    .map((source) => (
                      <button
                        key={source.id}
                        onClick={() => handleAddOverrideAtPlayhead(source.id)}
                        className="rounded-md border border-[hsl(var(--border-subtle))] px-2 py-1 text-[10px] font-medium text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--cyan)/0.5)] hover:bg-[hsl(var(--cyan)/0.1)]"
                      >
                        {source.label}
                      </button>
                    ))}
                </div>
              </div>

              {overrides.length > 0 && (
                <button
                  onClick={() => onOverridesChange?.([])}
                  className="mt-3 text-[10px] text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--error))]"
                >
                  Clear all overrides
                </button>
              )}
            </div>
          ) : editorMode === "text" ? (
            /* Text mode: existing textarea editing */
            isEditing ? (
              <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className={cn(
                    "w-full resize-none rounded-md p-3 text-sm",
                    "border border-[hsl(var(--border-default))] bg-[hsl(var(--bg-base))]",
                    "text-[hsl(var(--text-secondary))]",
                    "focus:ring-2 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                  )}
                  rows={4}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={saveEdit}
                    className="rounded-md bg-[hsl(var(--cyan))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--bg-base))] transition-colors hover:bg-[hsl(var(--cyan)/0.85)]"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))]"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-[hsl(var(--text-tertiary))]">
                    Enter to save, Esc to cancel
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
                  "{clip.words.map((w) => w.text).join(" ")}"
                </p>
                <button
                  onClick={startEditing}
                  className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                >
                  <Pencil1Icon className="h-3 w-3" />
                  Edit transcript text
                </button>
              </div>
            )
          ) : (
            /* Words mode: clickable word chips with edit panel */
            <div>
              {/* Word chips */}
              <div className="flex flex-wrap gap-1.5">
                {clip.words.map((word, i) => (
                  <button
                    key={i}
                    ref={(el) => {
                      chipWordRefs.current[i] = el;
                    }}
                    onClick={() => handleWordClick(i)}
                    className={cn(
                      "rounded-md px-2 py-1 text-sm font-medium transition-all",
                      "bg-[hsl(var(--bg-base))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-surface))]",
                      "data-[active]:bg-[hsl(var(--cyan)/0.3)] data-[active]:text-[hsl(var(--text))]",
                      selectedWordIndex === i &&
                        "bg-[hsl(var(--bg-surface))] text-[hsl(var(--text))] ring-2 ring-[hsl(var(--cyan))]"
                    )}
                  >
                    {word.text}
                  </button>
                ))}
              </div>

              {/* Edit panel for selected word */}
              {selectedWordIndex !== null && clip.words[selectedWordIndex] && (
                <div className="mt-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] p-3">
                  {/* Word text */}
                  <div className="mb-3 flex items-center gap-2">
                    <label className="text-xs text-[hsl(var(--text-tertiary))]">Text</label>
                    <input
                      type="text"
                      value={editingWordText}
                      onChange={(e) => setEditingWordText(e.target.value)}
                      onBlur={() => handleWordTextSave(selectedWordIndex, editingWordText)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleWordTextSave(selectedWordIndex, editingWordText);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1 text-sm",
                        "border border-[hsl(var(--border-default))] bg-[hsl(var(--bg-surface))]",
                        "text-[hsl(var(--text))]",
                        "focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                      )}
                    />
                  </div>

                  {/* Timing controls */}
                  <div className="mb-3 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-[hsl(var(--text-tertiary))]">Start</label>
                      <span className="w-14 text-right font-mono text-xs text-[hsl(var(--text-secondary))]">
                        {clip.words[selectedWordIndex].start.toFixed(2)}s
                      </span>
                      <button
                        onClick={() => handleWordTimeNudge(selectedWordIndex, "start", -10)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      >
                        -10ms
                      </button>
                      <button
                        onClick={() => handleWordTimeNudge(selectedWordIndex, "start", 10)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      >
                        +10ms
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-[hsl(var(--text-tertiary))]">End</label>
                      <span className="w-14 text-right font-mono text-xs text-[hsl(var(--text-secondary))]">
                        {clip.words[selectedWordIndex].end.toFixed(2)}s
                      </span>
                      <button
                        onClick={() => handleWordTimeNudge(selectedWordIndex, "end", -10)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      >
                        -10ms
                      </button>
                      <button
                        onClick={() => handleWordTimeNudge(selectedWordIndex, "end", 10)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      >
                        +10ms
                      </button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMergeWords(selectedWordIndex, "left")}
                      disabled={selectedWordIndex === 0}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        selectedWordIndex === 0
                          ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.4)]"
                          : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      )}
                    >
                      Merge &larr;
                    </button>
                    <button
                      onClick={() => handleMergeWords(selectedWordIndex, "right")}
                      disabled={selectedWordIndex >= clip.words.length - 1}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        selectedWordIndex >= clip.words.length - 1
                          ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.4)]"
                          : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      )}
                    >
                      Merge &rarr;
                    </button>
                    <button
                      onClick={() => handleSplitWord(selectedWordIndex)}
                      disabled={clip.words[selectedWordIndex].text.length < 2}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        clip.words[selectedWordIndex].text.length < 2
                          ? "cursor-not-allowed text-[hsl(var(--text-tertiary)/0.4)]"
                          : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-secondary))]"
                      )}
                    >
                      Split
                    </button>

                    <div className="mx-1 h-4 w-px bg-[hsl(var(--border-subtle))]" />

                    <button
                      onClick={() => handleDeleteWord(selectedWordIndex)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
