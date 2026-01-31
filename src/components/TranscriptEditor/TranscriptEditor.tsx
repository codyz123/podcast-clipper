import React, { useState, useRef, useEffect, useCallback } from "react";
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
import { Transcript, Word } from "../../lib/types";
import { generateId, cn } from "../../lib/utils";
import { formatTimestamp } from "../../lib/formats";

// Simple relative time formatter
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface TranscriptEditorProps {
  onComplete: () => void;
}

interface ProgressState {
  stage: string;
  progress: number;
  message: string;
  detail?: string;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({ onComplete }) => {
  const {
    currentProject,
    addTranscript,
    setActiveTranscript,
    deleteTranscript,
    getActiveTranscript,
    updateTranscriptWord,
  } = useProjectStore();
  const { settings } = useSettingsStore();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState>({
    stage: "idle",
    progress: 0,
    message: "Ready",
  });
  const [error, setError] = useState<string | null>(null);
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showTranscriptSelector, setShowTranscriptSelector] = useState(false);

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Get active transcript (handles both legacy and new format)
  const activeTranscript = getActiveTranscript();
  const transcripts = currentProject?.transcripts || [];
  const hasTranscript = !!activeTranscript;
  const hasMultipleTranscripts = transcripts.length > 1;

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

  // Find active word based on current playback time using binary search
  // Returns the last word whose start time is <= current time
  const findActiveWord = useCallback(
    (time: number) => {
      if (!activeTranscript?.words || activeTranscript.words.length === 0) return -1;

      const words = activeTranscript.words;

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

      return result;
    },
    [activeTranscript?.words]
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
        setCurrentTime(time);
        const newActiveIndex = findActiveWord(time);
        setActiveWordIndex(newActiveIndex);
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
      setActiveWordIndex(-1);
      cancelAnimationFrame(animationFrameId);
    };

    // Also update on seek (when clicking words)
    const handleSeeked = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      setActiveWordIndex(findActiveWord(time));
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

