import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MagicWandIcon,
  PlusIcon,
  ScissorsIcon,
  Cross2Icon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore, getAudioBlob } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAuthStore } from "../../stores/authStore";
import { useEpisodes } from "../../hooks/useEpisodes";
import { ClippabilityScore, Word, SpeakerSegment } from "../../lib/types";
import { retryWithBackoff, cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import { reconcileWords } from "../../lib/wordReconcile";
import { ClipEditor } from "./ClipEditor";
import { ClipStackItem } from "./ClipStackItem";
import type { SpeakerSegmentLike, MulticamOverride } from "../../../shared/multicamTransform";

/**
 * Compute segments for a clip from transcript segments.
 * Filters overlapping segments and remaps word indices to be clip-relative.
 */
function computeClipSegments(
  transcriptSegments: SpeakerSegment[] | undefined,
  transcriptWords: Word[],
  clipStartTime: number,
  clipEndTime: number
): SpeakerSegment[] | undefined {
  if (!transcriptSegments?.length) return undefined;

  // Find which transcript word indices are included in the clip (time-based filter)
  let firstGlobalIdx = -1;
  let lastGlobalIdx = -1;
  const eps = 0.05;
  for (let i = 0; i < transcriptWords.length; i++) {
    const w = transcriptWords[i];
    if (w.start >= clipStartTime - eps && w.end <= clipEndTime + eps) {
      if (firstGlobalIdx === -1) firstGlobalIdx = i;
      lastGlobalIdx = i;
    }
  }
  if (firstGlobalIdx === -1) return undefined;

  const clipEndWordIdx = lastGlobalIdx + 1; // exclusive

  return transcriptSegments
    .filter((seg) => seg.endWordIndex > firstGlobalIdx && seg.startWordIndex < clipEndWordIdx)
    .map((seg) => ({
      ...seg,
      startWordIndex: Math.max(0, seg.startWordIndex - firstGlobalIdx),
      endWordIndex: Math.min(clipEndWordIdx - firstGlobalIdx, seg.endWordIndex - firstGlobalIdx),
    }));
}

const WAVEFORM_PEAKS_PER_SECOND = 100;

export const ClipSelector: React.FC = () => {
  const {
    currentProject,
    addClip,
    removeClip,
    updateClip,
    refreshClipWords,
    removeTranscriptWord,
    updateTranscriptWord,
    getActiveTranscript,
  } = useProjectStore();
  const { settings } = useSettingsStore();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { saveClips } = useEpisodes();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState("");
  const [clipDuration, setClipDuration] = useState(settings.defaultClipDuration);
  const [clipCount, setClipCount] = useState(5);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  // Audio playback state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [viewMode, setViewMode] = useState<"editor" | "finder">("editor");
  const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playRangeEndRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const lastStateUpdateRef = useRef(0);

  // On mount, re-derive clip words from the current transcript.
  // This ensures clips always reflect the latest transcript edits,
  // even if the edit happened before the Clips page was visited.
  useEffect(() => {
    refreshClipWords();
  }, [refreshClipWords]);

  const clips = currentProject?.clips || [];
  const transcript = currentProject?.transcript;
  const activeClip = clips[activeClipIndex] || null;

  // Video podcast support
  const isVideoEpisode = currentProject?.mediaType === "video";
  const videoSources = currentProject?.videoSources;

  const speakerSegments = useMemo((): SpeakerSegmentLike[] => {
    if (!isVideoEpisode || !currentProject?.transcripts?.length) return [];
    const activeTranscript =
      currentProject.transcripts.find((t) => t.id === currentProject.activeTranscriptId) ||
      currentProject.transcripts[currentProject.transcripts.length - 1];
    if (!activeTranscript?.segments) return [];
    return activeTranscript.segments.map((s) => ({
      speakerLabel: s.speakerLabel,
      speakerId: s.speakerId,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
  }, [isVideoEpisode, currentProject?.transcripts, currentProject?.activeTranscriptId]);

  // Load audio from IndexedDB
  useEffect(() => {
    let objectUrl: string | null = null;

    const loadAudio = async () => {
      if (!currentProject?.id) return;

      const blob = await getAudioBlob(currentProject.id);
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      }
    };

    loadAudio();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [currentProject?.id]);

  // Sync clips to backend when they change (debounced)
  const clipsRef = useRef(clips);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Skip if clips haven't actually changed — use reference comparison to detect
    // ANY property change (tracks, captionStyle, background, subtitle, etc.)
    const prevClips = clipsRef.current;
    const clipsChanged =
      clips.length !== prevClips.length || clips.some((c, i) => c !== prevClips[i]);

    if (!clipsChanged || !currentProject?.id) {
      clipsRef.current = clips;
      return;
    }

    clipsRef.current = clips;

    // Debounce the sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    const doSync = () => {
      pendingSyncFnRef.current = null;
      saveClips(currentProject.id, clips)
        .then(() => {
          console.log("[ClipSelector] Synced", clips.length, "clips to backend");
        })
        .catch((err) => {
          console.error("[ClipSelector] Failed to sync clips:", err);
        });
    };

    pendingSyncFnRef.current = doSync;
    syncTimeoutRef.current = setTimeout(doSync, 2000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [clips, currentProject?.id, saveClips]);

  // Flush any pending sync on unmount so changes aren't lost
  useEffect(() => {
    return () => {
      if (pendingSyncFnRef.current) {
        pendingSyncFnRef.current();
      }
    };
  }, []);

  // Handle audio duration once loaded
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [audioUrl]);

  // Generate waveform peaks from audio
  useEffect(() => {
    if (!audioUrl) {
      setWaveformPeaks(null);
      return;
    }

    let cancelled = false;

    const generatePeaks = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (cancelled) {
          audioContext.close();
          return;
        }

        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const samplesPerPeak = Math.floor(sampleRate / WAVEFORM_PEAKS_PER_SECOND);
        const totalPeaks = Math.ceil(channelData.length / samplesPerPeak);
        const peaks = new Float32Array(totalPeaks);

        for (let i = 0; i < totalPeaks; i++) {
          const start = i * samplesPerPeak;
          const end = Math.min(start + samplesPerPeak, channelData.length);
          let max = 0;
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j]);
            if (abs > max) max = abs;
          }
          peaks[i] = max;
        }

        // Normalize
        let globalMax = 0;
        for (let i = 0; i < peaks.length; i++) {
          if (peaks[i] > globalMax) globalMax = peaks[i];
        }
        if (globalMax > 0) {
          for (let i = 0; i < peaks.length; i++) {
            peaks[i] /= globalMax;
          }
        }

        if (!cancelled) {
          setWaveformPeaks(peaks);
        }
        audioContext.close();
      } catch (err) {
        console.error("[ClipSelector] Failed to generate waveform:", err);
      }
    };

    generatePeaks();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Handle playback end events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const handleEnded = () => {
      setPlayingClipId(null);
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [audioUrl]);

  // Smooth playhead animation using requestAnimationFrame
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playingClipId || isScrubbing) return;

    const playingClip = clips.find((c) => c.id === playingClipId);
    let animationId: number;

    const updatePlayhead = () => {
      if (!audio.paused) {
        const time = audio.currentTime;
        currentTimeRef.current = time;

        // Throttle React state updates to ~30fps for playhead rendering
        const now = performance.now();
        if (now - lastStateUpdateRef.current > 33) {
          setCurrentTime(time);
          lastStateUpdateRef.current = now;
        }

        // Stop at range end (preview) or clip end
        const rangeEnd = playRangeEndRef.current;
        if (rangeEnd !== null && time >= rangeEnd) {
          audio.pause();
          setPlayingClipId(null);
          playRangeEndRef.current = null;
          return;
        }
        if (playingClip && time >= playingClip.endTime) {
          audio.pause();
          setPlayingClipId(null);
          return;
        }

        animationId = requestAnimationFrame(updatePlayhead);
      }
    };

    animationId = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [playingClipId, clips, isScrubbing]);

  // Reset active clip index when clips change
  useEffect(() => {
    if (activeClipIndex >= clips.length && clips.length > 0) {
      setActiveClipIndex(clips.length - 1);
    }
  }, [clips.length, activeClipIndex]);

  // Initialize currentTime when active clip changes or audio becomes available.
  // audioUrl is in deps so the effect re-runs once the audio element mounts
  // (audio loads asynchronously from IndexedDB).
  useEffect(() => {
    if (!activeClip) return;

    const audio = audioRef.current;
    if (
      audio &&
      audio.currentTime >= activeClip.startTime &&
      audio.currentTime <= activeClip.endTime
    ) {
      // Audio is already in this clip's range — use its position
      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
    } else {
      // Always set currentTime to clip start (even if audio isn't loaded yet)
      currentTimeRef.current = activeClip.startTime;
      setCurrentTime(activeClip.startTime);
      if (audio) {
        audio.currentTime = activeClip.startTime;
      }
    }
  }, [activeClip?.id, audioUrl]);

  const playClip = useCallback(
    (clipId: string) => {
      const audio = audioRef.current;
      const clip = clips.find((c) => c.id === clipId);
      if (!audio || !clip) return;

      // If not already at a valid position within the clip, start from beginning
      if (audio.currentTime < clip.startTime || audio.currentTime > clip.endTime) {
        audio.currentTime = clip.startTime;
      }
      playRangeEndRef.current = null;
      audio.play();
      setPlayingClipId(clipId);
    },
    [clips]
  );

  const pauseClip = useCallback(
    (clipId: string) => {
      const audio = audioRef.current;
      const clip = clips.find((c) => c.id === clipId);
      if (!audio) return;

      playRangeEndRef.current = null;
      audio.pause();
      setPlayingClipId(null);

      // Reset playhead to clip start
      if (clip) {
        audio.currentTime = clip.startTime;
        currentTimeRef.current = clip.startTime;
        setCurrentTime(clip.startTime);
      }
    },
    [clips]
  );

  const seekClip = useCallback(
    (clipId: string, time: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.currentTime = time;
      currentTimeRef.current = time;
      setCurrentTime(time);

      // If currently playing this clip, continue playing from new position
      if (playingClipId === clipId) {
        audio.play();
      }
    },
    [playingClipId]
  );

  const handleScrubStart = useCallback(() => {
    setIsScrubbing(true);
    // Pause during scrubbing for better UX
    if (audioRef.current && playingClipId) {
      audioRef.current.pause();
    }
  }, [playingClipId]);

  const handleScrubEnd = useCallback(() => {
    setIsScrubbing(false);
  }, []);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  }, [isMuted]);

  const handlePlayRange = useCallback((clipId: string, start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = start;
    currentTimeRef.current = start;
    setCurrentTime(start);
    playRangeEndRef.current = end;
    audio.play();
    setPlayingClipId(clipId);
  }, []);

  const handleBoundaryChange = useCallback(
    (clipId: string, newStart: number, newEnd: number, newWords: Word[]) => {
      updateClip(clipId, {
        startTime: newStart,
        endTime: newEnd,
        words: newWords,
        transcript: newWords.map((w) => w.text).join(" "),
        segments: computeClipSegments(
          transcript?.segments,
          transcript?.words || [],
          newStart,
          newEnd
        ),
      });
    },
    [updateClip, transcript]
  );

  const handleTranscriptEdit = useCallback(
    (clipId: string, newTranscript: string) => {
      const clip = currentProject?.clips.find((c) => c.id === clipId);
      const newWords = clip?.words ? reconcileWords(clip.words, newTranscript) : [];
      updateClip(clipId, {
        transcript: newTranscript,
        words: newWords,
      });
    },
    [updateClip, currentProject?.clips]
  );

  const handleWordsChange = useCallback(
    (clipId: string, newWords: Word[]) => {
      updateClip(clipId, {
        words: newWords,
        transcript: newWords.map((w) => w.text).join(" "),
      });
    },
    [updateClip]
  );

  const handleWordDelete = useCallback(
    (deletedWord: Word) => {
      const activeTranscript = getActiveTranscript();
      if (!activeTranscript?.words) return;
      const eps = 0.001;
      const transcriptIdx = activeTranscript.words.findIndex(
        (tw) =>
          Math.abs(tw.start - deletedWord.start) < eps && Math.abs(tw.end - deletedWord.end) < eps
      );
      if (transcriptIdx >= 0) {
        removeTranscriptWord(transcriptIdx);
      }
    },
    [getActiveTranscript, removeTranscriptWord]
  );

  const handleWordTextEdit = useCallback(
    (editedWord: Word, newText: string) => {
      const activeTranscript = getActiveTranscript();
      if (!activeTranscript?.words) return;
      const eps = 0.001;
      const transcriptIdx = activeTranscript.words.findIndex(
        (tw) =>
          Math.abs(tw.start - editedWord.start) < eps && Math.abs(tw.end - editedWord.end) < eps
      );
      if (transcriptIdx >= 0) {
        updateTranscriptWord(transcriptIdx, newText);
      }
    },
    [getActiveTranscript, updateTranscriptWord]
  );

  const handleOverridesChange = useCallback(
    (clipId: string, newOverrides: MulticamOverride[]) => {
      const clip = currentProject?.clips.find((c) => c.id === clipId);
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
      updateClip(clipId, {
        multicamLayout: { ...currentLayout, overrides: newOverrides },
      });
    },
    [currentProject?.clips, updateClip]
  );

  const handleSeek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
  }, []);

  const currentPodcastId = useAuthStore((state) => state.currentPodcastId);

  const handleDeleteClip = useCallback(
    async (clipId: string) => {
      // Remove from local state immediately
      removeClip(clipId);
      // Adjust active index if needed
      if (activeClipIndex >= clips.length - 1 && activeClipIndex > 0) {
        setActiveClipIndex(activeClipIndex - 1);
      }

      // Delete from database
      if (currentProject?.id && currentPodcastId) {
        try {
          await authFetch(
            `${settings.backendUrl || "http://localhost:3002"}/api/podcasts/${currentPodcastId}/episodes/${currentProject.id}/clips/${clipId}`,
            { method: "DELETE" }
          );
        } catch (err) {
          console.error("[ClipSelector] Failed to delete clip from DB:", err);
        }
      }
    },
    [
      removeClip,
      activeClipIndex,
      clips.length,
      currentProject?.id,
      currentPodcastId,
      settings.backendUrl,
    ]
  );

  // Check if backend is configured
  const useBackend = !!settings.backendUrl;

  const analyzeClippability = async () => {
    if (!transcript) {
      setError("No transcript available");
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
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress(10);

    try {
      let analysis: { segments: any[] };

      if (useBackend) {
        // Use backend endpoint
        setProgress(30);

        const headers = new Headers({
          "Content-Type": "application/json",
        });
        if (settings.accessCode) {
          headers.set("X-Access-Code", settings.accessCode);
        }
        if (settings.openaiApiKey) {
          headers.set("X-OpenAI-Key", settings.openaiApiKey);
        }

        const existingClipRanges = clips.map((c) => ({
          startTime: c.startTime,
          endTime: c.endTime,
        }));

        const response = await authFetch(`${settings.backendUrl}/api/analyze-clips`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            transcript: {
              words: transcript.words.map((w) => ({
                text: w.text,
                start: w.start,
                end: w.end,
              })),
            },
            clipCount,
            clipDuration,
            keywords: keywords || undefined,
            existingClips: existingClipRanges.length > 0 ? existingClipRanges : undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        analysis = await response.json();
        setProgress(70);
      } else {
        // Direct OpenAI call
        const existingClipsInstruction =
          clips.length > 0
            ? `\nIMPORTANT: The following time ranges are already used by existing clips. You MUST NOT select segments that overlap with any of these ranges by more than 5 seconds. Find clips in OTHER parts of the transcript.\nExisting clips:\n${clips.map((c) => `- ${c.startTime.toFixed(1)}s to ${c.endTime.toFixed(1)}s`).join("\n")}\n`
            : "";

        const prompt = `Analyze this podcast transcript and identify the top ${clipCount} most "clippable" segments of approximately ${clipDuration} seconds each.
${existingClipsInstruction}
For each segment, evaluate:
1. HOOK (1-10): Does it grab attention immediately?
2. CLARITY (1-10): Understandable without prior context?
3. EMOTION (1-10): Evokes feeling (funny, inspiring, surprising)?
4. QUOTABLE (1-10): Would someone want to share this?
5. COMPLETENESS (1-10): Natural start and end points?

${keywords ? `Focus on segments related to these topics/keywords: ${keywords}` : ""}

TRANSCRIPT (with timestamps in seconds):
${transcript.words.map((w) => `[${w.start.toFixed(1)}] ${w.text}`).join(" ")}

Return ONLY valid JSON in this exact format (no other text):
{
  "segments": [
    {
      "start_time": 0.0,
      "end_time": 30.0,
      "text": "the exact transcript text for this segment",
      "scores": {
        "hook": 8,
        "clarity": 9,
        "emotion": 7,
        "quotable": 8,
        "completeness": 9
      },
      "explanation": "Brief explanation of why this segment is clippable"
    }
  ]
}`;

        setProgress(30);

        const response = await retryWithBackoff(async () => {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.openaiApiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-5.2",
              messages: [
                {
                  role: "system",
                  content:
                    "You are an expert at identifying viral, engaging moments in podcast transcripts. You always return valid JSON.",
                },
                { role: "user", content: prompt },
              ],
              temperature: 0.7,
              response_format: { type: "json_object" },
            }),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API error: ${res.status}`);
          }

          return res.json();
        });

        setProgress(70);

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("No response from AI");
        }

        analysis = JSON.parse(content);
      }

      setProgress(90);

      const MAX_OVERLAP_SECONDS = 5;
      const allSegments = analysis.segments || [];

      // Filter out segments that overlap with existing clips by more than 5 seconds
      const segments =
        clips.length > 0
          ? allSegments.filter((seg: { start_time: number; end_time: number }) => {
              return !clips.some((existing) => {
                const overlap = Math.max(
                  0,
                  Math.min(seg.end_time, existing.endTime) -
                    Math.max(seg.start_time, existing.startTime)
                );
                return overlap > MAX_OVERLAP_SECONDS;
              });
            })
          : allSegments;

      if (segments.length === 0 && allSegments.length > 0) {
        throw new Error(
          "All suggested clips overlap with existing clips. Try deleting some clips first, or use manual mode to select a specific time range."
        );
      }

      let addedCount = 0;
      const startingClipNumber = clips.length + 1;
      segments.forEach(
        (segment: {
          start_time: number;
          end_time: number;
          text?: string;
          explanation?: string;
          scores: {
            hook: number;
            clarity: number;
            emotion: number;
            quotable: number;
            completeness: number;
          };
        }) => {
          const startTime = segment.start_time;
          const endTime = segment.end_time;

          const eps = 0.05;
          const segmentWords = transcript.words.filter(
            (w) => w.start >= startTime - eps && w.end <= endTime + eps
          );

          const scores = segment.scores;
          const clippabilityScore: ClippabilityScore = {
            hook: scores.hook,
            clarity: scores.clarity,
            emotion: scores.emotion,
            quotable: scores.quotable,
            completeness: scores.completeness,
            overall:
              (scores.hook +
                scores.clarity +
                scores.emotion +
                scores.quotable +
                scores.completeness) /
              5,
            explanation: segment.explanation || "",
          };

          addClip({
            projectId: currentProject!.id,
            name: `Clip ${startingClipNumber + addedCount}`,
            startTime,
            endTime,
            transcript:
              segmentWords.length > 0
                ? segmentWords.map((w) => w.text).join(" ")
                : segment.text || "",
            words: segmentWords,
            segments: computeClipSegments(
              transcript.segments,
              transcript.words,
              startTime,
              endTime
            ),
            clippabilityScore,
            isManual: false,
          });
          addedCount++;
        }
      );

      if (addedCount < allSegments.length) {
        setError(
          `Found ${allSegments.length} clips but added ${addedCount} — ${allSegments.length - addedCount} overlapped too much with existing clips.`
        );
      }

      setProgress(100);
    } catch (err) {
      console.error("Analysis error:", err);
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addManualClip = () => {
    const start = parseFloat(manualStart);
    const end = parseFloat(manualEnd);

    if (isNaN(start) || isNaN(end) || start >= end) {
      setError("Invalid time range");
      return;
    }

    if (!transcript) {
      setError("No transcript available");
      return;
    }

    const eps = 0.05;
    const segmentWords = transcript.words.filter(
      (w) => w.start >= start - eps && w.end <= end + eps
    );

    const clipNumber = clips.length + 1;
    addClip({
      projectId: currentProject!.id,
      name: `Clip ${clipNumber}`,
      startTime: start,
      endTime: end,
      transcript: segmentWords.map((w) => w.text).join(" "),
      words: segmentWords,
      segments: computeClipSegments(transcript.segments, transcript.words, start, end),
      isManual: true,
    });

    setManualStart("");
    setManualEnd("");
    setIsManualMode(false);
    setError(null);

    // Select the new clip
    setActiveClipIndex(clips.length);
  };

  const progressMessages: Record<number, string> = {
    10: "Preparing transcript...",
    30: "Sending to AI...",
    70: "Analyzing moments...",
    90: "Creating clips...",
    100: "Complete!",
  };

  const getProgressMessage = () => {
    const keys = Object.keys(progressMessages)
      .map(Number)
      .sort((a, b) => b - a);
    for (const key of keys) {
      if (progress >= key) return progressMessages[key];
    }
    return "Starting...";
  };

  // If no clips, show the finder UI
  if (clips.length === 0) {
    return (
      <div className="min-h-full p-6">
        <div className="mx-auto max-w-4xl">
          {/* AI Analysis Card */}
          <Card variant="default" className="animate-fadeIn mb-5">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--magenta)/0.15)]">
                  <MagicWandIcon className="h-4 w-4 text-[hsl(var(--magenta))]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--text))]">AI Clip Finder</p>
                  <p className="text-xs text-[hsl(var(--text-subtle))]">
                    AI analyzes your transcript for viral-worthy moments
                  </p>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="py-6">
                  <div className="mx-auto max-w-xs text-center">
                    <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--magenta)/0.1)]">
                      <Spinner className="text-[hsl(var(--magenta))]" />
                    </div>
                    <Progress value={progress} variant="cyan" className="mb-2" size="sm" />
                    <p className="text-sm text-[hsl(var(--text-muted))]">{getProgressMessage()}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                        Keywords
                      </label>
                      <Input
                        placeholder="AI, tips, funny..."
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                        Max Duration (sec)
                      </label>
                      <Input
                        type="number"
                        min={10}
                        max={60}
                        value={clipDuration}
                        onChange={(e) => setClipDuration(parseInt(e.target.value) || 30)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                        Clip Count
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={clipCount}
                        onChange={(e) => setClipCount(parseInt(e.target.value) || 5)}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={analyzeClippability} glow>
                      <MagicWandIcon className="h-3.5 w-3.5" />
                      Find Best Clips
                    </Button>
                    <Button variant="ghost" onClick={() => setIsManualMode(!isManualMode)}>
                      <PlusIcon className="h-3.5 w-3.5" />
                      Manual
                    </Button>
                  </div>
                </>
              )}

              {error && (
                <div className="mt-4 rounded-lg border border-[hsl(var(--error)/0.15)] bg-[hsl(var(--error)/0.1)] p-3">
                  <p className="text-sm text-[hsl(var(--error))]">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Selection */}
          {isManualMode && (
            <Card className="animate-fadeInDown mb-6">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[13px] font-medium text-[hsl(var(--text-primary))]">
                    Manual Clip Selection
                  </p>
                  <button
                    onClick={() => setIsManualMode(false)}
                    className="rounded p-1 text-[hsl(var(--text-tertiary))] transition-colors hover:bg-[hsl(var(--bg-surface))]"
                  >
                    <Cross2Icon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                      Start (sec)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={manualStart}
                      onChange={(e) => setManualStart(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                      End (sec)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="30.0"
                      value={manualEnd}
                      onChange={(e) => setManualEnd(e.target.value)}
                    />
                  </div>
                  <Button onClick={addManualClip}>
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hidden audio element */}
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />
          )}

          {/* Empty State */}
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]">
              <ScissorsIcon className="h-6 w-6 text-[hsl(var(--text-tertiary))]" />
            </div>
            <p className="mb-1 text-[13px] text-[hsl(var(--text-secondary))]">
              No clips selected yet
            </p>
            <p className="text-[12px] text-[hsl(var(--text-tertiary))]">
              Use the AI finder above or add clips manually
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main editor view with clips
  return (
    <div className="flex h-full flex-col">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          muted={isMuted}
          className="hidden"
        />
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Clip stack sidebar */}
        <div className="flex w-72 shrink-0 flex-col border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))]">
          {/* Sidebar header */}
          <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-4 py-3">
            <div className="flex items-center gap-2">
              <ScissorsIcon className="h-4 w-4 text-[hsl(var(--cyan))]" />
              <span className="text-sm font-medium text-[hsl(var(--text))]">
                {clips.length} Clip{clips.length !== 1 ? "s" : ""}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsManualMode(true)}
              className="h-7 px-2"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Manual selection inline */}
          {isManualMode && (
            <div className="border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium tracking-wider text-[hsl(var(--text-tertiary))] uppercase">
                  Add Manual Clip
                </span>
                <button
                  onClick={() => setIsManualMode(false)}
                  className="rounded p-0.5 text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-elevated))]"
                >
                  <Cross2Icon className="h-3 w-3" />
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Start"
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                  className="h-7 text-xs"
                />
                <Input
                  type="number"
                  step="0.1"
                  placeholder="End"
                  value={manualEnd}
                  onChange={(e) => setManualEnd(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button onClick={addManualClip} size="sm" className="h-7 px-2">
                  <PlusIcon className="h-3 w-3" />
                </Button>
              </div>
              {error && <p className="mt-1.5 text-[10px] text-[hsl(var(--error))]">{error}</p>}
            </div>
          )}

          {/* Clip list */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1.5">
              {clips.map((clip, index) => (
                <ClipStackItem
                  key={clip.id}
                  clip={clip}
                  index={index}
                  isActive={index === activeClipIndex}
                  onClick={() => setActiveClipIndex(index)}
                />
              ))}
            </div>
          </div>

          {/* View mode toggle */}
          <div className="border-t border-[hsl(var(--border-subtle))] p-2">
            <div className="flex rounded-lg bg-[hsl(var(--bg-surface))] p-1">
              <button
                onClick={() => setViewMode("editor")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  viewMode === "editor"
                    ? "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text))] shadow-sm"
                    : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
                )}
              >
                <Pencil2Icon className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => setViewMode("finder")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  viewMode === "finder"
                    ? "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text))] shadow-sm"
                    : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
                )}
              >
                <MagicWandIcon className="h-3.5 w-3.5" />
                Find
              </button>
            </div>
          </div>
        </div>

        {/* Main content - Editor or Finder */}
        <div className="flex-1 overflow-hidden bg-[hsl(var(--bg-elevated))]">
          {viewMode === "editor" && activeClip && (
            <ClipEditor
              clip={activeClip}
              index={activeClipIndex}
              totalClips={clips.length}
              isPlaying={playingClipId === activeClip.id}
              isMuted={isMuted}
              currentTime={currentTime}
              currentTimeRef={currentTimeRef}
              audioDuration={audioDuration || 1}
              transcriptWords={transcript?.words || []}
              onPlay={() => playClip(activeClip.id)}
              onPause={() => pauseClip(activeClip.id)}
              onSeek={(time) => seekClip(activeClip.id, time)}
              onDelete={() => handleDeleteClip(activeClip.id)}
              onBoundaryChange={(newStart, newEnd, newWords) =>
                handleBoundaryChange(activeClip.id, newStart, newEnd, newWords)
              }
              onTranscriptEdit={(newTranscript) =>
                handleTranscriptEdit(activeClip.id, newTranscript)
              }
              onPrevClip={() => setActiveClipIndex(Math.max(0, activeClipIndex - 1))}
              onNextClip={() => setActiveClipIndex(Math.min(clips.length - 1, activeClipIndex + 1))}
              onScrubStart={handleScrubStart}
              onScrubEnd={handleScrubEnd}
              onMuteToggle={handleMuteToggle}
              videoSources={isVideoEpisode ? videoSources : undefined}
              segments={isVideoEpisode ? speakerSegments : undefined}
              defaultVideoSourceId={currentProject?.defaultVideoSourceId}
              multicamLayout={activeClip.multicamLayout}
              onOverridesChange={(overrides) => handleOverridesChange(activeClip.id, overrides)}
              waveformPeaks={waveformPeaks}
              waveformPeaksPerSecond={WAVEFORM_PEAKS_PER_SECOND}
              onPlayRange={(start, end) => handlePlayRange(activeClip.id, start, end)}
              onWordsChange={(words) => handleWordsChange(activeClip.id, words)}
              onWordDelete={handleWordDelete}
              onWordTextEdit={handleWordTextEdit}
              onWordSeek={handleSeek}
            />
          )}

          {viewMode === "finder" && (
            <div className="flex h-full flex-col p-6">
              <div className="mx-auto w-full max-w-2xl">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-[hsl(var(--text))]">Find More Clips</h2>
                </div>

                <Card variant="default" className="mb-5">
                  <CardContent className="p-5">
                    {isAnalyzing ? (
                      <div className="py-8">
                        <div className="mx-auto max-w-xs text-center">
                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[hsl(var(--magenta)/0.1)]">
                            <Spinner className="text-[hsl(var(--magenta))]" />
                          </div>
                          <Progress value={progress} variant="cyan" className="mb-2" size="sm" />
                          <p className="text-sm text-[hsl(var(--text-muted))]">
                            {getProgressMessage()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                              Keywords (optional)
                            </label>
                            <Input
                              placeholder="AI, tips, funny..."
                              value={keywords}
                              onChange={(e) => setKeywords(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                              Max Duration (sec)
                            </label>
                            <Input
                              type="number"
                              min={10}
                              max={60}
                              value={clipDuration}
                              onChange={(e) => setClipDuration(parseInt(e.target.value) || 30)}
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                              Number of Clips
                            </label>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={clipCount}
                              onChange={(e) => setClipCount(parseInt(e.target.value) || 5)}
                            />
                          </div>
                        </div>

                        <Button onClick={analyzeClippability} glow className="w-full">
                          <MagicWandIcon className="h-4 w-4" />
                          Find {clipCount} Best Clips
                        </Button>
                      </>
                    )}

                    {error && (
                      <div className="mt-4 rounded-lg border border-[hsl(var(--error)/0.15)] bg-[hsl(var(--error)/0.1)] p-3">
                        <p className="text-sm text-[hsl(var(--error))]">{error}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Manual clip option */}
                <Card variant="default">
                  <CardContent className="p-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-[hsl(var(--text))]">
                        Manual Selection
                      </h3>
                      <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">
                        Add a clip by specifying start and end times
                      </p>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                          Start (seconds)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={manualStart}
                          onChange={(e) => setManualStart(e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-subtle))]">
                          End (seconds)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="30.0"
                          value={manualEnd}
                          onChange={(e) => setManualEnd(e.target.value)}
                        />
                      </div>
                      <Button onClick={addManualClip}>
                        <PlusIcon className="h-4 w-4" />
                        Add Clip
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
