import { useState, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getApiBase, authFetch } from "../lib/api";
import type {
  TextSnippet,
  CreateSnippetRequest,
  GenerateSnippetRequest,
  GenerateSnippetResponse,
} from "../lib/types";

export function useTextSnippets() {
  const { currentPodcastId } = useAuthStore();
  const [snippets, setSnippets] = useState<TextSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchSnippets = useCallback(
    async (episodeId: string): Promise<TextSnippet[]> => {
      if (!currentPodcastId) return [];
      setIsLoading(true);
      setError(null);

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/snippets`
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch snippets");
        }
        const { snippets: data } = await res.json();
        setSnippets(data);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch snippets";
        setError(message);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [currentPodcastId]
  );

  const createSnippet = useCallback(
    async (episodeId: string, data: CreateSnippetRequest): Promise<TextSnippet | null> => {
      if (!currentPodcastId) return null;
      setError(null);

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/snippets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );
        if (!res.ok) {
          const responseData = await res.json();
          throw new Error(responseData.error || "Failed to create snippet");
        }
        const { snippet } = await res.json();
        setSnippets((prev) => [...prev, snippet].sort((a, b) => a.index - b.index));
        return snippet;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create snippet";
        setError(message);
        return null;
      }
    },
    [currentPodcastId]
  );

  const updateSnippet = useCallback(
    async (
      episodeId: string,
      snippetId: string,
      updates: { content?: string; name?: string }
    ): Promise<TextSnippet | null> => {
      if (!currentPodcastId) return null;
      setError(null);

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/snippets/${snippetId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!res.ok) {
          const responseData = await res.json();
          throw new Error(responseData.error || "Failed to update snippet");
        }
        const { snippet } = await res.json();
        setSnippets((prev) => prev.map((s) => (s.id === snippetId ? snippet : s)));
        return snippet;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update snippet";
        setError(message);
        return null;
      }
    },
    [currentPodcastId]
  );

  const deleteSnippet = useCallback(
    async (episodeId: string, snippetId: string): Promise<boolean> => {
      if (!currentPodcastId) return false;
      setError(null);

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/snippets/${snippetId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const responseData = await res.json();
          throw new Error(responseData.error || "Failed to delete snippet");
        }
        setSnippets((prev) => prev.filter((s) => s.id !== snippetId));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete snippet";
        setError(message);
        return false;
      }
    },
    [currentPodcastId]
  );

  const generateSnippet = useCallback(
    async (
      projectId: string,
      request: GenerateSnippetRequest
    ): Promise<GenerateSnippetResponse | null> => {
      setIsGenerating(true);
      setError(null);

      try {
        // Get API key from settings
        const anthropicApiKey = useSettingsStore.getState().settings.anthropicApiKey;

        const res = await authFetch(`${getApiBase()}/api/generate-snippet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ...request, anthropicApiKey }),
        });
        if (!res.ok) {
          const responseData = await res.json();
          throw new Error(responseData.error || "Failed to generate snippet");
        }
        return await res.json();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate snippet";
        setError(message);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  return {
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
  };
}
