import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";

// Episode type from backend
export interface Episode {
  id: string;
  name: string;
  description?: string;
  audioBlobUrl?: string;
  audioFileName?: string;
  audioDuration?: number;
  episodeNumber?: number;
  seasonNumber?: number;
  publishDate?: string;
  showNotes?: string;
  explicit?: boolean;
  guests?: Array<{
    id: string;
    name: string;
    bio?: string;
    website?: string;
    twitter?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface Transcript {
  id: string;
  projectId: string;
  text: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  language?: string;
  name?: string;
  audioFingerprint?: string;
  createdAt: string;
}

export interface Clip {
  id: string;
  projectId: string;
  name: string;
  startTime: number;
  endTime: number;
  transcript?: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  clippabilityScore?: {
    hook: number;
    clarity: number;
    emotion: number;
    quotable: number;
    completeness: number;
    overall: number;
    explanation: string;
  };
  isManual?: boolean;
  tracks?: unknown;
  captionStyle?: unknown;
  format?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeWithDetails extends Episode {
  transcripts: Transcript[];
  clips: Clip[];
}

function getApiBase(): string {
  return useSettingsStore.getState().settings.backendUrl || "http://localhost:3001";
}

export function useEpisodes() {
  const { accessToken, currentPodcastId, refreshAccessToken } = useAuthStore();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<EpisodeWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth fetch helper with token refresh
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      };

      let res = await fetch(url, { ...options, headers });

      // Try to refresh token if unauthorized
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newToken = useAuthStore.getState().accessToken;
          res = await fetch(url, {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
          });
        }
      }

      return res;
    },
    [accessToken, refreshAccessToken]
  );

  // Fetch episodes for current podcast
  const fetchEpisodes = useCallback(async () => {
    if (!currentPodcastId) {
      setEpisodes([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}/episodes`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch episodes");
      }

      const { episodes: episodeList } = await res.json();
      setEpisodes(episodeList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch episodes");
      setEpisodes([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPodcastId, authFetch]);

  // Fetch a single episode with details
  const fetchEpisode = useCallback(
    async (episodeId: string): Promise<EpisodeWithDetails | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}`
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch episode");
        }

        const data = await res.json();
        const episode: EpisodeWithDetails = {
          ...data.episode,
          transcripts: data.transcripts || [],
          clips: data.clips || [],
        };

        setCurrentEpisode(episode);
        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch episode");
        return null;
      }
    },
    [currentPodcastId, authFetch]
  );

  // Create a new episode
  const createEpisode = useCallback(
    async (name: string, description?: string): Promise<Episode | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}/episodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create episode");
        }

        const { episode } = await res.json();

        // Refresh list
        await fetchEpisodes();

        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create episode");
        return null;
      }
    },
    [currentPodcastId, authFetch, fetchEpisodes]
  );

  // Update an episode
  const updateEpisode = useCallback(
    async (episodeId: string, updates: Partial<Episode>): Promise<Episode | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update episode");
        }

        const { episode } = await res.json();

        // Update in local state
        setEpisodes((prev) => prev.map((e) => (e.id === episodeId ? episode : e)));

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) => (prev ? { ...prev, ...episode } : null));
        }

        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update episode");
        return null;
      }
    },
    [currentPodcastId, authFetch, currentEpisode]
  );

  // Delete an episode
  const deleteEpisode = useCallback(
    async (episodeId: string): Promise<boolean> => {
      if (!currentPodcastId) return false;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to delete episode");
        }

        // Update local state
        setEpisodes((prev) => prev.filter((e) => e.id !== episodeId));

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode(null);
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete episode");
        return false;
      }
    },
    [currentPodcastId, authFetch, currentEpisode]
  );

  // Upload audio for an episode
  const uploadAudio = useCallback(
    async (episodeId: string, file: File): Promise<Episode | null> => {
      if (!currentPodcastId) return null;

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/audio`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to upload audio");
        }

        const { episode } = await res.json();

        // Update local state
        setEpisodes((prev) => prev.map((e) => (e.id === episodeId ? episode : e)));

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) => (prev ? { ...prev, ...episode } : null));
        }

        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload audio");
        return null;
      }
    },
    [currentPodcastId, authFetch, currentEpisode]
  );

  // Save transcript
  const saveTranscript = useCallback(
    async (
      episodeId: string,
      transcript: {
        text: string;
        words: Transcript["words"];
        language?: string;
        name?: string;
        audioFingerprint?: string;
      }
    ): Promise<Transcript | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/transcripts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(transcript),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save transcript");
        }

        const { transcript: saved } = await res.json();

        // Update current episode if it's the one we're working on
        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) =>
            prev ? { ...prev, transcripts: [...prev.transcripts, saved] } : null
          );
        }

        return saved;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save transcript");
        return null;
      }
    },
    [currentPodcastId, authFetch, currentEpisode]
  );

  // Save clips (bulk)
  const saveClips = useCallback(
    async (episodeId: string, clips: Partial<Clip>[]): Promise<Clip[] | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/clips`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clips }),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save clips");
        }

        const { clips: saved } = await res.json();

        // Update current episode if it's the one we're working on
        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) => (prev ? { ...prev, clips: saved } : null));
        }

        return saved;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save clips");
        return null;
      }
    },
    [currentPodcastId, authFetch, currentEpisode]
  );

  // Clear current episode
  const clearCurrentEpisode = useCallback(() => {
    setCurrentEpisode(null);
  }, []);

  // Fetch episodes when podcast changes
  useEffect(() => {
    if (currentPodcastId) {
      fetchEpisodes();
    } else {
      setEpisodes([]);
      setCurrentEpisode(null);
    }
  }, [currentPodcastId, fetchEpisodes]);

  return {
    episodes,
    currentEpisode,
    isLoading,
    error,
    fetchEpisodes,
    fetchEpisode,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    uploadAudio,
    saveTranscript,
    saveClips,
    clearCurrentEpisode,
  };
}
