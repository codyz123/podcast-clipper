import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VideoFormat } from "../lib/types";
import {
  DEFAULT_DESTINATIONS,
  PLATFORM_CONFIGS,
  type PublishDestinationType,
  type PublishInstance,
  type PublishInstanceStatus,
} from "../lib/publish";
import { generateId } from "../lib/utils";

interface PublishState {
  // Core state
  instances: PublishInstance[];
  isPublishing: boolean;
  activeQueueIndex: number;

  // CRUD operations
  initializeForClips: (clipIds: string[], defaultCaption?: (clipId: string) => string) => void;
  addInstance: (clipId: string, destination: PublishDestinationType) => PublishInstance;
  removeInstance: (instanceId: string) => void;
  toggleInstance: (instanceId: string) => void;
  setInstanceFormat: (instanceId: string, format: VideoFormat) => void;
  setInstanceCaption: (instanceId: string, caption: string) => void;
  setInstanceHashtags: (instanceId: string, hashtags: string[]) => void;
  updateInstanceStatus: (instanceId: string, statusData: PublishInstanceStatus) => void;

  // Batch operations
  enableAllForClip: (clipId: string) => void;
  disableAllForClip: (clipId: string) => void;
  enableAllForDestination: (destination: PublishDestinationType) => void;
  disableAllForDestination: (destination: PublishDestinationType) => void;
  applyDefaultCaptionToAll: (clipId: string, caption: string) => void;

  // Publishing workflow
  startPublishing: () => void;
  cancelPublishing: () => void;
  retryInstance: (instanceId: string) => void;
  retryAllFailed: () => void;
  processNextInQueue: () => PublishInstance | null;
  markInstanceComplete: (instanceId: string, outputPath: string, uploadedUrl?: string) => void;
  markInstanceFailed: (instanceId: string, error: string) => void;

  // Selectors (getters)
  getInstancesForClip: (clipId: string) => PublishInstance[];
  getEnabledInstances: () => PublishInstance[];
  getFailedInstances: () => PublishInstance[];
  getQueuedInstances: () => PublishInstance[];
  getAvailableDestinations: (clipId: string) => PublishDestinationType[];
  getOverallProgress: () => {
    completed: number;
    total: number;
    currentItem?: string;
    failed: number;
  };
  getInstance: (instanceId: string) => PublishInstance | undefined;

  // Reset
  resetPublishState: () => void;
  clearInstancesForClip: (clipId: string) => void;
}

const INITIAL_STATE = {
  instances: [] as PublishInstance[],
  isPublishing: false,
  activeQueueIndex: 0,
};

