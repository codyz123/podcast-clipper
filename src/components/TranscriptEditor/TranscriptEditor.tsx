import React, { useState } from "react";
import { ReloadIcon, CheckIcon, TextIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { Progress, Spinner } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { Transcript, Word } from "../../lib/types";
import { generateId, retryWithBackoff, cn } from "../../lib/utils";
import { formatTimestamp } from "../../lib/formats";

interface TranscriptEditorProps {
  onComplete: () => void;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({ onComplete }) => {
  const { currentProject, setTranscript, updateTranscriptWord } = useProjectStore();
  const { settings } = useSettingsStore();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const hasTranscript = !!currentProject?.transcript;

  const startTranscription = async () => {
    if (!currentProject?.audioPath) {
      setError("No audio file loaded");
      return;
    }

    if (!settings.openaiApiKey) {
      setError("Please set your OpenAI API key in Settings");
      return;
    }

    setIsTranscribing(true);
    setError(null);
    setProgress(10);

    try {
      const response = await fetch(currentProject.audioPath);
      const audioBlob = await response.blob();

      setProgress(20);

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.mp3");
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");
      formData.append("timestamp_granularities[]", "word");

      setProgress(30);

      const transcriptResponse = await retryWithBackoff(async () => {
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.openaiApiKey}`,
          },
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API error: ${res.status}`);
        }

        return res.json();
      });

      setProgress(80);

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
        text: transcriptResponse.text || words.map((w) => w.text).join(" "),
        words,
        language: transcriptResponse.language || "en",
        createdAt: new Date().toISOString(),
      };

      setTranscript(transcript);
      setProgress(100);
    } catch (err) {
      console.error("Transcription error:", err);
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleWordClick = (index: number) => {
    if (currentProject?.transcript?.words[index]) {
      setEditingWordIndex(index);
      setEditValue(currentProject.transcript.words[index].text);
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

  const progressMessages: Record<number, string> = {
    10: "Preparing audio...",
    20: "Uploading to Whisper...",
    30: "Transcribing...",
    80: "Processing...",
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
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4",
            "bg-[hsl(var(--surface))]",
            "border border-[hsl(var(--glass-border))]"
          )}>
            <span className="text-xs font-semibold text-[hsl(var(--cyan))]">2</span>
            <span className="text-xs font-medium text-[hsl(var(--text-subtle))]">
              Step 2 of 5
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--text))] tracking-tight font-[family-name:var(--font-display)]">
            Transcribe Audio
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-sm">
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
                <CardContent className="py-10">
                  <div className="max-w-xs mx-auto text-center">
                    <div className={cn(
                      "w-12 h-12 mx-auto mb-5 rounded-xl flex items-center justify-center",
                      "bg-[hsl(185_50%_15%/0.5)]"
                    )}>
                      <Spinner size="lg" variant="cyan" />
                    </div>
                    <Progress value={progress} variant="cyan" className="mb-3" />
                    <p className="text-sm font-medium text-[hsl(var(--text-muted))]">
                      {getProgressMessage()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div
                onClick={startTranscription}
                className={cn(
                  "rounded-xl py-10 px-6 text-center cursor-pointer transition-all duration-150",
                  "border-2 border-dashed",
                  "bg-[hsl(var(--surface)/0.4)]",
                  "border-[hsl(var(--glass-border))]",
                  "hover:border-[hsl(0_0%_100%/0.12)]",
                  "hover:bg-[hsl(var(--surface)/0.6)]"
                )}
              >
                <div className={cn(
                  "w-14 h-14 mx-auto mb-5 rounded-xl flex items-center justify-center",
                  "bg-[hsl(var(--raised))]",
                  "border border-[hsl(var(--glass-border))]"
                )}>
                  <TextIcon className="w-6 h-6 text-[hsl(var(--text-ghost))]" />
                </div>
                <h3 className="text-base font-semibold text-[hsl(var(--text))] mb-1 font-[family-name:var(--font-display)]">
                  Ready to transcribe
                </h3>
                <p className="text-sm text-[hsl(var(--text-subtle))] mb-5 max-w-xs mx-auto">
                  Using OpenAI Whisper for accurate word-level timestamps
                </p>
                <Button glow>Start Transcription</Button>

                {error && (
                  <div className={cn(
                    "mt-6 p-4 rounded-lg",
                    "bg-[hsl(0_50%_15%/0.4)]",
                    "border border-[hsl(var(--error)/0.2)]"
                  )}>
                    <p className="text-sm font-medium text-[hsl(var(--error))]">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Transcript Display */}
        {hasTranscript && currentProject?.transcript && (
          <Card variant="default" className="animate-scaleIn">
            <CardContent className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[hsl(var(--glass-border))]">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    "bg-[hsl(158_50%_15%/0.5)]"
                  )}>
                    <CheckIcon className="w-5 h-5 text-[hsl(var(--success))]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">
                      Transcript ready
                    </p>
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      {currentProject.transcript.words.length.toLocaleString()} words detected
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startTranscription}
                  className="text-[hsl(var(--text-subtle))]"
                >
                  <ReloadIcon className="w-3.5 h-3.5 mr-1.5" />
                  Re-transcribe
                </Button>
              </div>

              {/* Words */}
              <div className={cn(
                "p-4 rounded-lg max-h-[400px] overflow-y-auto scrollbar-thin",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--glass-border))]"
              )}>
                <p className="leading-relaxed text-sm text-[hsl(var(--text))]">
                  {currentProject.transcript.words.map((word, index) => (
                    <React.Fragment key={index}>
                      {editingWordIndex === index ? (
                        <span className="inline-flex items-center gap-1 mx-1">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleWordSave}
                            className="w-auto min-w-[60px] inline-block py-0 px-2 h-6 text-sm"
                            autoFocus
                          />
                          <button
                            onClick={handleWordSave}
                            className="text-[hsl(var(--success))] hover:opacity-80"
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ) : (
                        <span
                          onClick={() => handleWordClick(index)}
                          className={cn(
                            "cursor-pointer rounded px-0.5 transition-colors",
                            "hover:bg-[hsl(185_50%_20%/0.4)]",
                            "hover:text-[hsl(var(--cyan))]"
                          )}
                          title={`${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}`}
                        >
                          {word.text}
                        </span>
                      )}
                      {" "}
                    </React.Fragment>
                  ))}
                </p>
              </div>

              <p className="mt-3 text-xs text-[hsl(var(--text-subtle))] text-center">
                Click any word to edit. Timestamps will be preserved.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Continue Button */}
        <div className="flex justify-end mt-8 sm:mt-10">
          <Button onClick={onComplete} disabled={!hasTranscript} glow={hasTranscript}>
            Continue to Clip Selection
          </Button>
        </div>
      </div>
    </div>
  );
};
