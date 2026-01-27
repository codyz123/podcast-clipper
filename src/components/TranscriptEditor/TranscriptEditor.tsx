import React, { useState } from "react";
import { ReloadIcon, CheckIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress, Input } from "../ui";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { Transcript, Word } from "../../lib/types";
import { generateId, retryWithBackoff } from "../../lib/utils";
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
      // Fetch the audio blob
      const response = await fetch(currentProject.audioPath);
      const audioBlob = await response.blob();

      setProgress(20);

      // Create form data for Whisper API
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.mp3");
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");
      formData.append("timestamp_granularities[]", "word");

      setProgress(30);

      // Call Whisper API with retry
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

      // Parse the response into our Word format
      const words: Word[] = (transcriptResponse.words || []).map((w: any) => ({
        text: w.word,
        start: w.start,
        end: w.end,
        confidence: 1, // Whisper doesn't return confidence per word
      }));

      // If no word-level timestamps, create approximate ones from the text
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Transcript
        </h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          {hasTranscript
            ? "Review and edit the transcript. Click any word to edit it."
            : "Generate a transcript from your audio using AI"}
        </p>
      </div>

      {/* Transcription Controls */}
      {!hasTranscript && (
        <Card className="mb-6">
          <CardContent className="py-8 text-center">
            {isTranscribing ? (
              <div className="max-w-md mx-auto">
                <Progress value={progress} showLabel className="mb-4" />
                <p className="text-[hsl(var(--muted-foreground))]">
                  {progress < 30
                    ? "Preparing audio..."
                    : progress < 80
                      ? "Transcribing with Whisper AI..."
                      : "Processing transcript..."}
                </p>
              </div>
            ) : (
              <>
                <p className="text-lg mb-4 text-[hsl(var(--foreground))]">
                  Ready to transcribe your audio
                </p>
                <Button onClick={startTranscription} size="lg">
                  <ReloadIcon className="w-4 h-4 mr-2" />
                  Start Transcription
                </Button>
                {error && (
                  <p className="mt-4 text-sm text-[hsl(var(--destructive))]">
                    {error}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transcript Display */}
      {hasTranscript && currentProject?.transcript && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Transcript ({currentProject.transcript.words.length} words)
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={startTranscription}>
                <ReloadIcon className="w-4 h-4 mr-2" />
                Re-transcribe
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert max-w-none">
              <p className="leading-relaxed text-[hsl(var(--foreground))]">
                {currentProject.transcript.words.map((word, index) => (
                  <React.Fragment key={index}>
                    {editingWordIndex === index ? (
                      <span className="inline-flex items-center gap-1">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleWordSave}
                          className="w-auto min-w-[60px] inline-block py-0 px-1 h-6 text-base"
                          autoFocus
                        />
                        <button
                          onClick={handleWordSave}
                          className="text-green-500 hover:text-green-400"
                        >
                          <CheckIcon className="w-4 h-4" />
                        </button>
                      </span>
                    ) : (
                      <span
                        onClick={() => handleWordClick(index)}
                        className="cursor-pointer hover:bg-[hsl(var(--primary))]/20 rounded px-0.5 transition-colors"
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
          </CardContent>
        </Card>
      )}

      {/* Continue Button */}
      <div className="flex justify-end gap-3">
        {hasTranscript && (
          <Button onClick={onComplete}>
            Continue to Clip Selection
          </Button>
        )}
      </div>
    </div>
  );
};