export const usePublishStore = create<PublishState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // Initialize instances for a set of clips
      initializeForClips: (clipIds, defaultCaption) => {
        set((state) => {
          const existingClipIds = new Set(state.instances.map((i) => i.clipId));
          const newInstances: PublishInstance[] = [];

          for (const clipId of clipIds) {
            if (existingClipIds.has(clipId)) continue;

            for (const destination of DEFAULT_DESTINATIONS) {
              const config = PLATFORM_CONFIGS[destination];
              newInstances.push({
                id: generateId(),
                clipId,
                destination,
                format: config.defaultFormat,
                enabled: true,
                createdAt: new Date().toISOString(),
                caption: defaultCaption?.(clipId) || "",
                hashtags: [],
                statusData: { status: "idle" },
              });
            }
          }

          return { instances: [...state.instances, ...newInstances] };
        });
      },

      // Add a single instance
      addInstance: (clipId, destination) => {
        const config = PLATFORM_CONFIGS[destination];
        const instance: PublishInstance = {
          id: generateId(),
          clipId,
          destination,
          format: config.defaultFormat,
          enabled: true,
          createdAt: new Date().toISOString(),
          caption: "",
          hashtags: [],
          statusData: { status: "idle" },
        };

        set((state) => ({
          instances: [...state.instances, instance],
        }));

        return instance;
      },

      // Remove an instance
      removeInstance: (instanceId) => {
        set((state) => ({
          instances: state.instances.filter((i) => i.id !== instanceId),
        }));
      },

      // Toggle enabled state
      toggleInstance: (instanceId) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.id === instanceId ? { ...i, enabled: !i.enabled } : i
          ),
        }));
      },

      // Update format
      setInstanceFormat: (instanceId, format) => {
        set((state) => ({
          instances: state.instances.map((i) => (i.id === instanceId ? { ...i, format } : i)),
        }));
      },

      // Update caption
      setInstanceCaption: (instanceId, caption) => {
        set((state) => ({
          instances: state.instances.map((i) => (i.id === instanceId ? { ...i, caption } : i)),
        }));
      },

      // Update hashtags
      setInstanceHashtags: (instanceId, hashtags) => {
        set((state) => ({
          instances: state.instances.map((i) => (i.id === instanceId ? { ...i, hashtags } : i)),
        }));
      },

      // Update status
      updateInstanceStatus: (instanceId, statusData) => {
        set((state) => ({
          instances: state.instances.map((i) => (i.id === instanceId ? { ...i, statusData } : i)),
        }));
      },

      // Batch: enable all for a clip
      enableAllForClip: (clipId) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.clipId === clipId ? { ...i, enabled: true } : i
          ),
        }));
      },

      // Batch: disable all for a clip
      disableAllForClip: (clipId) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.clipId === clipId ? { ...i, enabled: false } : i
          ),
        }));
      },

      // Batch: enable all for a destination
      enableAllForDestination: (destination) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.destination === destination ? { ...i, enabled: true } : i
          ),
        }));
      },

      // Batch: disable all for a destination
      disableAllForDestination: (destination) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.destination === destination ? { ...i, enabled: false } : i
          ),
        }));
      },

      // Apply default caption to all instances for a clip that don't have one
      applyDefaultCaptionToAll: (clipId, caption) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.clipId === clipId && !i.caption ? { ...i, caption } : i
          ),
        }));
      },

      // Start publishing workflow
      startPublishing: () => {
        set((state) => {
          let queuePosition = 0;

          return {
            isPublishing: true,
            activeQueueIndex: 0,
            instances: state.instances.map((i) => {
              if (i.enabled && i.statusData.status === "idle") {
                const pos = queuePosition++;
                return { ...i, statusData: { status: "queued" as const, queuePosition: pos } };
              }
              return i;
            }),
          };
        });
      },

      // Cancel publishing
      cancelPublishing: () => {
        set((state) => ({
          isPublishing: false,
          activeQueueIndex: 0,
          instances: state.instances.map((i) => {
            // Reset queued instances back to idle
            if (i.statusData.status === "queued") {
              return { ...i, statusData: { status: "idle" as const } };
            }
            // Leave completed, failed, and in-progress instances as-is
            return i;
          }),
        }));
      },

      // Retry a single failed instance
      retryInstance: (instanceId) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.id === instanceId && i.statusData.status === "failed"
              ? { ...i, statusData: { status: "queued" as const, queuePosition: 0 } }
              : i
          ),
        }));
      },

      // Retry all failed instances
      retryAllFailed: () => {
        set((state) => {
          let queuePosition = 0;
          return {
            instances: state.instances.map((i) => {
              if (i.statusData.status === "failed" && i.statusData.retryCount < 3) {
                return {
                  ...i,
                  statusData: { status: "queued" as const, queuePosition: queuePosition++ },
                };
              }
              return i;
            }),
          };
        });
      },

      // Get next instance in queue and mark as rendering
      processNextInQueue: () => {
        const state = get();
        const nextInstance = state.instances.find((i) => i.statusData.status === "queued");

        if (!nextInstance) {
          set({ isPublishing: false });
          return null;
        }

        set((s) => ({
          activeQueueIndex: s.activeQueueIndex + 1,
          instances: s.instances.map((i) =>
            i.id === nextInstance.id
              ? {
                  ...i,
                  statusData: {
                    status: "rendering" as const,
                    progress: 0,
                    stage: "encoding" as const,
                  },
                }
              : i
          ),
        }));

        return nextInstance;
      },

      // Mark instance as complete
      markInstanceComplete: (instanceId, outputPath, uploadedUrl) => {
        set((state) => ({
          instances: state.instances.map((i) =>
            i.id === instanceId
              ? {
                  ...i,
                  statusData: {
                    status: "completed" as const,
                    outputPath,
                    uploadedUrl,
                    completedAt: new Date().toISOString(),
                  },
                }
              : i
          ),
        }));
      },

      // Mark instance as failed
      markInstanceFailed: (instanceId, error) => {
        set((state) => ({
          instances: state.instances.map((i) => {
            if (i.id !== instanceId) return i;

            const retryCount = i.statusData.status === "failed" ? i.statusData.retryCount + 1 : 1;

            return {
              ...i,
              statusData: {
                status: "failed" as const,
                error,
                failedAt: new Date().toISOString(),
                retryCount,
              },
            };
          }),
        }));
      },

      // Get instances for a specific clip
      getInstancesForClip: (clipId) => {
        return get().instances.filter((i) => i.clipId === clipId);
      },

      // Get all enabled instances
      getEnabledInstances: () => {
        return get().instances.filter((i) => i.enabled);
      },

      // Get all failed instances
      getFailedInstances: () => {
        return get().instances.filter((i) => i.statusData.status === "failed");
      },

      // Get all queued instances
      getQueuedInstances: () => {
        return get().instances.filter((i) => i.statusData.status === "queued");
      },

      // Get destinations not yet added for a clip
      getAvailableDestinations: (clipId) => {
        const existingDestinations = new Set(
          get()
            .instances.filter((i) => i.clipId === clipId)
            .map((i) => i.destination)
        );

        return (Object.keys(PLATFORM_CONFIGS) as PublishDestinationType[]).filter(
          (d) => !existingDestinations.has(d)
        );
      },

      // Get overall progress
      getOverallProgress: () => {
        const instances = get().instances.filter((i) => i.enabled);
        const completed = instances.filter((i) => i.statusData.status === "completed").length;
        const failed = instances.filter((i) => i.statusData.status === "failed").length;
        const inProgress = instances.find(
          (i) => i.statusData.status === "rendering" || i.statusData.status === "uploading"
        );

        return {
          completed,
          total: instances.length,
          failed,
          currentItem: inProgress ? PLATFORM_CONFIGS[inProgress.destination].shortName : undefined,
        };
      },

      // Get a single instance by ID
      getInstance: (instanceId) => {
        return get().instances.find((i) => i.id === instanceId);
      },

      // Reset entire state
      resetPublishState: () => {
        set(INITIAL_STATE);
      },

      // Clear instances for a specific clip
      clearInstancesForClip: (clipId) => {
        set((state) => ({
          instances: state.instances.filter((i) => i.clipId !== clipId),
        }));
      },
    }),
    {
      name: "podcastomatic-publish",
      version: 1,
      partialize: (state) => ({
        // Persist instances but reset in-progress states
        instances: state.instances.map((i) => ({
          ...i,
          statusData:
            i.statusData.status === "completed" ? i.statusData : { status: "idle" as const },
        })),
      }),
    }
  )
);
