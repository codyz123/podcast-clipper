import React, { useState } from "react";
import { PlusIcon, ReloadIcon, SpeakerLoudIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "./ui";
import { useEpisodes, Episode, EpisodeWithDetails } from "../hooks/useEpisodes";
import { useProjectStore } from "../stores/projectStore";
import { Project, Transcript, Clip, StageStatus, StageId, SubStepId } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { cn } from "../lib/utils";
import { ConfirmationDialog } from "./ui/ConfirmationDialog";
import { ExpandableEpisodeRow } from "./EpisodeRow";

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
  onProjectLoad: (episodeId: string) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onProjectLoad }) => {
  const {
    episodes,
    isLoading,
    createEpisode,
    fetchEpisode,
    deleteEpisode,
    updateStageStatus,
    updateSubStepStatus,
  } = useEpisodes();
  const { setCurrentProject } = useProjectStore();
  const { podcasts, currentPodcastId } = useAuthStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Episode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
          onProjectLoad(fullEpisode.id);
        }
      }
    }
  };

  const handleLoadProject = async (episodeId: string) => {
    const episode = await fetchEpisode(episodeId);
    if (episode) {
      const project = episodeToProject(episode);
      setCurrentProject(project);
      onProjectLoad(episodeId);
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

  const handleToggleExpand = (episodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }
      return next;
    });
  };

  const handleStageStatusChange = async (
    episodeId: string,
    stageId: StageId,
    nextStatus: StageStatus
  ) => {
    await updateStageStatus(episodeId, stageId, nextStatus);
  };

  const handleSubStepStatusChange = async (
    episodeId: string,
    subStepId: SubStepId,
    nextStatus: StageStatus
  ) => {
    await updateSubStepStatus(episodeId, subStepId, nextStatus);
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
                <div className="w-6" /> {/* Expand toggle column */}
                <div className="w-[260px]">Episode</div>
                <div className="w-[120px]">Guest</div>
                <div className="w-[100px]">Published</div>
                <div className="flex-1">Progress</div>
                <div className="w-[60px]" />
              </div>

              {/* Episode List */}
              <div className="flex flex-col gap-2">
                {episodes.map((episode, index) => (
                  <ExpandableEpisodeRow
                    key={episode.id}
                    episode={episode}
                    isExpanded={expandedIds.has(episode.id)}
                    onToggleExpand={() => handleToggleExpand(episode.id)}
                    onLoad={handleLoadProject}
                    onDelete={setDeleteTarget}
                    onStageStatusChange={(stageId, status) =>
                      handleStageStatusChange(episode.id, stageId, status)
                    }
                    onSubStepStatusChange={(subStepId, status) =>
                      handleSubStepStatusChange(episode.id, subStepId, status)
                    }
                    animationDelay={index * 30}
                  />
                ))}
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
