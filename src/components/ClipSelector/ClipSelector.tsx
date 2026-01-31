import React, { useState, useEffect, useRef, useCallback } from "react";
import { MagicWandIcon, PlusIcon, ScissorsIcon, Cross2Icon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore, getAudioBlob } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ClippabilityScore, Word } from "../../lib/types";
import { retryWithBackoff, cn } from "../../lib/utils";
import { ClipCard } from "./ClipCard";

interface ClipSelectorProps {
  onComplete: () => void;
}

export const ClipSelector: React.FC<ClipSelectorProps> = ({ onComplete }) => {
  const { currentProject, addClip, removeClip, updateClip } = useProjectStore();
  const { settings } = useSettingsStore();

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
  const [acceptedClips, setAcceptedClips] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement>(null);

  const clips = currentProject?.clips || [];
  const transcript = currentProject?.transcript;

  // Load audio from IndexedDB
  useEffect(() => {
    const loadAudio = async () => {
      if (!currentProject?.id) return;

      const blob = await getAudioBlob(currentProject.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    };

    loadAudio();
  }, [currentProject?.id]);

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

  // Handle playback and auto-stop at clip end
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const playingClip = clips.find((c) => c.id === playingClipId);

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Stop at clip end
      if (playingClip && audio.currentTime >= playingClip.endTime) {
        audio.pause();
        setPlayingClipId(null);
      }
    };

    const handleEnded = () => {
      setPlayingClipId(null);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [playingClipId, clips, audioUrl]);

  const playClip = useCallback(
    (clipId: string) => {
      const audio = audioRef.current;
      const clip = clips.find((c) => c.id === clipId);
      if (!audio || !clip) return;

      // If not already at a valid position within the clip, start from beginning
      if (audio.currentTime < clip.startTime || audio.currentTime > clip.endTime) {
        audio.currentTime = clip.startTime;
      }
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

      audio.pause();
      setPlayingClipId(null);

      // Reset playhead to clip start
      if (clip) {
        audio.currentTime = clip.startTime;
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
      setCurrentTime(time);

      // If currently playing this clip, continue playing from new position
      // If not playing, just update the position (play will start from here)
      if (playingClipId === clipId) {
        audio.play();
      }
    },
    [playingClipId]
  );

  const acceptClip = useCallback((clipId: string) => {
    setAcceptedClips((prev) => new Set([...prev, clipId]));
  }, []);

  const handleBoundaryChange = useCallback(
    (clipId: string, newStart: number, newEnd: number, newWords: Word[]) => {
      updateClip(clipId, {
        startTime: newStart,
        endTime: newEnd,
        words: newWords,
        transcript: newWords.map((w) => w.text).join(" "),
      });
    },
    [updateClip]
  );

  const handleTranscriptEdit = useCallback(
    (clipId: string, newTranscript: string) => {
      updateClip(clipId, { transcript: newTranscript });
    },
    [updateClip]
  );

  // Check if backend is configured
  const useBackend = !!(settings.backendUrl && settings.accessCode);

  const analyzeClippability = async () => {
    if (!transcript) {
      setError("No transcript available");
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
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress(10);

    try {
      let analysis: { segments: any[] };

      if (useBackend) {
        // Use backend endpoint
        setProgress(30);

        const response = await fetch(`${settings.backendUrl}/api/analyze-clips`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Code": settings.accessCode!,
          },
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
        const prompt = `Analyze this podcast transcript and identify the top ${clipCount} most "clippable" segments of approximately ${clipDuration} seconds each.

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

      for (const segment of analysis.segments || []) {
        const startTime = segment.start_time;
        const endTime = segment.end_time;

        const segmentWords = transcript.words.filter(
          (w) => w.start >= startTime && w.end <= endTime
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
          explanation: segment.explanation,
        };

        addClip({
          projectId: currentProject!.id,
          name: `Clip ${clips.length + 1}`,
          startTime,
          endTime,
          transcript: segment.text || segmentWords.map((w) => w.text).join(" "),
          words: segmentWords,
          clippabilityScore,
          isManual: false,
        });
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

    const segmentWords = transcript.words.filter((w) => w.start >= start && w.end <= end);

    addClip({
      projectId: currentProject!.id,
      name: `Clip ${clips.length + 1}`,
      startTime: start,
      endTime: end,
      transcript: segmentWords.map((w) => w.text).join(" "),
      words: segmentWords,
      isManual: true,
    });

    setManualStart("");
    setManualEnd("");
    setIsManualMode(false);
    setError(null);
  };

  const progressMessages: Record<number, string> = {
    10: "Preparing transcript...",
    30: "Sending to GPT-4...",
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

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div
            className={cn(
              "mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1",
              "bg-[hsl(var(--surface))]",
              "border border-[hsl(var(--glass-border))]"
            )}
          >
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">3</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">Step 3 of 5</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
            Select Clips
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
            {clips.length > 0
              ? `${clips.length} clip${clips.length !== 1 ? "s" : ""} selected`
              : "Use AI to find viral moments or manually select segments"}
          </p>
        </div>

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
                  GPT-4 analyzes your transcript for viral-worthy moments
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
                      Duration (sec)
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
        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />}

        {/* Clips List */}
        {clips.length > 0 && (
          <Card className="animate-scaleIn mb-6">
            <CardContent className="p-5">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between border-b border-[hsl(var(--border-subtle))] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--success)/0.1)]">
                    <ScissorsIcon className="h-4 w-4 text-[hsl(var(--success))]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[hsl(var(--text-primary))]">
                      Selected Clips
                    </p>
                    <p className="text-[12px] text-[hsl(var(--text-secondary))]">
                      {clips.length} clip{clips.length !== 1 ? "s" : ""} ready for preview
                    </p>
                  </div>
                </div>
              </div>

              {/* Clips */}
              <div className="space-y-3">
                {clips.map((clip, index) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    index={index}
                    isPlaying={playingClipId === clip.id}
                    isAccepted={acceptedClips.has(clip.id)}
                    currentTime={currentTime}
                    audioDuration={audioDuration || 1}
                    transcriptWords={transcript?.words || []}
                    onPlay={() => playClip(clip.id)}
                    onPause={() => pauseClip(clip.id)}
                    onSeek={(time) => seekClip(clip.id, time)}
                    onAccept={() => acceptClip(clip.id)}
                    onReject={() => removeClip(clip.id)}
                    onBoundaryChange={(newStart, newEnd, newWords) =>
                      handleBoundaryChange(clip.id, newStart, newEnd, newWords)
                    }
                    onTranscriptEdit={(newTranscript) =>
                      handleTranscriptEdit(clip.id, newTranscript)
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {clips.length === 0 && !isAnalyzing && (
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
        )}

        {/* Continue Button */}
        <div className="mt-8 flex justify-end sm:mt-10">
          <Button onClick={onComplete} disabled={clips.length === 0} glow={clips.length > 0}>
            Continue to Preview
          </Button>
        </div>
      </div>
    </div>
  );
};
