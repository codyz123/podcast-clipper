/**
 * React Query key factory and API functions for episode data fetching.
 * These are plain async functions (not hooks) that React Query calls as queryFn/mutationFn.
 */
import { apiCall, authFetch, getApiBase } from "./api";
import type { Episode, EpisodeWithDetails, Transcript, Clip } from "../hooks/useEpisodes";

// ============ Query Key Factory ============

export const episodeKeys = {
  all: (podcastId: string) => ["episodes", podcastId] as const,
  detail: (podcastId: string, episodeId: string) => ["episodes", podcastId, episodeId] as const,
};

// ============ Query Functions ============

export function fetchEpisodesList(podcastId: string): Promise<Episode[]> {
  return apiCall<{ episodes: Episode[] }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes`
  ).then((d) => d.episodes);
}

export function fetchEpisodeDetail(
  podcastId: string,
  episodeId: string
): Promise<EpisodeWithDetails> {
  return apiCall<{ episode: Episode; transcripts: Transcript[]; clips: Clip[] }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}`
  ).then(
    (d) =>
      ({
        ...d.episode,
        transcripts: d.transcripts || [],
        clips: d.clips || [],
      }) as EpisodeWithDetails
  );
}

// ============ Mutation Functions ============

export function createEpisodeApi(
  podcastId: string,
  data: { name: string; description?: string }
): Promise<Episode> {
  return apiCall<{ episode: Episode }>(`${getApiBase()}/api/podcasts/${podcastId}/episodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((d) => d.episode);
}

export function updateEpisodeApi(
  podcastId: string,
  episodeId: string,
  updates: Partial<Episode>
): Promise<Episode> {
  return apiCall<{ episode: Episode }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }
  ).then((d) => d.episode);
}

export function deleteEpisodeApi(podcastId: string, episodeId: string): Promise<void> {
  return apiCall<{ success: boolean }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}`,
    { method: "DELETE" }
  ).then(() => undefined);
}

export async function uploadAudioApi(
  podcastId: string,
  episodeId: string,
  file: File,
  audioDuration?: number
): Promise<Episode> {
  const formData = new FormData();
  formData.append("file", file);
  if (audioDuration !== undefined) {
    formData.append("audioDuration", audioDuration.toString());
  }

  const res = await authFetch(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/audio`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to upload audio");
  }

  const { episode } = await res.json();
  return episode;
}

export function saveTranscriptApi(
  podcastId: string,
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
): Promise<Transcript> {
  return apiCall<{ transcript: Transcript }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/transcripts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transcript),
    }
  ).then((d) => d.transcript);
}

export function saveTranscriptSegmentsApi(
  podcastId: string,
  episodeId: string,
  transcriptId: string,
  segments: NonNullable<Transcript["segments"]>
): Promise<boolean> {
  return apiCall<{ transcript: Transcript }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/transcripts/${transcriptId}/segments`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
    }
  ).then(() => true);
}

export function updateTranscriptApi(
  podcastId: string,
  episodeId: string,
  transcriptId: string,
  data: { text: string; words: Transcript["words"]; segments?: Transcript["segments"] }
): Promise<boolean> {
  return apiCall<{ transcript: Transcript }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/transcripts/${transcriptId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  ).then(() => true);
}

export function saveClipsApi(
  podcastId: string,
  episodeId: string,
  clips: Partial<Clip>[]
): Promise<Clip[]> {
  return apiCall<{ clips: Clip[] }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/clips`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips }),
    }
  ).then((d) => d.clips);
}

export function updateStageStatusApi(
  podcastId: string,
  episodeId: string,
  stage: string,
  status: string
): Promise<{ stageStatus: Record<string, unknown> }> {
  return apiCall<{ stageStatus: Record<string, unknown> }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/stage-status`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, status }),
    }
  );
}

export function updateSubStepStatusApi(
  podcastId: string,
  episodeId: string,
  subStepId: string,
  status: string
): Promise<{ stageStatus: Record<string, unknown> }> {
  return apiCall<{ stageStatus: Record<string, unknown> }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/substep-status`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subStepId, status }),
    }
  );
}
