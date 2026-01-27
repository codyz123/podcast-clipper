import React, { useState } from "react";
import { PlusIcon, TrashIcon, CalendarIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "./ui";
import { useProjectStore } from "../stores/projectStore";
import { formatDuration } from "../lib/formats";

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
      year: "numeric",
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            Projects
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">
            Select a project or create a new one
          </p>
        </div>
        <Button onClick={() => setShowNewProject(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* New Project Form */}
      {showNewProject && (
        <Card className="mb-6">
          <CardContent>
            <h3 className="text-lg font-semibold mb-4">Create New Project</h3>
            <div className="flex gap-3">
              <Input
                placeholder="Project name (e.g., Episode 42)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                autoFocus
              />
              <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                Create
              </Button>
              <Button variant="ghost" onClick={() => setShowNewProject(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projects List */}
      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="text-[hsl(var(--muted-foreground))]">
              <p className="text-lg mb-2">No projects yet</p>
              <p className="text-sm">Create a new project to get started</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-all hover:border-[hsl(var(--primary))] ${
                currentProject?.id === project.id
                  ? "border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]"
                  : ""
              }`}
              onClick={() => handleLoadProject(project.id)}
            >
              <CardContent className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="w-4 h-4" />
                      {formatDate(project.updatedAt)}
                    </span>
                    {project.audioDuration > 0 && (
                      <span>{formatDuration(project.audioDuration)}</span>
                    )}
                    {project.transcript && (
                      <span className="text-green-500">Transcribed</span>
                    )}
                    {project.clips.length > 0 && (
                      <span>{project.clips.length} clips</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  className="text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
