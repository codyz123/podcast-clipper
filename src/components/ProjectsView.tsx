import React, { useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  SpeakerLoudIcon,
  PersonIcon,
  CalendarIcon,
  ChevronRightIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "./ui";
import { StageProgressBar } from "./ui/StageProgressBar";
import { useEpisodes, Episode, EpisodeWithDetails } from "../hooks/useEpisodes";
import { useProjectStore } from "../stores/projectStore";
import { Project, Transcript, Clip } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { formatDuration } from "../lib/formats";
import { cn } from "../lib/utils";
import { ConfirmationDialog } from "./ui/ConfirmationDialog";

// Convert database episode to Project format for projectStore
function episodeToProject(episode: EpisodeWithDetails): Project {
  // Convert transcripts
  const transcripts: Transcript[] = episode.transcripts.map((t) => ({
    id: t.id,
    projectId: episode.id,
    audioFingerprint: t.audioFingerprint,
    text: t.text,
    words: t.words,
    language: t.language || "en",
    createdAt: t.createdAt,
    name: t.name,
  }));

  // Convert clips
  const clips: Clip[] = episode.clips.map((c) => ({
    id: c.id,
    projectId: episode.id,
    name: c.name,
    startTime: c.startTime,
    endTime: c.endTime,
    transcript: c.transcript || "",
    words: c.words,
    clippabilityScore: c.clippabilityScore,
    isManual: c.isManual || false,
    createdAt: c.createdAt,
    tracks: c.tracks as Project["clips"][0]["tracks"],
    captionStyle: c.captionStyle as Project["clips"][0]["captionStyle"],
    format: c.format as Project["clips"][0]["format"],
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
    transcript: transcripts[0], // Legacy: first transcript
    transcripts,
    activeTranscriptId: transcripts[0]?.id,
    clips,
    exportHistory: [],
  };
}

interface ProjectsViewProps {
  onProjectLoad: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onProjectLoad }) => {
  const { episodes, isLoading, createEpisode, fetchEpisode, deleteEpisode } = useEpisodes();
  const { setCurrentProject } = useProjectStore();
  const { podcasts, currentPodcastId } = useAuthStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Episode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get podcast name from current podcast in authStore
  const currentPodcast = podcasts.find((p) => p.id === currentPodcastId);
  const podcastName = currentPodcast?.name || "My Podcast";

  const handleCreateProject = async () => {
    if (newProjectName.trim()) {
      setIsCreating(true);
      const episode = await createEpisode(newProjectName.trim());
      setIsCreating(false);

      if (episode) {
        setNewProjectName("");
        setShowNewProject(false);
        // Fetch full episode details and convert to Project
        const fullEpisode = await fetchEpisode(episode.id);
        if (fullEpisode) {
          const project = episodeToProject(fullEpisode);
          setCurrentProject(project);
          onProjectLoad();
        }
      }
    }
  };

  const handleLoadProject = async (episodeId: string) => {
    const episode = await fetchEpisode(episodeId);
    if (episode) {
      const project = episodeToProject(episode);
      setCurrentProject(project);
      onProjectLoad();
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    const success = await deleteEpisode(deleteTarget.id);
    setIsDeleting(false);

    if (success) {
      setDeleteTarget(null);
    }
  };

  const formatPublishDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getGuestName = (episode: Episode): string | null => {
    if (episode.guests && episode.guests.length > 0) {
      return episode.guests[0].name;
    }
    return null;
  };

  return (
    <div className="min-h-full w-full">
      {/* Hero Section */}
      <div className="mb-10 w-full text-center sm:mb-14">
        <h1
          className={cn(
            "mb-3 text-3xl font-bold tracking-tight sm:text-4xl",
            "font-[family-name:var(--font-display)]",
            "text-[hsl(var(--text))]"
          )}
        >
          Episodes
        </h1>
        <p className="mx-auto max-w-md text-sm text-[hsl(var(--text-muted))] sm:text-base">
          {podcastName}
        </p>
      </div>

      {/* Loading State */}
      {isLoading && episodes.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <ReloadIcon className="h-6 w-6 animate-spin text-[hsl(var(--text-ghost))]" />
        </div>
      )}

      {/* New Project Form */}
      {showNewProject && (
        <div className="mx-auto mb-8 w-full max-w-md sm:mb-10">
          <Card variant="default" className="animate-scaleIn">
            <CardContent className="p-5">
              <h3 className="mb-4 font-[family-name:var(--font-display)] text-base font-semibold text-[hsl(var(--text))]">
                Create New Episode
              </h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Episode name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                    autoFocus
                    disabled={isCreating}
                  />
                </div>
                <Button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || isCreating}
                >
                  {isCreating ? "Creating..." : "Create"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowNewProject(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && episodes.length === 0 && !showNewProject ? (
        <div className="w-full py-10 text-center sm:py-16">
          <div
            className={cn(
              "mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl",
              "bg-[hsl(var(--surface))]",
              "border border-[hsl(var(--glass-border))]"
            )}
          >
            <SpeakerLoudIcon className="h-8 w-8 text-[hsl(var(--text-ghost))]" />
          </div>

          <h3 className="mb-2 font-[family-name:var(--font-display)] text-xl font-bold text-[hsl(var(--text))] sm:text-2xl">
            No episodes yet
          </h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-[hsl(var(--text-muted))]">
            Create your first episode to start turning podcasts into viral clips
          </p>
          <Button onClick={() => setShowNewProject(true)} glow>
            <PlusIcon className="h-4 w-4" />
            <span>Create First Episode</span>
          </Button>
        </div>
      ) : (
        !isLoading && (
          <div className="w-full">
            {/* Create Button */}
            {!showNewProject && (
              <div className="mb-6 flex justify-center sm:mb-8">
                <Button onClick={() => setShowNewProject(true)} glow>
                  <PlusIcon className="h-4 w-4" />
                  <span>New Episode</span>
                </Button>
              </div>
            )}

            {/* Episode Rows */}
            <div className="mx-auto w-full max-w-4xl">
              {/* Header Row */}
              <div
                className={cn(
                  "mb-2 hidden items-center gap-4 px-4 text-xs font-medium tracking-wider uppercase sm:flex",
                  "text-[hsl(var(--text-ghost))]"
                )}
              >
                <div className="w-[280px]">Episode</div>
                <div className="w-[120px]">Guest</div>
                <div className="w-[100px]">Published</div>
                <div className="flex-1">Progress</div>
                <div className="w-[60px]" />
              </div>

              {/* Episode List */}
              <div className="flex flex-col gap-2">
                {episodes.map((episode, index) => {
                  const guestName = getGuestName(episode);
                  const hasAudio = !!episode.audioBlobUrl;

                  return (
                    <div
                      key={episode.id}
                      onClick={() => handleLoadProject(episode.id)}
                      className={cn("group cursor-pointer", "animate-fadeInUp")}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-4 rounded-lg px-4 py-3 transition-all duration-150",
                          "bg-[hsl(var(--surface)/0.5)]",
                          "border border-transparent",
                          "hover:border-[hsl(var(--glass-border))]",
                          "hover:bg-[hsl(var(--surface)/0.8)]"
                        )}
                      >
                        {/* Episode Name + Duration */}
                        <div className="w-[280px] min-w-0 flex-shrink-0">
                          <h3 className="truncate font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                            {episode.name}
                          </h3>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--text-ghost))]">
                            {hasAudio && episode.audioDuration ? (
                              <span className="flex items-center gap-1">
                                <SpeakerLoudIcon className="h-3 w-3" />
                                {formatDuration(episode.audioDuration)}
                              </span>
                            ) : (
                              <span>No audio</span>
                            )}
                          </div>
                        </div>

                        {/* Guest */}
                        <div className="hidden w-[120px] flex-shrink-0 sm:block">
                          {guestName ? (
                            <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted))]">
                              <PersonIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />
                              <span className="truncate">{guestName}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-[hsl(var(--text-ghost))]">—</span>
                          )}
                        </div>

                        {/* Published Date */}
                        <div className="hidden w-[100px] flex-shrink-0 sm:block">
                          {episode.publishDate ? (
                            <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted))]">
                              <CalendarIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />
                              <span>{formatPublishDate(episode.publishDate)}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-[hsl(var(--text-ghost))]">—</span>
                          )}
                        </div>

                        {/* Stage Progress Bar */}
                        <div className="hidden flex-1 sm:block">
                          <StageProgressBar stageStatus={episode.stageStatus} />
                        </div>

                        {/* Actions */}
                        <div className="flex w-[60px] items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(episode);
                            }}
                            className={cn(
                              "rounded-md p-1.5 opacity-0 transition-all group-hover:opacity-100",
                              "text-[hsl(var(--text-ghost))]",
                              "hover:text-[hsl(var(--error))]",
                              "hover:bg-[hsl(var(--error)/0.1)]"
                            )}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRightIcon
                            className={cn(
                              "h-4 w-4 transition-all",
                              "text-[hsl(var(--text-ghost))]",
                              "group-hover:text-[hsl(var(--text-muted))]",
                              "group-hover:translate-x-0.5"
                            )}
                          />
                        </div>
                      </div>

                      {/* Mobile: Show guest, date, and progress below */}
                      <div className="mt-2 flex flex-wrap items-center gap-3 px-4 pb-2 sm:hidden">
                        {guestName && (
                          <span className="flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
                            <PersonIcon className="h-3 w-3" />
                            {guestName}
                          </span>
                        )}
                        {episode.publishDate && (
                          <span className="flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
                            <CalendarIcon className="h-3 w-3" />
                            {formatPublishDate(episode.publishDate)}
                          </span>
                        )}
                        <StageProgressBar stageStatus={episode.stageStatus} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProject}
        title="Delete Episode?"
        description={`This will permanently delete "${deleteTarget?.name}" and all its transcripts, clips, and data. This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
