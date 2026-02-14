/**
 * Convert a database EpisodeWithDetails to the internal Project format used by projectStore.
 * This is the single canonical conversion function — do not duplicate elsewhere.
 */
import type { EpisodeWithDetails } from "../hooks/useEpisodes";
import type { Project, Transcript, Clip } from "./types";

export function episodeToProject(
  episode: EpisodeWithDetails,
  preferredTranscriptId?: string
): Project {
  const transcripts: Transcript[] = episode.transcripts.map((t) => {
    // Ensure segments always exist — default to a single "Person 1" segment
    const segments =
      t.segments && t.segments.length > 0
        ? t.segments
        : t.words.length > 0
          ? [
              {
                speakerLabel: "Person 1",
                startWordIndex: 0,
                endWordIndex: t.words.length,
                startTime: t.words[0]?.start ?? 0,
                endTime: t.words[t.words.length - 1]?.end ?? 0,
              },
            ]
          : undefined;

    return {
      id: t.id,
      projectId: episode.id,
      audioFingerprint: t.audioFingerprint,
      text: t.text,
      words: t.words,
      segments,
      language: t.language || "en",
      createdAt: t.createdAt,
      name: t.name,
      service: t.service,
    };
  });

  const clips: Clip[] = episode.clips.map((c) => ({
    id: c.id,
    projectId: episode.id,
    name: c.name,
    startTime: c.startTime,
    endTime: c.endTime,
    transcript: c.transcript || "",
    words: c.words,
    segments: c.segments,
    clippabilityScore: c.clippabilityScore,
    isManual: c.isManual || false,
    createdAt: c.createdAt,
    tracks: c.tracks as Clip["tracks"],
    captionStyle: c.captionStyle as Clip["captionStyle"],
    format: c.format as Clip["format"],
    templateId: c.templateId as Clip["templateId"],
    background: c.background as Clip["background"],
    subtitle: c.subtitle as Clip["subtitle"],
    multicamLayout: c.multicamLayout as Clip["multicamLayout"],
    generatedAssets: c.generatedAssets as Clip["generatedAssets"],
    hookAnalysis: c.hookAnalysis as Clip["hookAnalysis"],
  }));

  // Re-derive clip words from the active transcript so edits propagate automatically.
  // This ensures transcript changes on the Transcribe page flow to clips.
  const activeTranscriptForSync =
    transcripts.find((t) => t.id === preferredTranscriptId) || transcripts[0];
  // Re-derive clip words — epsilon handles float precision mismatch between
  // PostgreSQL real (32-bit) and JSONB doubles (64-bit) for boundary comparisons
  const eps = 0.05;
  if (activeTranscriptForSync?.words?.length) {
    for (const clip of clips) {
      const freshWords = activeTranscriptForSync.words.filter(
        (w) => w.start >= clip.startTime - eps && w.end <= clip.endTime + eps
      );
      if (freshWords.length > 0) {
        clip.words = freshWords;
        clip.transcript = freshWords.map((w) => w.text).join(" ");
      }
    }
  }

  // When no explicit preference, prefer a transcript that has speaker IDs assigned
  // (indicates the user identified speakers in the transcript editor)
  const resolvedTranscriptId = (() => {
    if (preferredTranscriptId && transcripts.some((t) => t.id === preferredTranscriptId)) {
      return preferredTranscriptId;
    }
    const withSpeakerIds = transcripts.find((t) => t.segments?.some((s) => s.speakerId));
    return withSpeakerIds?.id ?? transcripts[0]?.id;
  })();

  return {
    id: episode.id,
    name: episode.name,
    audioPath: episode.audioBlobUrl || "",
    audioFileName: episode.audioFileName,
    audioDuration: episode.audioDuration || 0,
    createdAt: episode.createdAt,
    updatedAt: episode.updatedAt,
    description: episode.description,
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    publishDate: episode.publishDate,
    showNotes: episode.showNotes,
    explicit: episode.explicit,
    guests: episode.guests,
    stageStatus: episode.stageStatus,
    transcript: transcripts.find((t) => t.id === resolvedTranscriptId) || transcripts[0],
    transcripts,
    activeTranscriptId: resolvedTranscriptId,
    clips,
    mediaType: episode.mediaType,
    defaultVideoSourceId: episode.defaultVideoSourceId,
    primaryAudioSourceId: episode.primaryAudioSourceId,
    mixedAudioBlobUrl: episode.mixedAudioBlobUrl,
    videoSyncStatus: episode.videoSyncStatus,
    videoSources: episode.videoSources,
    exportHistory: [],
  };
}
