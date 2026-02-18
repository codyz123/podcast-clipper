import { useState, useEffect, useCallback } from "react";
import { getApiBase, authFetch } from "../lib/api";

export interface RenderedClipEntry {
  id: string;
  clipId: string;
  clipName: string;
  format: string;
  blobUrl: string;
  sizeBytes: number | null;
  renderedAt: string;
}

export function useRenderedClips(projectId: string | undefined) {
  const [renderedClips, setRenderedClips] = useState<RenderedClipEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRenderedClips = useCallback(async () => {
    if (!projectId) {
      setRenderedClips([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${getApiBase()}/api/render/clips/${projectId}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch rendered clips");
      }

      const { renderedClips: list } = await res.json();
      setRenderedClips(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch rendered clips");
      setRenderedClips([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRenderedClips();
  }, [fetchRenderedClips]);

  const deleteRenderedClip = useCallback(async (id: string) => {
    try {
      const res = await authFetch(`${getApiBase()}/api/render/clips/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete rendered clip");
      }
      setRenderedClips((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete rendered clip");
    }
  }, []);

  return { renderedClips, isLoading, error, refetch: fetchRenderedClips, deleteRenderedClip };
}
