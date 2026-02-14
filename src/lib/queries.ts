/**
 * React Query key factory and API functions for episode data fetching.
 * These are plain async functions (not hooks) that React Query calls as queryFn/mutationFn.
 */
import { apiCall, authFetch, getApiBase } from "./api";
import type {
  Episode,
  EpisodeWithDetails,
  Transcript,
  Clip,
  VideoSource,
} from "../hooks/useEpisodes";

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
  return apiCall<{
    episode: Episode;
    transcripts: Transcript[];
    clips: Clip[];
    videoSources?: VideoSource[];
  }>(`${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}`).then(
    (d) =>
      ({
        ...d.episode,
        transcripts: d.transcripts || [],
        clips: d.clips || [],
        videoSources: d.videoSources || [],
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

// ============ Video Sources ============

export const videoSourceKeys = {
  all: (podcastId: string, episodeId: string) => ["videoSources", podcastId, episodeId] as const,
};

export function fetchVideoSources(podcastId: string, episodeId: string): Promise<VideoSource[]> {
  return apiCall<{ videoSources: VideoSource[] }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-sources`
  ).then((d) => d.videoSources);
}

export function checkDuplicateVideosApi(
  podcastId: string,
  episodeId: string,
  fingerprints: string[]
): Promise<string[]> {
  return apiCall<{ duplicates: string[] }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-sources/check-duplicates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprints }),
    }
  ).then((d) => d.duplicates);
}

export function createVideoSourceApi(
  podcastId: string,
  episodeId: string,
  data: {
    videoBlobUrl: string;
    fileName: string;
    label?: string;
    personId?: string;
    sourceType?: string;
    contentType?: string;
    sizeBytes?: number;
    displayOrder?: number;
    contentFingerprint?: string;
  }
): Promise<VideoSource> {
  return apiCall<{ videoSource: VideoSource }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-sources`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  ).then((d) => d.videoSource);
}

export function updateVideoSourceApi(
  podcastId: string,
  episodeId: string,
  sourceId: string,
  updates: Partial<VideoSource>
): Promise<VideoSource> {
  return apiCall<{ videoSource: VideoSource }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-sources/${sourceId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }
  ).then((d) => d.videoSource);
}

export function deleteVideoSourceApi(
  podcastId: string,
  episodeId: string,
  sourceId: string
): Promise<void> {
  return apiCall<{ success: boolean }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-sources/${sourceId}`,
    { method: "DELETE" }
  ).then(() => undefined);
}

export function processVideoSourceApi(
  podcastId: string,
  episodeId: string,
  sourceId: string
): Promise<void> {
  return apiCall<{ status: string }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-sources/${sourceId}/process`,
    { method: "POST" }
  ).then(() => undefined);
}

export function updateVideoConfigApi(
  podcastId: string,
  episodeId: string,
  config: { defaultVideoSourceId?: string; primaryAudioSourceId?: string }
): Promise<void> {
  return apiCall<{ success: boolean }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/video-config`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  ).then(() => undefined);
}

export function mixVideoAudioApi(
  podcastId: string,
  episodeId: string
): Promise<{ mixedAudioBlobUrl: string }> {
  return apiCall<{ mixedAudioBlobUrl: string }>(
    `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/mix-audio`,
    { method: "POST" }
  );
}
