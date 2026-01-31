import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Project, Transcript, Clip, RenderJob, VideoFormat, ExportRecord } from "../lib/types";
import { generateId } from "../lib/utils";

// ============ One-time Migration: Clear bloated localStorage ============
// This runs before the store initializes to fix quota issues
(function migrateLocalStorage() {
  if (typeof window === "undefined") return;

  const STORAGE_KEY = "podcast-clipper-projects";
  const MIGRATION_FLAG = "podcast-clipper-migrated-v4";

  // Only run migration once
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(MIGRATION_FLAG, "true");
      return;
    }

    // Check if storage is bloated (> 1MB likely means transcripts are stored inline)
    if (stored.length > 1_000_000) {
      console.log("[Migration] Detected bloated localStorage, clearing for fresh start...");
      localStorage.removeItem(STORAGE_KEY);
    }

    localStorage.setItem(MIGRATION_FLAG, "true");
  } catch (err) {
    // If we can't even read localStorage, clear it
    console.error("[Migration] Error reading localStorage, clearing:", err);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(MIGRATION_FLAG, "true");
    } catch {
      // Ignore - localStorage might be completely full
    }
  }
})();

// IndexedDB storage for large data (audio blobs, transcripts)
const DB_NAME = "podcast-clipper-data";
const DB_VERSION = 2;
const AUDIO_STORE = "audio-blobs";
const TRANSCRIPT_STORE = "transcripts";

// In-memory cache for quick access
declare global {
  interface Window {
    __podcastClipperAudioBlobs?: Map<string, Blob>;
    __podcastClipperTranscripts?: Map<string, Transcript[]>;
  }
}

const getAudioMemoryCache = (): Map<string, Blob> => {
  if (typeof window !== "undefined") {
    if (!window.__podcastClipperAudioBlobs) {
      window.__podcastClipperAudioBlobs = new Map();
    }
    return window.__podcastClipperAudioBlobs;
  }
  return new Map();
};

const getTranscriptMemoryCache = (): Map<string, Transcript[]> => {
  if (typeof window !== "undefined") {
    if (!window.__podcastClipperTranscripts) {
      window.__podcastClipperTranscripts = new Map();
    }
    return window.__podcastClipperTranscripts;
  }
  return new Map();
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Create audio store if it doesn't exist
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
      // Create transcript store if it doesn't exist
      if (!db.objectStoreNames.contains(TRANSCRIPT_STORE)) {
        db.createObjectStore(TRANSCRIPT_STORE);
      }
    };
  });
};

// ============ Audio Blob Storage (IndexedDB) ============

export const getAudioBlob = async (projectId: string): Promise<Blob | undefined> => {
  // Check memory cache first
  const cached = getAudioMemoryCache().get(projectId);
  if (cached) return cached;

  // Fall back to IndexedDB
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, "readonly");
      const store = transaction.objectStore(AUDIO_STORE);
      const request = store.get(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const blob = request.result as Blob | undefined;
        if (blob) {
          getAudioMemoryCache().set(projectId, blob);
        }
        resolve(blob);
      };
    });
  } catch (err) {
    console.error("Failed to get audio from IndexedDB:", err);
    return undefined;
  }
};

export const setAudioBlob = async (projectId: string, blob: Blob): Promise<void> => {
  getAudioMemoryCache().set(projectId, blob);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, "readwrite");
      const store = transaction.objectStore(AUDIO_STORE);
      const request = store.put(blob, projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("Failed to store audio in IndexedDB:", err);
  }
};

export const clearAudioBlob = async (projectId: string): Promise<void> => {
  getAudioMemoryCache().delete(projectId);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, "readwrite");
      const store = transaction.objectStore(AUDIO_STORE);
      const request = store.delete(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("Failed to clear audio from IndexedDB:", err);
  }
};

// ============ Transcript Storage (IndexedDB) ============

export const getTranscriptsFromDB = async (projectId: string): Promise<Transcript[]> => {
  // Check memory cache first
  const cached = getTranscriptMemoryCache().get(projectId);
  if (cached) return cached;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSCRIPT_STORE, "readonly");
      const store = transaction.objectStore(TRANSCRIPT_STORE);
      const request = store.get(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transcripts = (request.result as Transcript[]) || [];
        getTranscriptMemoryCache().set(projectId, transcripts);
        resolve(transcripts);
      };
    });
  } catch (err) {
    console.error("Failed to get transcripts from IndexedDB:", err);
    return [];
  }
};

export const saveTranscriptsToDB = async (
  projectId: string,
  transcripts: Transcript[]
): Promise<void> => {
  getTranscriptMemoryCache().set(projectId, transcripts);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSCRIPT_STORE, "readwrite");
      const store = transaction.objectStore(TRANSCRIPT_STORE);
      const request = store.put(transcripts, projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("Failed to save transcripts to IndexedDB:", err);
  }
};

