import React, { useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  SpeakerLoudIcon,
  CheckIcon,
  ScissorsIcon,
  PlayIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "./ui";
import { CircularProgress } from "./ui/Progress";
import { useProjectStore } from "../stores/projectStore";
import { formatDuration } from "../lib/formats";
import { cn } from "../lib/utils";

interface ProjectsViewProps {
  onProjectLoad: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onProjectLoad }) => {
  const { projects, currentProject, loadProject, deleteProject, createProject } =
    useProjectStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProject(newProjectName.trim(), "", 0);
      setNewProjectName("");
      setShowNewProject(false);
      onProjectLoad();
    }
  };

  const handleLoadProject = (projectId: string) => {
    loadProject(projectId);
    onProjectLoad();
  };

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this project?")) {
      deleteProject(projectId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getProjectProgress = (project: typeof projects[0]) => {
    let steps = 0;
    if (project.audioPath) steps++;
    if (project.transcript) steps++;
    if (project.clips.length > 0) steps++;
    return Math.round((steps / 3) * 100);
  };

  const getProjectStatus = (project: typeof projects[0]) => {
    if (project.clips.length > 0) return { label: "Ready to export", color: "success" };
    if (project.transcript) return { label: "Transcribed", color: "cyan" };
    if (project.audioPath) return { label: "Audio loaded", color: "magenta" };
    return { label: "New project", color: "ghost" };
  };

  return (
    <div className="min-h-full w-full">
      {/* Hero Section */}
      <div className="w-full text-center mb-10 sm:mb-14">
        <div className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6",
          "bg-[hsl(var(--surface))]",
          "border border-[hsl(var(--glass-border))]"
        )}>
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--cyan))]" />
          <span className="text-xs font-medium text-[hsl(var(--text-muted))]">
            {projects.length} project{projects.length !== 1 ? "s" : ""} in studio
          </span>
        </div>

        <h1 className={cn(
          "text-3xl sm:text-4xl font-bold tracking-tight mb-3",
          "font-[family-name:var(--font-display)]",
          "text-[hsl(var(--text))]"
        )}>
          Your Projects
        </h1>
        <p className="text-[hsl(var(--text-muted))] text-sm sm:text-base max-w-md mx-auto">
          Transform podcast episodes into viral clips with AI-powered editing
        </p>
      </div>

      {/* New Project Form */}
      {showNewProject && (
        <div className="w-full max-w-md mx-auto mb-8 sm:mb-10">
          <Card variant="default" className="animate-scaleIn">
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-[hsl(var(--text))] mb-4 font-[family-name:var(--font-display)]">
                Create New Project
              </h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Project name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                    autoFocus
                  />
                </div>
                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                  Create
                </Button>
                <Button variant="ghost" onClick={() => setShowNewProject(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && !showNewProject ? (
        <div className="w-full text-center py-10 sm:py-16">
          {/* Simple icon container */}
          <div className={cn(
            "w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center",
            "bg-[hsl(var(--surface))]",
            "border border-[hsl(var(--glass-border))]"
          )}>
            <SpeakerLoudIcon className="w-8 h-8 text-[hsl(var(--text-ghost))]" />
          </div>

          <h3 className="text-xl sm:text-2xl font-bold text-[hsl(var(--text))] mb-2 font-[family-name:var(--font-display)]">
            No projects yet
          </h3>
          <p className="text-sm text-[hsl(var(--text-muted))] mb-6 max-w-sm mx-auto">
            Create your first project to start turning podcasts into viral clips
          </p>
          <Button onClick={() => setShowNewProject(true)} glow>
            <PlusIcon className="w-4 h-4" />
            <span>Create First Project</span>
          </Button>
        </div>
      ) : (
        <div className="w-full">
          {/* Create Button */}
          {!showNewProject && (
            <div className="flex justify-center mb-6 sm:mb-8">
              <Button onClick={() => setShowNewProject(true)} glow>
                <PlusIcon className="w-4 h-4" />
                <span>New Project</span>
              </Button>
            </div>
          )}

          {/* Project Grid */}
          <div className="w-full max-w-4xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {projects.map((project, index) => {
                const isActive = currentProject?.id === project.id;
                const progress = getProjectProgress(project);
                const status = getProjectStatus(project);
                const hasAudio = !!project.audioPath;
                const hasClips = project.clips.length > 0;

                return (
                  <div
                    key={project.id}
                    onClick={() => handleLoadProject(project.id)}
                    className={cn(
                      "group relative cursor-pointer",
                      "animate-fadeInUp"
                    )}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className={cn(
                      "relative h-full rounded-xl overflow-hidden transition-all duration-150",
                      "bg-[hsl(var(--surface)/0.7)]",
                      "backdrop-blur-lg",
                      "border",
                      isActive
                        ? "border-[hsl(185_100%_50%/0.3)] shadow-lg"
                        : "border-[hsl(var(--glass-border))]",
                      "hover:border-[hsl(0_0%_100%/0.12)]",
                      "hover:bg-[hsl(var(--raised)/0.9)]",
                      "hover:-translate-y-0.5",
                      "hover:shadow-lg"
                    )}>
                      {/* Subtle accent bar */}
                      <div className={cn(
                        "h-1",
                        progress === 100
                          ? "bg-[hsl(158_70%_48%/0.6)]"
                          : progress > 0
                            ? "bg-[hsl(185_100%_50%/0.5)]"
                            : "bg-[hsl(var(--glass-border))]"
                      )} />

                      <div className="p-4">
                        {/* Top row: Progress + Actions */}
                        <div className="flex items-start justify-between mb-3">
                          <CircularProgress
                            value={progress}
                            size={36}
                            strokeWidth={3}
                            showLabel
                            variant={progress === 100 ? "gradient" : "cyan"}
                          />

                          <button
                            onClick={(e) => handleDeleteProject(e, project.id)}
                            className={cn(
                              "p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
                              "text-[hsl(var(--text-ghost))]",
                              "hover:text-[hsl(var(--error))]",
                              "hover:bg-[hsl(var(--error)/0.1)]"
                            )}
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Project name */}
                        <h3 className="text-base font-semibold text-[hsl(var(--text))] mb-0.5 font-[family-name:var(--font-display)] truncate">
                          {project.name}
                        </h3>

                        {/* Date */}
                        <p className="text-xs text-[hsl(var(--text-ghost))] mb-3">
                          {formatDate(project.updatedAt)}
                        </p>

                        {/* Stats */}
                        <div className="flex items-center gap-3 mb-3">
                          {hasAudio && (
                            <div className="flex items-center gap-1.5">
                              <SpeakerLoudIcon className="w-3 h-3 text-[hsl(var(--text-subtle))]" />
                              <span className="text-xs text-[hsl(var(--text-subtle))] font-mono">
                                {formatDuration(project.audioDuration)}
                              </span>
                            </div>
                          )}
                          {hasClips && (
                            <div className="flex items-center gap-1.5">
                              <ScissorsIcon className="w-3 h-3 text-[hsl(var(--cyan))]" />
                              <span className="text-xs text-[hsl(var(--cyan))] font-medium">
                                {project.clips.length} clips
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Status badge */}
                        <div className="flex items-center justify-between">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
                            status.color === "success" && "bg-[hsl(158_50%_15%/0.5)] text-[hsl(var(--success))]",
                            status.color === "cyan" && "bg-[hsl(185_50%_15%/0.5)] text-[hsl(var(--cyan))]",
                            status.color === "magenta" && "bg-[hsl(325_50%_15%/0.5)] text-[hsl(var(--magenta))]",
                            status.color === "ghost" && "bg-[hsl(var(--surface)/0.5)] text-[hsl(var(--text-ghost))]"
                          )}>
                            {status.color !== "ghost" && (
                              <CheckIcon className="w-2.5 h-2.5" />
                            )}
                            {status.label}
                          </div>

                          {/* Play button on hover */}
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center",
                            "bg-[hsl(185_100%_50%)]",
                            "opacity-0 group-hover:opacity-100 transition-opacity"
                          )}>
                            <PlayIcon className="w-2.5 h-2.5 text-[hsl(260_30%_6%)] ml-0.5" />
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
      )}
    </div>
  );
};
