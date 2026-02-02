import React, { useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  SpeakerLoudIcon,
  CheckIcon,
  PlayIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "./ui";
import { CircularProgress } from "./ui/Progress";
import { useEpisodes, Episode } from "../hooks/useEpisodes";
import { useProjectStore } from "../stores/projectStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { formatDuration } from "../lib/formats";
import { cn } from "../lib/utils";
import { ConfirmationDialog } from "./ui/ConfirmationDialog";

interface ProjectsViewProps {
  onProjectLoad: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onProjectLoad }) => {
  const { episodes, isLoading, createEpisode, fetchEpisode, deleteEpisode } = useEpisodes();
  const { currentProject, loadProject } = useProjectStore();
  const { podcastMetadata } = useWorkspaceStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Episode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const podcastName = podcastMetadata.name || "My Podcast";

  const handleCreateProject = async () => {
    if (newProjectName.trim()) {
      setIsCreating(true);
      const episode = await createEpisode(newProjectName.trim());
      setIsCreating(false);

      if (episode) {
        setNewProjectName("");
        setShowNewProject(false);
        // Load the new episode and navigate
        await fetchEpisode(episode.id);
        loadProject(episode.id);
        onProjectLoad();
      }
    }
  };

  const handleLoadProject = async (episodeId: string) => {
    await fetchEpisode(episodeId);
    loadProject(episodeId);
    onProjectLoad();
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getProjectProgress = (episode: Episode) => {
    let steps = 0;
    if (episode.audioBlobUrl) steps++;
    // We'd need to fetch episode details to know about transcripts/clips
    // For now, show progress based on audio
    return Math.round((steps / 3) * 100);
  };

  const getProjectStatus = (episode: Episode) => {
    if (episode.audioBlobUrl) return { label: "Audio loaded", color: "magenta" };
    return { label: "New episode", color: "ghost" };
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

            {/* Project Grid */}
            <div className="mx-auto w-full max-w-4xl">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                {episodes.map((episode, index) => {
                  const isActive = currentProject?.id === episode.id;
                  const progress = getProjectProgress(episode);
                  const status = getProjectStatus(episode);
                  const hasAudio = !!episode.audioBlobUrl;

                  return (
                    <div
                      key={episode.id}
                      onClick={() => handleLoadProject(episode.id)}
                      className={cn("group relative cursor-pointer", "animate-fadeInUp")}
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      <div
                        className={cn(
                          "relative h-full overflow-hidden rounded-xl transition-all duration-150",
                          "bg-[hsl(var(--surface)/0.7)]",
                          "backdrop-blur-lg",
                          "border",
                          isActive
                            ? "border-[hsl(var(--cyan)/0.3)] shadow-lg"
                            : "border-[hsl(var(--glass-border))]",
                          "hover:border-[hsl(0_0%_100%/0.12)]",
                          "hover:bg-[hsl(var(--raised)/0.9)]",
                          "hover:-translate-y-0.5",
                          "hover:shadow-lg"
                        )}
                      >
                        {/* Subtle accent bar */}
                        <div
                          className={cn(
                            "h-1",
                            progress === 100
                              ? "bg-[hsl(158_70%_48%/0.6)]"
                              : progress > 0
                                ? "bg-[hsl(var(--cyan)/0.5)]"
                                : "bg-[hsl(var(--glass-border))]"
                          )}
                        />

                        <div className="p-4">
                          {/* Top row: Progress + Actions */}
                          <div className="mb-3 flex items-start justify-between">
                            <CircularProgress
                              value={progress}
                              size={36}
                              strokeWidth={3}
                              showLabel
                              variant={progress === 100 ? "gradient" : "cyan"}
                            />

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(episode);
                              }}
                              className={cn(
                                "rounded-lg p-1.5 opacity-0 transition-opacity group-hover:opacity-100",
                                "text-[hsl(var(--text-ghost))]",
                                "hover:text-[hsl(var(--error))]",
                                "hover:bg-[hsl(var(--error)/0.1)]"
                              )}
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Project name */}
                          <h3 className="mb-0.5 truncate font-[family-name:var(--font-display)] text-base font-semibold text-[hsl(var(--text))]">
                            {episode.name}
                          </h3>

                          {/* Date */}
                          <p className="mb-3 text-xs text-[hsl(var(--text-ghost))]">
                            {formatDate(episode.updatedAt)}
                          </p>

                          {/* Stats */}
                          <div className="mb-3 flex items-center gap-3">
                            {hasAudio && episode.audioDuration && (
                              <div className="flex items-center gap-1.5">
                                <SpeakerLoudIcon className="h-3 w-3 text-[hsl(var(--text-subtle))]" />
                                <span className="font-mono text-xs text-[hsl(var(--text-subtle))]">
                                  {formatDuration(episode.audioDuration)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Status badge */}
                          <div className="flex items-center justify-between">
                            <div
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
                                status.color === "success" &&
                                  "bg-[hsl(158_50%_15%/0.5)] text-[hsl(var(--success))]",
                                status.color === "cyan" &&
                                  "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]",
                                status.color === "magenta" &&
                                  "bg-[hsl(325_50%_15%/0.5)] text-[hsl(var(--magenta))]",
                                status.color === "ghost" &&
                                  "bg-[hsl(var(--surface)/0.5)] text-[hsl(var(--text-ghost))]"
                              )}
                            >
                              {status.color !== "ghost" && <CheckIcon className="h-2.5 w-2.5" />}
                              {status.label}
                            </div>

                            {/* Play button on hover */}
                            <div
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full",
                                "bg-[hsl(var(--cyan))]",
                                "opacity-0 transition-opacity group-hover:opacity-100"
                              )}
                            >
                              <PlayIcon className="ml-0.5 h-2.5 w-2.5 text-[hsl(var(--bg-base))]" />
                            </div>
                          </div>
                        </div>
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
