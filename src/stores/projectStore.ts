import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Project,
  Transcript,
  Clip,
  RenderJob,
  VideoFormat,
  ExportRecord,
} from "../lib/types";
import { generateId } from "../lib/utils";

interface ProjectState {
  // Current project
  currentProject: Project | null;
  projects: Project[];
  
  // Render queue
  renderQueue: RenderJob[];
  
  // Actions
  createProject: (name: string, audioPath: string, audioDuration: number) => Project;
  loadProject: (projectId: string) => void;
  updateProject: (updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  
  // Transcript actions
  setTranscript: (transcript: Transcript) => void;
  updateTranscriptWord: (wordIndex: number, newText: string) => void;
  
  // Clip actions
  addClip: (clip: Omit<Clip, "id" | "createdAt">) => Clip;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  
  // Render queue actions
  addRenderJob: (clipId: string, format: VideoFormat, templateId: string) => RenderJob;
  updateRenderJob: (jobId: string, updates: Partial<RenderJob>) => void;
  removeRenderJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  
  // Export history
  addExportRecord: (record: Omit<ExportRecord, "id" | "exportedAt">) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      currentProject: null,
      projects: [],
      renderQueue: [],

      createProject: (name, audioPath, audioDuration) => {
        const project: Project = {
          id: generateId(),
          name,
          audioPath,
          audioDuration,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          clips: [],
          exportHistory: [],
        };

        set((state) => ({
          projects: [...state.projects, project],
          currentProject: project,
        }));

        return project;
      },

      loadProject: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (project) {
          set({ currentProject: project });
        }
      },

      updateProject: (updates) => {
        set((state) => {
          if (!state.currentProject) return state;

          const updatedProject = {
            ...state.currentProject,
            ...updates,
            updatedAt: new Date().toISOString(),
          };

          return {
            currentProject: updatedProject,
            projects: state.projects.map((p) =>
              p.id === updatedProject.id ? updatedProject : p
            ),
          };
        });
      },

      deleteProject: (projectId) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject:
            state.currentProject?.id === projectId
              ? null
              : state.currentProject,
        }));
      },

      setTranscript: (transcript) => {
        get().updateProject({ transcript });
      },

      updateTranscriptWord: (wordIndex, newText) => {
        set((state) => {
          if (!state.currentProject?.transcript) return state;

          const newWords = [...state.currentProject.transcript.words];
          if (newWords[wordIndex]) {
            newWords[wordIndex] = { ...newWords[wordIndex], text: newText };
          }

          const newTranscript = {
            ...state.currentProject.transcript,
            words: newWords,
            text: newWords.map((w) => w.text).join(" "),
          };

          return {
            currentProject: {
              ...state.currentProject,
              transcript: newTranscript,
              updatedAt: new Date().toISOString(),
            },
            projects: state.projects.map((p) =>
              p.id === state.currentProject!.id
                ? { ...p, transcript: newTranscript, updatedAt: new Date().toISOString() }
                : p
            ),
          };
        });
      },

      addClip: (clipData) => {
        const clip: Clip = {
          ...clipData,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };

        set((state) => {
          if (!state.currentProject) return state;

          const updatedProject = {
            ...state.currentProject,
            clips: [...state.currentProject.clips, clip],
            updatedAt: new Date().toISOString(),
          };

          return {
            currentProject: updatedProject,
            projects: state.projects.map((p) =>
              p.id === updatedProject.id ? updatedProject : p
            ),
          };
        });

        return clip;
      },

      updateClip: (clipId, updates) => {
        set((state) => {
          if (!state.currentProject) return state;

          const updatedClips = state.currentProject.clips.map((c) =>
            c.id === clipId ? { ...c, ...updates } : c
          );

          const updatedProject = {
            ...state.currentProject,
            clips: updatedClips,
            updatedAt: new Date().toISOString(),
          };

          return {
            currentProject: updatedProject,
            projects: state.projects.map((p) =>
              p.id === updatedProject.id ? updatedProject : p
            ),
          };
        });
      },

      removeClip: (clipId) => {
        set((state) => {
          if (!state.currentProject) return state;

          const updatedProject = {
            ...state.currentProject,
            clips: state.currentProject.clips.filter((c) => c.id !== clipId),
            updatedAt: new Date().toISOString(),
          };

          return {
            currentProject: updatedProject,
            projects: state.projects.map((p) =>
              p.id === updatedProject.id ? updatedProject : p
            ),
          };
        });
      },

      addRenderJob: (clipId, format, templateId) => {
        const job: RenderJob = {
          id: generateId(),
          clipId,
          format,
          templateId,
          status: "queued",
          progress: 0,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          renderQueue: [...state.renderQueue, job],
        }));

        return job;
      },

      updateRenderJob: (jobId, updates) => {
        set((state) => ({
          renderQueue: state.renderQueue.map((job) =>
            job.id === jobId ? { ...job, ...updates } : job
          ),
        }));
      },

      removeRenderJob: (jobId) => {
        set((state) => ({
          renderQueue: state.renderQueue.filter((job) => job.id !== jobId),
        }));
      },

      clearCompletedJobs: () => {
        set((state) => ({
          renderQueue: state.renderQueue.filter(
            (job) => job.status !== "completed" && job.status !== "failed"
          ),
        }));
      },

      addExportRecord: (record) => {
        set((state) => {
          if (!state.currentProject) return state;

          const exportRecord: ExportRecord = {
            ...record,
            id: generateId(),
            exportedAt: new Date().toISOString(),
          };

          const updatedProject = {
            ...state.currentProject,
            exportHistory: [...state.currentProject.exportHistory, exportRecord],
            updatedAt: new Date().toISOString(),
          };

          return {
            currentProject: updatedProject,
            projects: state.projects.map((p) =>
              p.id === updatedProject.id ? updatedProject : p
            ),
          };
        });
      },
    }),
    {
      name: "podcast-clipper-projects",
      partialize: (state) => ({
        projects: state.projects,
        currentProject: state.currentProject,
      }),
    }
  )
);
