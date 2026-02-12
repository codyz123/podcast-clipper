import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import { useProjectStore } from "../stores/projectStore";
import { getApiBase, authFetch } from "../lib/api";
import {
  episodeKeys,
  fetchEpisodesList,
  fetchEpisodeDetail,
  createEpisodeApi,
  updateEpisodeApi,
  deleteEpisodeApi,
  uploadAudioApi,
  saveTranscriptApi,
  saveTranscriptSegmentsApi,
  updateTranscriptApi,
  saveClipsApi,
  updateStageStatusApi,
  updateSubStepStatusApi,
} from "../lib/queries";
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
  segments?: Array<{
    speakerLabel: string;
    speakerId?: string;
    startWordIndex: number;
    endWordIndex: number;
    startTime: number;
    endTime: number;
  }>;
  language?: string;
  name?: string;
  audioFingerprint?: string;
  service?: string;
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
  segments?: Array<{
    speakerLabel: string;
    speakerId?: string;
    startWordIndex: number;
    endWordIndex: number;
    startTime: number;
    endTime: number;
  }>;
  isManual?: boolean;
  tracks?: unknown;
  captionStyle?: unknown;
  format?: string;
  templateId?: string;
  background?: unknown;
  subtitle?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeWithDetails extends Episode {
  transcripts: Transcript[];
  clips: Clip[];
}

