import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "../stores/authStore";
import { useProjectStore } from "../stores/projectStore";
import { getApiBase, authFetch } from "../lib/api";
import type { StageStatusWithSubSteps } from "../lib/statusConfig";

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
  stageStatus?: StageStatusWithSubSteps;
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

export function useEpisodes() {
  const { currentPodcastId } = useAuthStore();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<EpisodeWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [currentPodcastId]);

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
    [currentPodcastId]
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
    [currentPodcastId, fetchEpisodes]
  );

  // Update an episode
  const updateEpisode = useCallback(
    async (episodeId: string, updates: Partial<Episode>): Promise<Episode | null> => {
      console.log(
        "[useEpisodes.updateEpisode] Called with episodeId:",
        episodeId,
        "currentPodcastId:",
        currentPodcastId
      );
      if (!currentPodcastId) {
        console.error("[useEpisodes.updateEpisode] No currentPodcastId - returning null");
        return null;
      }

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
    [currentPodcastId, currentEpisode]
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
    [currentPodcastId, currentEpisode]
  );

  // Upload audio for an episode
  const uploadAudio = useCallback(
    async (episodeId: string, file: File, audioDuration?: number): Promise<Episode | null> => {
      if (!currentPodcastId) return null;

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (audioDuration !== undefined) {
          formData.append("audioDuration", audioDuration.toString());
        }

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
    [currentPodcastId, currentEpisode]
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
    [currentPodcastId, currentEpisode]
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
    [currentPodcastId, currentEpisode]
  );

  // Clear current episode
  const clearCurrentEpisode = useCallback(() => {
    setCurrentEpisode(null);
  }, []);

  // Update stage status
  const updateStageStatus = useCallback(
    async (
      episodeId: string,
      stage: string,
      status: string
    ): Promise<StageStatusWithSubSteps | null> => {
      if (!currentPodcastId) return null;

      const prevEpisode = episodes.find((e) => e.id === episodeId);
      const previousStageStatus: StageStatusWithSubSteps = prevEpisode?.stageStatus || {};
      const optimisticStageStatus: StageStatusWithSubSteps = {
        ...previousStageStatus,
        [stage]: { status, updatedAt: new Date().toISOString() },
      };

      const applyStageStatus = (nextStageStatus: StageStatusWithSubSteps) => {
        setEpisodes((prev) =>
          prev.map((episode) =>
            episode.id === episodeId ? { ...episode, stageStatus: nextStageStatus } : episode
          )
        );

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) => (prev ? { ...prev, stageStatus: nextStageStatus } : prev));
        }

        const projectState = useProjectStore.getState();
        if (projectState.currentProject?.id === episodeId) {
          projectState.updateProject({ stageStatus: nextStageStatus });
        }
      };

      applyStageStatus(optimisticStageStatus);

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/stage-status`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage, status }),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update stage status");
        }

        const { stageStatus } = await res.json();
        if (stageStatus) {
          applyStageStatus(stageStatus);
        }
        return stageStatus;
      } catch (err) {
        applyStageStatus(previousStageStatus);
        setError(err instanceof Error ? err.message : "Failed to update stage status");
        return null;
      }
    },
    [currentPodcastId, episodes, currentEpisode]
  );

  // Update sub-step status (granular tracking within stages)
  const updateSubStepStatus = useCallback(
    async (
      episodeId: string,
      subStepId: string,
      status: string
    ): Promise<Episode["stageStatus"] | null> => {
      if (!currentPodcastId) return null;

      const prevEpisode = episodes.find((e) => e.id === episodeId);
      const previousStageStatus = prevEpisode?.stageStatus || {};
      const previousSubSteps = previousStageStatus.subSteps || {};
      const optimisticStageStatus = {
        ...previousStageStatus,
        subSteps: {
          ...previousSubSteps,
          [subStepId]: { status, updatedAt: new Date().toISOString() },
        },
      };

      const applyStageStatus = (nextStageStatus: Episode["stageStatus"]) => {
        setEpisodes((prev) =>
          prev.map((episode) =>
            episode.id === episodeId ? { ...episode, stageStatus: nextStageStatus } : episode
          )
        );

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) => (prev ? { ...prev, stageStatus: nextStageStatus } : prev));
        }

        const projectState = useProjectStore.getState();
        if (projectState.currentProject?.id === episodeId) {
          projectState.updateProject({ stageStatus: nextStageStatus });
        }
      };

      applyStageStatus(optimisticStageStatus);

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episodeId}/substep-status`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subStepId, status }),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update sub-step status");
        }

        const { stageStatus } = await res.json();
        if (stageStatus) {
          applyStageStatus(stageStatus);
        }
        return stageStatus;
      } catch (err) {
        applyStageStatus(previousStageStatus);
        setError(err instanceof Error ? err.message : "Failed to update sub-step status");
        return null;
      }
    },
    [currentPodcastId, episodes, currentEpisode]
  );

  // Track if we've attempted migration in this session
  const migrationAttemptedRef = useRef(false);

  // Migrate localStorage projects to database (runs ONCE globally)
  const migrateLocalStorageProjects = useCallback(async () => {
    if (!currentPodcastId) return;

    // Check if migration was already done (persisted in localStorage)
    const MIGRATION_FLAG = "podcastomatic-migrated-to-db";
    if (localStorage.getItem(MIGRATION_FLAG)) {
      console.log("[Migration] Already migrated previously, skipping");
      return;
    }

    // Only attempt migration once per session
    if (migrationAttemptedRef.current) return;
    migrationAttemptedRef.current = true;

    // Get projects from localStorage via projectStore
    const localProjects = useProjectStore.getState().projects;

    if (localProjects.length === 0) {
      console.log("[Migration] No localStorage projects to migrate");
      localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
      return;
    }

    console.log(`[Migration] Found ${localProjects.length} localStorage projects to migrate`);

    // Migrate each project
    for (const project of localProjects) {
      try {
        // Create episode in database
        const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}/episodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: project.name,
            audioDuration: project.audioDuration,
          }),
        });

        if (!res.ok) {
          console.error(`[Migration] Failed to migrate project ${project.name}`);
          continue;
        }

        const { episode } = await res.json();
        console.log(`[Migration] Migrated project "${project.name}" -> episode ${episode.id}`);

        // If project has transcripts, migrate them too
        const transcripts = project.transcripts || [];
        if (project.transcript && !transcripts.find((t) => t.id === project.transcript?.id)) {
          transcripts.push(project.transcript);
        }

        for (const transcript of transcripts) {
          try {
            await authFetch(
              `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episode.id}/transcripts`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: transcript.text,
                  words: transcript.words,
                  language: transcript.language,
                  name: transcript.name,
                  audioFingerprint: transcript.audioFingerprint,
                }),
              }
            );
            console.log(`[Migration] Migrated transcript for "${project.name}"`);
          } catch (err) {
            console.error(`[Migration] Failed to migrate transcript:`, err);
          }
        }

        // Migrate clips
        const clips = project.clips || [];
        if (clips.length > 0) {
          try {
            await authFetch(
              `${getApiBase()}/api/podcasts/${currentPodcastId}/episodes/${episode.id}/clips`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  clips: clips.map((c) => ({
                    name: c.name,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    transcript: c.transcript,
                    words: c.words,
                    clippabilityScore: c.clippabilityScore,
                    isManual: c.isManual,
                    tracks: c.tracks,
                    captionStyle: c.captionStyle,
                    format: c.format,
                  })),
                }),
              }
            );
            console.log(`[Migration] Migrated ${clips.length} clips for "${project.name}"`);
          } catch (err) {
            console.error(`[Migration] Failed to migrate clips:`, err);
          }
        }
      } catch (err) {
        console.error(`[Migration] Error migrating project ${project.name}:`, err);
      }
    }

    // Refresh episodes list after migration
    await fetchEpisodes();

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());

    // Clear localStorage projects to prevent duplicate migrations
    useProjectStore.setState({ projects: [] });
    localStorage.removeItem("podcastomatic-projects");

    console.log("[Migration] Migration complete. localStorage projects cleared.");
  }, [currentPodcastId, fetchEpisodes]);

  // Fetch episodes when podcast changes, then migrate if needed
  useEffect(() => {
    if (currentPodcastId) {
      fetchEpisodes().then(() => {
        // After fetching, check if we need to migrate
        // We'll do this in a separate effect to access the latest episodes state
      });
    } else {
      setEpisodes([]);
      setCurrentEpisode(null);
    }
  }, [currentPodcastId, fetchEpisodes]);

  // Trigger migration if database is empty but localStorage has data
  useEffect(() => {
    const MIGRATION_FLAG = "podcastomatic-migrated-to-db";
    if (
      currentPodcastId &&
      !isLoading &&
      episodes.length === 0 &&
      !migrationAttemptedRef.current &&
      !localStorage.getItem(MIGRATION_FLAG)
    ) {
      const localProjects = useProjectStore.getState().projects;
      if (localProjects.length > 0) {
        migrationAttemptedRef.current = true; // Set BEFORE calling async function
        console.log("[Migration] Database empty, localStorage has data. Starting migration...");
        migrateLocalStorageProjects();
      }
    }
  }, [currentPodcastId, isLoading, episodes.length, migrateLocalStorageProjects]);

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
    updateStageStatus,
    updateSubStepStatus,
  };
}
