import React, { useState } from "react";
import {
  MagicWandIcon,
  PlusIcon,
  TrashIcon,
  StarFilledIcon,
  ScissorsIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ClippabilityScore } from "../../lib/types";
import { formatDuration, formatTimestamp } from "../../lib/formats";
import { retryWithBackoff, cn } from "../../lib/utils";

interface ClipSelectorProps {
  onComplete: () => void;
}

export const ClipSelector: React.FC<ClipSelectorProps> = ({ onComplete }) => {
  const { currentProject, addClip, removeClip } = useProjectStore();
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

  const clips = currentProject?.clips || [];
  const transcript = currentProject?.transcript;

  const analyzeClippability = async () => {
    if (!transcript) {
      setError("No transcript available");
      return;
    }

    if (!settings.openaiApiKey) {
      setError("Please set your OpenAI API key in Settings");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress(10);

    try {
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
            model: "gpt-4-turbo-preview",
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

      const analysis = JSON.parse(content);

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
            (scores.hook + scores.clarity + scores.emotion + scores.quotable + scores.completeness) / 5,
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

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-[hsl(var(--success))]";
    if (score >= 6) return "text-[hsl(var(--primary))]";
    return "text-[hsl(var(--text-tertiary))]";
  };

  const progressMessages: Record<number, string> = {
    10: "Preparing transcript...",
    30: "Sending to GPT-4...",
    70: "Analyzing moments...",
    90: "Creating clips...",
    100: "Complete!",
  };

  const getProgressMessage = () => {
    const keys = Object.keys(progressMessages).map(Number).sort((a, b) => b - a);
    for (const key of keys) {
      if (progress >= key) return progressMessages[key];
    }
    return "Starting...";
  };

  return (
    <div className="min-h-full">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4",
            "bg-[hsl(var(--surface))]",
            "border border-[hsl(var(--glass-border))]"
          )}>
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">3</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">
              Step 3 of 5
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--text))] tracking-tight font-[family-name:var(--font-display)]">
            Select Clips
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-sm">
            {clips.length > 0
              ? `${clips.length} clip${clips.length !== 1 ? "s" : ""} selected`
              : "Use AI to find viral moments or manually select segments"}
          </p>
        </div>

        {/* AI Analysis Card */}
        <Card variant="default" className="mb-5 animate-fadeIn">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-[hsl(var(--magenta)/0.15)] flex items-center justify-center">
                <MagicWandIcon className="w-4 h-4 text-[hsl(var(--magenta))]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[hsl(var(--text))]">
                  AI Clip Finder
                </p>
                <p className="text-xs text-[hsl(var(--text-subtle))]">
                  GPT-4 analyzes your transcript for viral-worthy moments
                </p>
              </div>
            </div>

            {isAnalyzing ? (
              <div className="py-6">
                <div className="max-w-xs mx-auto text-center">
                  <div className="w-10 h-10 mx-auto mb-4 rounded-lg bg-[hsl(var(--magenta)/0.1)] flex items-center justify-center">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-[hsl(var(--text-subtle))] mb-1.5">
                      Keywords
                    </label>
                    <Input
                      placeholder="AI, tips, funny..."
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[hsl(var(--text-subtle))] mb-1.5">
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
                    <label className="block text-xs font-medium text-[hsl(var(--text-subtle))] mb-1.5">
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
                    <MagicWandIcon className="w-3.5 h-3.5" />
                    Find Best Clips
                  </Button>
                  <Button variant="ghost" onClick={() => setIsManualMode(!isManualMode)}>
                    <PlusIcon className="w-3.5 h-3.5" />
                    Manual
                  </Button>
                </div>
              </>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-[hsl(var(--error)/0.1)] border border-[hsl(var(--error)/0.15)]">
                <p className="text-sm text-[hsl(var(--error))]">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Selection */}
        {isManualMode && (
          <Card className="mb-6 animate-fadeInDown">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-medium text-[hsl(var(--text-primary))]">
                  Manual Clip Selection
                </p>
                <button
                  onClick={() => setIsManualMode(false)}
                  className="p-1 rounded hover:bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-tertiary))] transition-colors"
                >
                  <Cross2Icon className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-[hsl(var(--text-tertiary))] uppercase tracking-wider mb-1.5">
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
                  <label className="block text-[11px] font-medium text-[hsl(var(--text-tertiary))] uppercase tracking-wider mb-1.5">
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
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clips List */}
        {clips.length > 0 && (
          <Card className="mb-6 animate-scaleIn">
            <CardContent className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[hsl(var(--border-subtle))]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[hsl(var(--success)/0.1)] flex items-center justify-center">
                    <ScissorsIcon className="w-4 h-4 text-[hsl(var(--success))]" />
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
              <div className="space-y-2">
                {clips.map((clip, index) => (
                  <div
                    key={clip.id}
                    className={cn(
                      "group p-4 rounded-lg transition-all duration-150",
                      "bg-[hsl(var(--bg-base))] border border-[hsl(var(--border-subtle))]",
                      "hover:border-[hsl(var(--border-default))] hover:bg-[hsl(var(--bg-elevated))]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Number */}
                      <div className="w-7 h-7 rounded-md bg-[hsl(var(--bg-surface))] flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-semibold text-[hsl(var(--text-tertiary))] tabular-nums">
                          {index + 1}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-[13px] font-medium text-[hsl(var(--text-primary))]">
                            {clip.name}
                          </h4>
                          {clip.isManual && (
                            <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-tertiary))]">
                              Manual
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--text-tertiary))] font-mono mb-2">
                          <span>{formatTimestamp(clip.startTime)}</span>
                          <span>→</span>
                          <span>{formatTimestamp(clip.endTime)}</span>
                          <span className="w-1 h-1 rounded-full bg-[hsl(var(--text-disabled))]" />
                          <span>{formatDuration(clip.endTime - clip.startTime)}</span>
                        </div>
                        <p className="text-[12px] text-[hsl(var(--text-secondary))] line-clamp-2">
                          "{clip.transcript}"
                        </p>
                        {clip.clippabilityScore?.explanation && (
                          <p className="text-[11px] text-[hsl(var(--primary))] mt-2 italic">
                            {clip.clippabilityScore.explanation}
                          </p>
                        )}
                      </div>

                      {/* Score & Actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        {clip.clippabilityScore && (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[hsl(var(--bg-surface))]">
                            <StarFilledIcon className={cn("w-3 h-3", getScoreColor(clip.clippabilityScore.overall))} />
                            <span className={cn("text-[11px] font-mono font-medium", getScoreColor(clip.clippabilityScore.overall))}>
                              {clip.clippabilityScore.overall.toFixed(1)}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => removeClip(clip.id)}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--error))] hover:bg-[hsl(var(--error)/0.1)]"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {clips.length === 0 && !isAnalyzing && (
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border-subtle))] flex items-center justify-center">
              <ScissorsIcon className="w-6 h-6 text-[hsl(var(--text-tertiary))]" />
            </div>
            <p className="text-[13px] text-[hsl(var(--text-secondary))] mb-1">
              No clips selected yet
            </p>
            <p className="text-[12px] text-[hsl(var(--text-tertiary))]">
              Use the AI finder above or add clips manually
            </p>
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-end mt-8 sm:mt-10">
          <Button onClick={onComplete} disabled={clips.length === 0} glow={clips.length > 0}>
            Continue to Preview
          </Button>
        </div>
      </div>
    </div>
  );
};
