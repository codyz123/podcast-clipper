import React, { useState } from "react";
import {
  MagicWandIcon,
  PlusIcon,
  TrashIcon,
  StarIcon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress, Input } from "../ui";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ClippabilityScore } from "../../lib/types";
import { formatDuration, formatTimestamp } from "../../lib/formats";
import { retryWithBackoff } from "../../lib/utils";

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

  // Manual selection state
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

      // Create clips from the analysis
      for (const segment of analysis.segments || []) {
        const startTime = segment.start_time;
        const endTime = segment.end_time;

        // Get words within this time range
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

    const segmentWords = transcript.words.filter(
      (w) => w.start >= start && w.end <= end
    );

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
  };

  const renderScoreStars = (score: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const threshold = i * 2;
      stars.push(
        score >= threshold ? (
          <StarFilledIcon key={i} className="w-3 h-3 text-yellow-500" />
        ) : (
          <StarIcon key={i} className="w-3 h-3 text-gray-600" />
        )
      );
    }
    return stars;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Select Clips
        </h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Use AI to find the best moments or manually select segments
        </p>
      </div>

      {/* AI Analysis Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>AI Clip Finder</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Input
              label="Keywords (optional)"
              placeholder="e.g., AI, productivity, tips"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
            <Input
              label="Clip Duration (seconds)"
              type="number"
              min={10}
              max={60}
              value={clipDuration}
              onChange={(e) => setClipDuration(parseInt(e.target.value) || 30)}
            />
            <Input
              label="Number of Clips"
              type="number"
              min={1}
              max={10}
              value={clipCount}
              onChange={(e) => setClipCount(parseInt(e.target.value) || 5)}
            />
          </div>

          {isAnalyzing ? (
            <div>
              <Progress value={progress} showLabel className="mb-2" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Analyzing transcript for clippable moments...
              </p>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button onClick={analyzeClippability}>
                <MagicWandIcon className="w-4 h-4 mr-2" />
                Find Best Clips
              </Button>
              <Button variant="secondary" onClick={() => setIsManualMode(!isManualMode)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Manual Selection
              </Button>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Manual Selection */}
      {isManualMode && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Manual Clip Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <Input
                label="Start Time (seconds)"
                type="number"
                step="0.1"
                placeholder="0.0"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
              />
              <Input
                label="End Time (seconds)"
                type="number"
                step="0.1"
                placeholder="30.0"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
              />
              <Button onClick={addManualClip}>Add Clip</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clips List */}
      {clips.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Selected Clips ({clips.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="p-4 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-[hsl(var(--foreground))]">
                        {clip.name}
                      </h4>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        {formatTimestamp(clip.startTime)} -{" "}
                        {formatTimestamp(clip.endTime)} (
                        {formatDuration(clip.endTime - clip.startTime)})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {clip.clippabilityScore && (
                        <div className="flex items-center gap-1">
                          {renderScoreStars(clip.clippabilityScore.overall)}
                          <span className="text-sm text-[hsl(var(--muted-foreground))] ml-1">
                            {clip.clippabilityScore.overall.toFixed(1)}
                          </span>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeClip(clip.id)}
                        className="text-[hsl(var(--destructive))]"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-[hsl(var(--foreground))] line-clamp-2">
                    "{clip.transcript}"
                  </p>
                  {clip.clippabilityScore?.explanation && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 italic">
                      {clip.clippabilityScore.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button onClick={onComplete} disabled={clips.length === 0}>
          Continue to Preview
        </Button>
      </div>
    </div>
  );
};
