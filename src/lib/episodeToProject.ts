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
  }));

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
    transcript:
      (preferredTranscriptId && transcripts.find((t) => t.id === preferredTranscriptId)) ||
      transcripts[0],
    transcripts,
    activeTranscriptId:
      preferredTranscriptId && transcripts.some((t) => t.id === preferredTranscriptId)
        ? preferredTranscriptId
        : transcripts[0]?.id,
    clips,
    exportHistory: [],
  };
}