export const clearTranscriptsFromDB = async (projectId: string): Promise<void> => {
  getTranscriptMemoryCache().delete(projectId);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSCRIPT_STORE, "readwrite");
      const store = transaction.objectStore(TRANSCRIPT_STORE);
      const request = store.delete(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("Failed to clear transcripts from IndexedDB:", err);
  }
};

// Get all transcripts across all projects (for fingerprint matching)
export const getAllTranscriptsFromDB = async (): Promise<Map<string, Transcript[]>> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSCRIPT_STORE, "readonly");
      const store = transaction.objectStore(TRANSCRIPT_STORE);
      const request = store.openCursor();
      const allTranscripts = new Map<string, Transcript[]>();

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          allTranscripts.set(cursor.key as string, cursor.value as Transcript[]);
          cursor.continue();
        } else {
          resolve(allTranscripts);
        }
      };
    });
  } catch (err) {
    console.error("Failed to get all transcripts from IndexedDB:", err);
    return new Map();
  }
};

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
  addTranscript: (transcript: Transcript) => void;
  setActiveTranscript: (transcriptId: string) => void;
  deleteTranscript: (transcriptId: string) => void;
  getActiveTranscript: () => Transcript | undefined;
  getTranscriptsForFingerprint: (fingerprint: string) => Transcript[];
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
          transcripts: [],
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
          // Set project immediately with whatever transcripts are in memory
          const migratedProject = {
            ...project,
            transcripts: project.transcripts || [],
            activeTranscriptId: project.activeTranscriptId,
          };
          set({ currentProject: migratedProject });

          // Load transcripts from IndexedDB (async) and update state
          getTranscriptsFromDB(projectId).then((transcripts) => {
            const currentProject = get().currentProject;
            if (currentProject?.id === projectId && transcripts.length > 0) {
              const activeId =
                currentProject.activeTranscriptId || transcripts[transcripts.length - 1].id;
              const activeTranscript =
                transcripts.find((t) => t.id === activeId) || transcripts[transcripts.length - 1];

              set((state) => ({
                currentProject: {
                  ...state.currentProject!,
                  transcripts,
                  activeTranscriptId: activeId,
                  transcript: activeTranscript,
                },
                // Also update in projects array
                projects: state.projects.map((p) =>
                  p.id === projectId
                    ? {
                        ...p,
                        transcripts,
                        activeTranscriptId: activeId,
                        transcript: activeTranscript,
                      }
                    : p
                ),
              }));
            }
          });
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
            projects: state.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
          };
        });
      },

      deleteProject: (projectId) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        }));

        // Clean up IndexedDB data for this project
        clearTranscriptsFromDB(projectId);
        clearAudioBlob(projectId);
      },

      // Legacy: sets transcript (for backward compatibility) - now adds to transcripts array
      setTranscript: (transcript) => {
        const state = get();
        if (!state.currentProject) return;

        // Add to transcripts array and set as active
        const transcripts = [...(state.currentProject.transcripts || [])];

        // Check if this transcript already exists (by ID)
        const existingIndex = transcripts.findIndex((t) => t.id === transcript.id);
        if (existingIndex >= 0) {
          transcripts[existingIndex] = transcript;
        } else {
          transcripts.push(transcript);
        }

        get().updateProject({
          transcript, // Keep for backward compatibility
          transcripts,
          activeTranscriptId: transcript.id,
        });

        // Persist to IndexedDB (async, fire-and-forget)
        saveTranscriptsToDB(state.currentProject.id, transcripts);
      },

      // Add a new transcript without replacing the active one
      addTranscript: (transcript) => {
        const state = get();
        if (!state.currentProject) return;

        const transcripts = [...(state.currentProject.transcripts || []), transcript];

        get().updateProject({
          transcripts,
          activeTranscriptId: transcript.id,
          transcript, // Also set as legacy transcript
        });

        // Persist to IndexedDB (async, fire-and-forget)
        saveTranscriptsToDB(state.currentProject.id, transcripts);
      },

      // Set which transcript is active
      setActiveTranscript: (transcriptId) => {
        const state = get();
        if (!state.currentProject) return;

        const transcript = state.currentProject.transcripts?.find((t) => t.id === transcriptId);
        if (transcript) {
          get().updateProject({
            activeTranscriptId: transcriptId,
            transcript, // Also set as legacy transcript
          });
        }
      },

      // Delete a specific transcript
      deleteTranscript: (transcriptId) => {
        const state = get();
        if (!state.currentProject) return;

        const transcripts = (state.currentProject.transcripts || []).filter(
          (t) => t.id !== transcriptId
        );

        // If we deleted the active transcript, switch to the most recent one
        let activeTranscriptId = state.currentProject.activeTranscriptId;
        let transcript = state.currentProject.transcript;

        if (activeTranscriptId === transcriptId) {
          const mostRecent =
            transcripts.length > 0 ? transcripts[transcripts.length - 1] : undefined;
          activeTranscriptId = mostRecent?.id;
          transcript = mostRecent;
        }

        get().updateProject({
          transcripts,
          activeTranscriptId,
          transcript,
        });

        // Persist to IndexedDB (async, fire-and-forget)
        saveTranscriptsToDB(state.currentProject.id, transcripts);
      },

      // Get the currently active transcript
      getActiveTranscript: () => {
        const state = get();
        if (!state.currentProject) return undefined;

        // First try to find by activeTranscriptId
        if (state.currentProject.activeTranscriptId) {
          const active = state.currentProject.transcripts?.find(
            (t) => t.id === state.currentProject!.activeTranscriptId
          );
          if (active) return active;
        }

        // Fall back to legacy transcript field
        if (state.currentProject.transcript) {
          return state.currentProject.transcript;
        }

        // Fall back to most recent in array
        const transcripts = state.currentProject.transcripts || [];
        return transcripts.length > 0 ? transcripts[transcripts.length - 1] : undefined;
      },

      // Get all transcripts for a specific audio file fingerprint
      getTranscriptsForFingerprint: (fingerprint) => {
        const state = get();
        // Search across all projects for transcripts with matching fingerprint
        const allTranscripts: Transcript[] = [];

        for (const project of state.projects) {
          const projectTranscripts = project.transcripts || [];
          for (const t of projectTranscripts) {
            if (t.audioFingerprint === fingerprint) {
              allTranscripts.push(t);
            }
          }
          // Also check legacy transcript
          if (project.transcript?.audioFingerprint === fingerprint) {
            if (!allTranscripts.find((t) => t.id === project.transcript!.id)) {
              allTranscripts.push(project.transcript);
            }
          }
        }

        return allTranscripts;
      },

      updateTranscriptWord: (wordIndex, newText) => {
        const currentState = get();
        if (!currentState.currentProject) return;
        const projectId = currentState.currentProject.id;

        set((state) => {
          if (!state.currentProject) return state;

          // Get the active transcript
          const activeTranscript = state.currentProject.activeTranscriptId
            ? state.currentProject.transcripts?.find(
                (t) => t.id === state.currentProject!.activeTranscriptId
              )
            : state.currentProject.transcript;

          if (!activeTranscript) return state;

          const newWords = [...activeTranscript.words];
          if (newWords[wordIndex]) {
            newWords[wordIndex] = { ...newWords[wordIndex], text: newText };
          }

          const updatedTranscript = {
            ...activeTranscript,
            words: newWords,
            text: newWords.map((w) => w.text).join(" "),
          };

          // Update in transcripts array
          const transcripts = (state.currentProject.transcripts || []).map((t) =>
            t.id === updatedTranscript.id ? updatedTranscript : t
          );

          // Persist to IndexedDB (async, fire-and-forget)
          saveTranscriptsToDB(projectId, transcripts);

          return {
            currentProject: {
              ...state.currentProject,
              transcript: updatedTranscript,
              transcripts,
              updatedAt: new Date().toISOString(),
            },
            projects: state.projects.map((p) =>
              p.id === state.currentProject!.id
                ? {
                    ...p,
                    transcript: updatedTranscript,
                    transcripts,
                    updatedAt: new Date().toISOString(),
                  }
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
            projects: state.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
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
            projects: state.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
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
            projects: state.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
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
            projects: state.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
          };
        });
      },
    }),
    {
      name: "podcast-clipper-projects",
      version: 4,
      partialize: (state) => ({
        // Strip transcripts from projects - they're stored in IndexedDB
        // This keeps localStorage small (project metadata only)
        projects: state.projects.map((p) => ({
          ...p,
          transcripts: [], // Don't persist transcripts to localStorage
          transcript: undefined, // Don't persist legacy transcript either
        })),
      }),
      migrate: (persistedState: unknown, _version: number) => {
        const state = persistedState as {
          projects: Project[];
          currentProject?: Project | null;
        };

        // Ensure projects have required fields
        const migrateProject = (p: any): Project => ({
          ...p,
          transcripts: [], // Will be loaded from IndexedDB
          activeTranscriptId: undefined,
        });

        return {
          projects: (state.projects || []).map(migrateProject),
        };
      },
      onRehydrateStorage: () => {
        return async (state) => {
          if (!state) return;

          // After localStorage is loaded, load transcripts from IndexedDB for each project
          // and merge them into the state
          const { projects } = state;
          const updatedProjects: Project[] = [];

          for (const project of projects) {
            const transcripts = await getTranscriptsFromDB(project.id);
            updatedProjects.push({
              ...project,
              transcripts,
              activeTranscriptId:
                transcripts.length > 0 ? transcripts[transcripts.length - 1].id : undefined,
              transcript: transcripts.length > 0 ? transcripts[transcripts.length - 1] : undefined,
            });
          }

          // Update the store with transcripts loaded from IndexedDB
          useProjectStore.setState({ projects: updatedProjects });
        };
      },
    }
  )
);
