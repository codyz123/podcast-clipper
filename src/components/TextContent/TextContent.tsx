import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  PlusIcon,
  TrashIcon,
  FileTextIcon,
  MagicWandIcon,
  Pencil1Icon,
  CheckIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { Spinner } from "../ui/Progress";
import { useProjectStore } from "../../stores/projectStore";
import { useTextSnippets } from "../../hooks/useTextSnippets";
import { cn, debounce } from "../../lib/utils";

export const TextContent: React.FC = () => {
  const { currentProject } = useProjectStore();
  const {
    snippets,
    isLoading,
    isGenerating,
    error,
    clearError,
    fetchSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    generateSnippet,
  } = useTextSnippets();

  const [activeSnippetId, setActiveSnippetId] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "ai">("ai");
  const [prompt, setPrompt] = useState("");
  const [focusClipId, setFocusClipId] = useState<string>("");
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Separate debounced functions for content and name to prevent one canceling the other
  const debouncedSaveContent = useMemo(
    () =>
      debounce(async (snippetId: string, projectId: string, newContent: string) => {
        setIsSaving(true);
        try {
          await updateSnippet(projectId, snippetId, { content: newContent });
        } finally {
          setIsSaving(false);
          setIsEditing(false);
        }
      }, 1500),
    [updateSnippet]
  );

  const debouncedSaveName = useMemo(
    () =>
      debounce(async (snippetId: string, projectId: string, newName: string) => {
        setIsSaving(true);
        try {
          await updateSnippet(projectId, snippetId, { name: newName });
        } finally {
          setIsSaving(false);
        }
      }, 1500),
    [updateSnippet]
  );

  // Flush pending saves on unmount or snippet switch
  useEffect(() => {
    return () => {
      debouncedSaveContent.flush();
      debouncedSaveName.flush();
    };
  }, [activeSnippetId, debouncedSaveContent, debouncedSaveName]);

  // Check for transcript
  const hasTranscript =
    currentProject?.transcript ||
    (currentProject?.transcripts && currentProject.transcripts.length > 0);
  const clips = currentProject?.clips || [];

  // Load snippets when project changes
  useEffect(() => {
    if (currentProject?.id) {
      fetchSnippets(currentProject.id);
    }
  }, [currentProject?.id, fetchSnippets]);

  // Update form when active snippet changes
  useEffect(() => {
    const activeSnippet = snippets.find((s) => s.id === activeSnippetId);
    if (activeSnippet) {
      setContent(activeSnippet.content);
      setName(activeSnippet.name);
      setIsEditing(false);
    } else {
      setContent("");
      setName("");
      setIsEditing(false);
    }
  }, [activeSnippetId, snippets]);

  // Auto-save for edits
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setIsEditing(true);

      if (activeSnippetId && currentProject?.id) {
        debouncedSaveContent(activeSnippetId, currentProject.id, newContent);
      }
    },
    [activeSnippetId, currentProject?.id, debouncedSaveContent]
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      setName(newName);

      if (activeSnippetId && currentProject?.id) {
        debouncedSaveName(activeSnippetId, currentProject.id, newName);
      }
    },
    [activeSnippetId, currentProject?.id, debouncedSaveName]
  );

  const handleGenerate = async () => {
    if (!currentProject?.id || !prompt.trim()) return;

    clearError();
    const result = await generateSnippet(currentProject.id, {
      prompt: prompt.trim(),
      focusClipId: focusClipId || undefined,
    });

    if (result) {
      // Create the snippet with generated content
      const snippet = await createSnippet(currentProject.id, {
        content: result.content,
        name: result.name,
        prompt: prompt.trim(),
        focusClipId: focusClipId || undefined,
        isManual: false,
      });

      if (snippet) {
        setActiveSnippetId(snippet.id);
        setPrompt("");
        setFocusClipId("");
      }
    }
  };

  const handleAddManual = async () => {
    if (!currentProject?.id) return;

    const snippet = await createSnippet(currentProject.id, {
      content: "New snippet - click to edit",
      isManual: true,
    });

    if (snippet) {
      setActiveSnippetId(snippet.id);
      setMode("manual");
    }
  };

  const handleDelete = async (snippetId: string) => {
    if (!currentProject?.id) return;

    await deleteSnippet(currentProject.id, snippetId);

    if (activeSnippetId === snippetId) {
      setActiveSnippetId(null);
    }
  };

  const activeSnippet = snippets.find((s) => s.id === activeSnippetId);

  // Show disabled state if no transcript
  if (!hasTranscript) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card variant="default" className="max-w-md p-8 text-center">
          <FileTextIcon className="mx-auto h-12 w-12 text-[hsl(var(--text-ghost))]" />
          <h2 className="mt-4 text-lg font-semibold text-[hsl(var(--text))]">
            Transcript Required
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
            Create a transcript for this episode before generating text content. The AI uses the
            transcript to understand your episode and create relevant snippets.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar - Snippet list */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--void))]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-4 w-4 text-[hsl(var(--text-muted))]" />
            <span className="text-sm font-medium text-[hsl(var(--text))]">
              Snippets ({snippets.length})
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleAddManual} className="h-7 px-2">
            <PlusIcon className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Snippet list */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : snippets.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[hsl(var(--text-ghost))]">No snippets yet</p>
              <p className="mt-1 text-xs text-[hsl(var(--text-ghost))]">
                Use AI to generate or add manually
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {snippets.map((snippet) => (
                <button
                  key={snippet.id}
                  onClick={() => setActiveSnippetId(snippet.id)}
                  className={cn(
                    "group relative w-full rounded-lg p-3 text-left transition-colors",
                    activeSnippetId === snippet.id
                      ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
                      : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold",
                        activeSnippetId === snippet.id
                          ? "bg-[hsl(var(--cyan)/0.2)] text-[hsl(var(--cyan))]"
                          : "bg-[hsl(var(--surface))] text-[hsl(var(--text-ghost))]"
                      )}
                    >
                      {snippet.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{snippet.name}</p>
                      <p className="mt-0.5 truncate text-[10px] opacity-60">
                        {snippet.content.slice(0, 50)}...
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(snippet.id);
                    }}
                    className="absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[hsl(var(--error)/0.1)]"
                  >
                    <TrashIcon className="h-3 w-3 text-[hsl(var(--error))]" />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          {/* Mode toggle */}
          <div className="mb-6 flex items-center gap-2">
            <button
              onClick={() => setMode("ai")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                mode === "ai"
                  ? "bg-[hsl(var(--magenta)/0.15)] text-[hsl(var(--magenta))]"
                  : "text-[hsl(var(--text-ghost))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text-muted))]"
              )}
            >
              <MagicWandIcon className="h-4 w-4" />
              AI Generate
            </button>
            <button
              onClick={() => setMode("manual")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                mode === "manual"
                  ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
                  : "text-[hsl(var(--text-ghost))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text-muted))]"
              )}
            >
              <Pencil1Icon className="h-4 w-4" />
              Write Manually
            </button>
          </div>

          {mode === "ai" ? (
            /* AI Generation Mode */
            <Card variant="default" className="animate-fadeIn">
              <CardContent className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-[hsl(var(--text))]">
                  Generate with AI
                </h3>

                {/* Prompt input */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-muted))]">
                    What kind of content do you want?
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., Write a catchy tweet highlighting the main takeaway..."
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-sm",
                      "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface)/0.5)]",
                      "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan))] focus:outline-none",
                      "min-h-[100px] resize-none"
                    )}
                  />
                </div>

                {/* Clip selector */}
                {clips.length > 0 && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-muted))]">
                      Focus on a specific clip (optional)
                    </label>
                    <select
                      value={focusClipId}
                      onChange={(e) => setFocusClipId(e.target.value)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-sm",
                        "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface)/0.5)]",
                        "text-[hsl(var(--text))]",
                        "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan))] focus:outline-none"
                      )}
                    >
                      <option value="">No focus - use full transcript</option>
                      {clips.map((clip, i) => (
                        <option key={clip.id} value={clip.id}>
                          Clip {i + 1}: {clip.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Error display */}
                {error && (
                  <div className="mb-4 rounded-lg border border-[hsl(var(--error)/0.15)] bg-[hsl(var(--error)/0.1)] p-3">
                    <p className="text-sm text-[hsl(var(--error))]">{error}</p>
                  </div>
                )}

                {/* Generate button */}
                <Button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  glow={!!prompt.trim() && !isGenerating}
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <MagicWandIcon className="h-4 w-4" />
                      Generate Snippet
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* Manual Mode - Show/Edit Active Snippet */
            <Card variant="default" className="animate-fadeIn">
              <CardContent className="p-5">
                {activeSnippet ? (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[hsl(var(--text))]">
                        Snippet {activeSnippet.index}
                      </h3>
                      {isSaving ? (
                        <span className="flex items-center gap-1 text-xs text-[hsl(var(--text-ghost))]">
                          <Spinner size="sm" />
                          Saving...
                        </span>
                      ) : isEditing ? (
                        <span className="text-xs text-[hsl(var(--text-ghost))]">Editing...</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-[hsl(var(--success))]">
                          <CheckIcon className="h-3 w-3" />
                          Saved
                        </span>
                      )}
                    </div>

                    {/* Name input */}
                    <div className="mb-4">
                      <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-muted))]">
                        Name
                      </label>
                      <Input
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="Snippet name..."
                      />
                    </div>

                    {/* Content textarea */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--text-muted))]">
                        Content
                      </label>
                      <textarea
                        value={content}
                        onChange={(e) => handleContentChange(e.target.value)}
                        placeholder="Your snippet content..."
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-sm",
                          "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface)/0.5)]",
                          "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                          "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan))] focus:outline-none",
                          "min-h-[200px] resize-none"
                        )}
                      />
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <FileTextIcon className="mx-auto h-8 w-8 text-[hsl(var(--text-ghost))]" />
                    <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                      Select a snippet to edit or create a new one
                    </p>
                    <Button onClick={handleAddManual} variant="ghost" className="mt-4">
                      <PlusIcon className="h-4 w-4" />
                      Add Snippet
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Show recently generated/selected snippet preview in AI mode */}
          {mode === "ai" && activeSnippet && (
            <Card variant="default" className="animate-fadeInUp mt-4">
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-[hsl(var(--text-ghost))]">
                    Last Generated
                  </span>
                  <span className="rounded bg-[hsl(var(--success)/0.1)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--success))]">
                    Snippet {activeSnippet.index}
                  </span>
                </div>
                <p className="text-sm font-medium text-[hsl(var(--text))]">{activeSnippet.name}</p>
                <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                  {activeSnippet.content}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TextContent;