  // Auto-scroll to keep active word visible
  useEffect(() => {
    if (activeWordIndex >= 0 && wordRefs.current[activeWordIndex]) {
      wordRefs.current[activeWordIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeWordIndex]);

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
    if (!audioRef.current || !activeTranscript?.words[index]) return;

    const word = activeTranscript.words[index];
    audioRef.current.currentTime = word.start;
    setActiveWordIndex(index);

    // If not playing, start playback
    if (!isPlaying) {
      audioRef.current.play();
    }
  };

  // Check if backend is configured
  const useBackend = !!(settings.backendUrl && settings.accessCode);

  const startTranscription = async () => {
    if (!currentProject?.audioPath) {
      setError("No audio file loaded");
      return;
    }

    // Check auth requirements
    if (useBackend) {
      if (!settings.backendUrl || !settings.accessCode) {
        setError("Please configure backend URL and access code in Settings");
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

    setIsTranscribing(true);
    setError(null);
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
        const response = await fetch(`${settings.backendUrl}/api/transcribe`, {
          method: "POST",
          headers: {
            "X-Access-Code": settings.accessCode!,
            Accept: "text/event-stream",
          },
          body: formData,
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
        const words: Word[] = (transcriptResponse.words || []).map((w: any) => ({
          text: w.word,
          start: w.start,
          end: w.end,
          confidence: 1,
        }));

        if (words.length === 0 && transcriptResponse.text) {
          const textWords = transcriptResponse.text.split(/\s+/);
          const duration = currentProject.audioDuration || 60;
          const avgWordDuration = duration / textWords.length;

          textWords.forEach((word: string, i: number) => {
            words.push({
              text: word,
              start: i * avgWordDuration,
              end: (i + 1) * avgWordDuration,
              confidence: 0.8,
            });
          });
        }

        const transcript: Transcript = {
          id: generateId(),
          projectId: currentProject.id,
          audioFingerprint: currentProject.audioFingerprint,
          text: transcriptResponse.text || words.map((w) => w.text).join(" "),
          words,
          language: transcriptResponse.language || "en",
          createdAt: new Date().toISOString(),
        };

        addTranscript(transcript);
        setProgressState({
          stage: "complete",
          progress: 100,
          message: "Transcription complete",
          detail: `${words.length.toLocaleString()} words`,
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

        const words: Word[] = (transcriptResponse.words || []).map((w: any) => ({
          text: w.word,
          start: w.start,
          end: w.end,
          confidence: 1,
        }));

        const transcript: Transcript = {
          id: generateId(),
          projectId: currentProject.id,
          audioFingerprint: currentProject.audioFingerprint,
          text: transcriptResponse.text || words.map((w) => w.text).join(" "),
          words,
          language: transcriptResponse.language || "en",
          createdAt: new Date().toISOString(),
        };

        addTranscript(transcript);
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
        if (message.includes("401") || message.includes("Access code required")) {
          setError("Invalid access code. Please check your settings.");
        } else if (message.includes("403")) {
          setError("Invalid access code.");
        } else if (
          message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("network")
        ) {
          setError("Cannot reach backend server. Check the URL in Settings.");
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
      setIsTranscribing(false);
    }
  };

  const handleWordClick = (index: number, e: React.MouseEvent) => {
    if (!activeTranscript?.words[index]) return;

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
    if (editingWordIndex !== null && editValue.trim()) {
      updateTranscriptWord(editingWordIndex, editValue.trim());
    }
    setEditingWordIndex(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleWordSave();
    } else if (e.key === "Escape") {
      setEditingWordIndex(null);
      setEditValue("");
    }
  };

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
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div
            className={cn(
              "mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1",
              "bg-[hsl(var(--surface))]",
              "border border-[hsl(var(--glass-border))]"
            )}
          >
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">2</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">Step 2 of 5</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
            Transcribe Audio
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
            {hasTranscript
              ? "Review and edit. Click any word to make changes."
              : "Generate word-level transcript using OpenAI Whisper"}
          </p>
        </div>

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
                  Using OpenAI Whisper for accurate word-level timestamps
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
              {hasMultipleTranscripts && (
                <div className="mb-4 border-b border-[hsl(var(--glass-border))] pb-4">
                  <div className="relative">
                    <button
                      onClick={() => setShowTranscriptSelector(!showTranscriptSelector)}
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
                          Version {transcripts.findIndex((t) => t.id === activeTranscript.id) + 1}{" "}
                          of {transcripts.length}
                        </span>
                        <span className="text-xs text-[hsl(var(--text-muted))]">
                          · {formatRelativeTime(activeTranscript.createdAt)}
                        </span>
                      </div>
                      <ChevronDownIcon
                        className={cn(
                          "h-4 w-4 text-[hsl(var(--text-muted))] transition-transform",
                          showTranscriptSelector && "rotate-180"
                        )}
                      />
                    </button>

                    {/* Dropdown */}
                    {showTranscriptSelector && (
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
                            className={cn(
                              "flex items-center justify-between p-3",
                              "hover:bg-[hsl(var(--surface))]",
                              "cursor-pointer",
                              t.id === activeTranscript.id && "bg-[hsl(185_50%_15%/0.3)]"
                            )}
                          >
                            <div
                              className="flex-1"
                              onClick={() => {
                                setActiveTranscript(t.id);
                                setShowTranscriptSelector(false);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[hsl(var(--text))]">
                                  Version {idx + 1}
                                </span>
                                {t.id === activeTranscript.id && (
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
                                {t.words.length.toLocaleString()} words ·{" "}
                                {formatRelativeTime(t.createdAt)}
                              </p>
                            </div>
                            {transcripts.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Delete this transcript version?")) {
                                    deleteTranscript(t.id);
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
                      {isPlaying ? "Playing" : "Transcript ready"}
                    </p>
                    <p className="text-xs text-[hsl(var(--text-muted))] tabular-nums">
                      {formatTimestamp(currentTime)} /{" "}
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
                  className="text-[hsl(var(--text-subtle))]"
                >
                  <ReloadIcon className="mr-1.5 h-3.5 w-3.5" />
                  {hasMultipleTranscripts ? "New version" : "Re-transcribe"}
                </Button>
              </div>

              {/* Words */}
              <div
                className={cn(
                  "scrollbar-thin max-h-[400px] overflow-y-auto rounded-lg p-4",
                  "bg-[hsl(var(--surface))]",
                  "border border-[hsl(var(--glass-border))]"
                )}
              >
                <p className="text-sm leading-relaxed text-[hsl(var(--text))]">
                  {activeTranscript.words.map((word, index) => (
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
                          onClick={(e) => handleWordClick(index, e)}
                          className={cn(
                            "cursor-pointer rounded px-0.5 transition-all duration-150",
                            activeWordIndex === index
                              ? "inline-block scale-105 bg-[hsl(var(--cyan))] font-semibold text-[hsl(var(--bg))]"
                              : "hover:bg-[hsl(185_50%_20%/0.4)] hover:text-[hsl(var(--cyan))]"
                          )}
                          title={`${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}`}
                        >
                          {word.text}
                        </span>
                      )}{" "}
                    </React.Fragment>
                  ))}
                </p>
              </div>

              <p className="mt-3 text-center text-xs text-[hsl(var(--text-subtle))]">
                Click any word to play from that point. Hold{" "}
                <kbd className="rounded bg-[hsl(var(--raised))] px-1 py-0.5 font-mono text-[10px] text-[hsl(var(--text-muted))]">
                  Alt
                </kbd>{" "}
                + click to edit.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Continue Button */}
        <div className="mt-8 flex justify-end sm:mt-10">
          <Button onClick={onComplete} disabled={!hasTranscript} glow={hasTranscript}>
            Continue to Clip Selection
          </Button>
        </div>
      </div>
    </div>
  );
};