export function useEpisodes() {
  const { currentPodcastId } = useAuthStore();
  const queryClient = useQueryClient();

  // React Query for episodes list — handles caching, deduplication, and refetching
  const {
    data: episodes = [],
    isLoading,
    error: queryError,
    refetch: refetchEpisodes,
  } = useQuery({
    queryKey: episodeKeys.all(currentPodcastId ?? ""),
    queryFn: () => fetchEpisodesList(currentPodcastId ?? ""),
    enabled: !!currentPodcastId,
  });

  // Keep currentEpisode as local state for compatibility with consumers
  // that read it directly (though most use projectStore instead)
  const [currentEpisode, setCurrentEpisode] = useState<EpisodeWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync query errors to local error state for backward compatibility
  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : "Failed to fetch episodes");
    }
  }, [queryError]);

  // Fetch episodes (wrapper for backward compatibility — triggers React Query refetch)
  const fetchEpisodes = useCallback(async () => {
    if (!currentPodcastId) return;
    await refetchEpisodes();
  }, [currentPodcastId, refetchEpisodes]);

  // Fetch a single episode with details — populates React Query cache
  const fetchEpisode = useCallback(
    async (episodeId: string): Promise<EpisodeWithDetails | null> => {
      if (!currentPodcastId) return null;

      try {
        const episode = await queryClient.fetchQuery({
          queryKey: episodeKeys.detail(currentPodcastId, episodeId),
          queryFn: () => fetchEpisodeDetail(currentPodcastId, episodeId),
        });

        setCurrentEpisode(episode);
        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch episode");
        return null;
      }
    },
    [currentPodcastId, queryClient]
  );

  // Create a new episode
  const createEpisode = useCallback(
    async (name: string, description?: string): Promise<Episode | null> => {
      if (!currentPodcastId) return null;

      try {
        const episode = await createEpisodeApi(currentPodcastId, { name, description });

        // Invalidate episodes list cache to pick up the new episode
        await queryClient.invalidateQueries({
          queryKey: episodeKeys.all(currentPodcastId),
        });

        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create episode");
        return null;
      }
    },
    [currentPodcastId, queryClient]
  );

  // Update an episode — throws on failure so callers (e.g. debounced autosave) can handle errors
  const updateEpisode = useCallback(
    async (episodeId: string, updates: Partial<Episode>): Promise<Episode | null> => {
      if (!currentPodcastId) {
        throw new Error("No podcast selected");
      }

      const episode = await updateEpisodeApi(currentPodcastId, episodeId, updates);

      // Invalidate both the list and detail caches
      queryClient.invalidateQueries({
        queryKey: episodeKeys.all(currentPodcastId),
      });
      queryClient.invalidateQueries({
        queryKey: episodeKeys.detail(currentPodcastId, episodeId),
      });

      if (currentEpisode?.id === episodeId) {
        setCurrentEpisode((prev) => (prev ? { ...prev, ...episode } : null));
      }

      return episode;
    },
    [currentPodcastId, currentEpisode, queryClient]
  );

  // Delete an episode
  const deleteEpisode = useCallback(
    async (episodeId: string): Promise<boolean> => {
      if (!currentPodcastId) return false;

      try {
        await deleteEpisodeApi(currentPodcastId, episodeId);

        // Invalidate episodes list and remove detail from cache
        queryClient.invalidateQueries({
          queryKey: episodeKeys.all(currentPodcastId),
        });
        queryClient.removeQueries({
          queryKey: episodeKeys.detail(currentPodcastId, episodeId),
        });

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode(null);
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete episode");
        return false;
      }
    },
    [currentPodcastId, currentEpisode, queryClient]
  );

  // Upload audio for an episode
  const uploadAudio = useCallback(
    async (episodeId: string, file: File, audioDuration?: number): Promise<Episode | null> => {
      if (!currentPodcastId) return null;

      try {
        const episode = await uploadAudioApi(currentPodcastId, episodeId, file, audioDuration);

        // Invalidate caches
        queryClient.invalidateQueries({
          queryKey: episodeKeys.all(currentPodcastId),
        });
        queryClient.invalidateQueries({
          queryKey: episodeKeys.detail(currentPodcastId, episodeId),
        });

        if (currentEpisode?.id === episodeId) {
          setCurrentEpisode((prev) => (prev ? { ...prev, ...episode } : null));
        }

        return episode;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload audio");
        return null;
      }
    },
    [currentPodcastId, currentEpisode, queryClient]
  );

  // Save transcript
  const saveTranscript = useCallback(
    async (
      episodeId: string,
      transcript: {
        text: string;
        words: Transcript["words"];
        segments?: Transcript["segments"];
        language?: string;
        name?: string;
        audioFingerprint?: string;
        service?: string;
      }
    ): Promise<Transcript | null> => {
      if (!currentPodcastId) return null;

      try {
        const saved = await saveTranscriptApi(currentPodcastId, episodeId, transcript);

        // Invalidate detail cache
        queryClient.invalidateQueries({
          queryKey: episodeKeys.detail(currentPodcastId, episodeId),
        });

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
    [currentPodcastId, currentEpisode, queryClient]
  );

  // Save transcript segments (speaker labels)
  const saveTranscriptSegments = useCallback(
    async (
      episodeId: string,
      transcriptId: string,
      segments: NonNullable<Transcript["segments"]>
    ): Promise<boolean> => {
      if (!currentPodcastId) return false;

      try {
        await saveTranscriptSegmentsApi(currentPodcastId, episodeId, transcriptId, segments);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save transcript segments");
        return false;
      }
    },
    [currentPodcastId]
  );

  // Update transcript content (words, text, segments) — for persisting word edits
  const updateTranscript = useCallback(
    async (
      episodeId: string,
      transcriptId: string,
      data: { text: string; words: Transcript["words"]; segments?: Transcript["segments"] }
    ): Promise<boolean> => {
      if (!currentPodcastId) return false;

      try {
        await updateTranscriptApi(currentPodcastId, episodeId, transcriptId, data);
        return true;
      } catch (err) {
        console.error("[useEpisodes] updateTranscript failed:", err);
        return false;
      }
    },
    [currentPodcastId]
  );

  // Save clips (bulk)
  const saveClips = useCallback(
    async (episodeId: string, clipsList: Partial<Clip>[]): Promise<Clip[] | null> => {
      if (!currentPodcastId) return null;

      try {
        const saved = await saveClipsApi(currentPodcastId, episodeId, clipsList);

        // Invalidate detail cache
        queryClient.invalidateQueries({
          queryKey: episodeKeys.detail(currentPodcastId, episodeId),
        });

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
    [currentPodcastId, currentEpisode, queryClient]
  );

  // Clear current episode
  const clearCurrentEpisode = useCallback(() => {
    setCurrentEpisode(null);
  }, []);

  // Update stage status (with optimistic updates)
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
        // Optimistically update the React Query cache for the episodes list
        queryClient.setQueryData(
          episodeKeys.all(currentPodcastId),
          (prev: Episode[] | undefined) =>
            prev?.map((episode) =>
              episode.id === episodeId ? { ...episode, stageStatus: nextStageStatus } : episode
            ) ?? []
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
        const { stageStatus } = await updateStageStatusApi(
          currentPodcastId,
          episodeId,
          stage,
          status
        );
        if (stageStatus) {
          applyStageStatus(stageStatus as StageStatusWithSubSteps);
        }
        return stageStatus as StageStatusWithSubSteps;
      } catch (err) {
        applyStageStatus(previousStageStatus);
        setError(err instanceof Error ? err.message : "Failed to update stage status");
        return null;
      }
    },
    [currentPodcastId, episodes, currentEpisode, queryClient]
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
        // Optimistically update the React Query cache for the episodes list
        queryClient.setQueryData(
          episodeKeys.all(currentPodcastId),
          (prev: Episode[] | undefined) =>
            prev?.map((episode) =>
              episode.id === episodeId ? { ...episode, stageStatus: nextStageStatus } : episode
            ) ?? []
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
        const { stageStatus } = await updateSubStepStatusApi(
          currentPodcastId,
          episodeId,
          subStepId,
          status
        );
        if (stageStatus) {
          applyStageStatus(stageStatus as Episode["stageStatus"]);
        }
        return stageStatus as Episode["stageStatus"];
      } catch (err) {
        applyStageStatus(previousStageStatus);
        setError(err instanceof Error ? err.message : "Failed to update sub-step status");
        return null;
      }
    },
    [currentPodcastId, episodes, currentEpisode, queryClient]
  );

  // Track if we've attempted migration in this session
  const migrationAttemptedRef = useRef(false);

  // Migrate localStorage projects to database (runs ONCE globally)
  const migrateLocalStorageProjects = useCallback(async () => {
    if (!currentPodcastId) return;

    // Check if migration was already done (persisted in localStorage)
    const MIGRATION_FLAG = "podcastomatic-migrated-to-db";
    if (localStorage.getItem(MIGRATION_FLAG)) {
      console.warn("[Migration] Already migrated previously, skipping");
      return;
    }

    // Only attempt migration once per session
    if (migrationAttemptedRef.current) return;
    migrationAttemptedRef.current = true;

    // Get projects from localStorage via projectStore
    const localProjects = useProjectStore.getState().projects;

    if (localProjects.length === 0) {
      console.warn("[Migration] No localStorage projects to migrate");
      localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
      return;
    }

    console.warn(`[Migration] Found ${localProjects.length} localStorage projects to migrate`);

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
        console.warn(`[Migration] Migrated project "${project.name}" -> episode ${episode.id}`);

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
            console.warn(`[Migration] Migrated transcript for "${project.name}"`);
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
                    templateId: c.templateId,
                    background: c.background,
                    subtitle: c.subtitle,
                  })),
                }),
              }
            );
            console.warn(`[Migration] Migrated ${clips.length} clips for "${project.name}"`);
          } catch (err) {
            console.error(`[Migration] Failed to migrate clips:`, err);
          }
        }
      } catch (err) {
        console.error(`[Migration] Error migrating project ${project.name}:`, err);
      }
    }

    // Invalidate episodes list cache to pick up migrated data
    await queryClient.invalidateQueries({
      queryKey: episodeKeys.all(currentPodcastId),
    });

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());

    // Clear localStorage projects to prevent duplicate migrations
    useProjectStore.setState({ projects: [] });
    localStorage.removeItem("podcastomatic-projects");

    console.warn("[Migration] Migration complete. localStorage projects cleared.");
  }, [currentPodcastId, queryClient]);

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
        console.warn("[Migration] Database empty, localStorage has data. Starting migration...");
        migrateLocalStorageProjects();
      }
    }
  }, [currentPodcastId, isLoading, episodes.length, migrateLocalStorageProjects]);

  return {
    episodes,
    currentEpisode,
    isLoading,
    error: error || (queryError instanceof Error ? queryError.message : null),
    fetchEpisodes,
    fetchEpisode,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    uploadAudio,
    saveTranscript,
    saveTranscriptSegments,
    updateTranscript,
    saveClips,
    clearCurrentEpisode,
    updateStageStatus,
    updateSubStepStatus,
  };
}
