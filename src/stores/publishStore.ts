import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VideoFormat } from "../lib/types";
import {
  PLATFORM_CONFIGS,
  type PublishDestinationType,
  type Post,
  type PostStatus,
  isPostInProgress,
  isPostQueued,
  isValidPostTransition,
  canRetryPost,
} from "../lib/publish";
import { generateId } from "../lib/utils";

// ============ Store Interface ============

interface PostPublishState {
  // Persisted state (only posts are saved to localStorage)
  posts: Post[];

  // Derived/runtime state (NOT persisted)
  isPublishing: boolean;

  // CRUD operations
  createPost: (destination: PublishDestinationType) => Post;
  removePost: (postId: string) => void;
  duplicatePost: (postId: string) => Post | null;

  // Content setters
  setPostClip: (postId: string, clipId: string | undefined) => void;
  setPostText: (postId: string, text: string, fromSnippetId?: string) => void;
  setPostTitle: (postId: string, title: string) => void;
  setPostDescription: (postId: string, description: string, fromSnippetId?: string) => void;
  setPostFormat: (postId: string, format: VideoFormat) => void;
  setPostRenderScale: (postId: string, renderScale: number) => void;
  setPostHashtags: (postId: string, hashtags: string[]) => void;
  togglePost: (postId: string) => void;

  // Status updates with transition validation
  updatePostStatus: (postId: string, statusData: PostStatus) => boolean;

  // Batch operations
  enableAll: () => void;
  disableAll: () => void;
  removeCompleted: () => void;

  // Publishing workflow - queue derived from status, not stored
  startPublishing: () => void;
  cancelPublishing: () => void;
  retryPost: (postId: string) => void;
  retryAllFailed: () => void;
  resetStuckPosts: () => void;
  markPostComplete: (postId: string, outputPath?: string, uploadedUrl?: string) => void;
  markPostFailed: (postId: string, error: string) => void;

  // Selectors (derive queue from status)
  getEnabledPosts: () => Post[];
  getQueuedPosts: () => Post[];
  getNextInQueue: () => Post | null;
  getFailedPosts: () => Post[];
  getInProgressPost: () => Post | null;
  getOverallProgress: () => {
    completed: number;
    total: number;
    failed: number;
    inProgress: number;
    queued: number;
    percent: number;
  };
  getPost: (postId: string) => Post | undefined;

  // Reset
  resetPublishState: () => void;
}

// ============ Initial State ============

const INITIAL_STATE = {
  posts: [] as Post[],
  isPublishing: false,
};

// ============ Store Implementation ============

export const usePublishStore = create<PostPublishState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // ============ CRUD Operations ============

      createPost: (destination) => {
        const config = PLATFORM_CONFIGS[destination];
        const post: Post = {
          id: generateId(),
          destination,
          format: config.defaultFormat,
          renderScale: 1,
          hashtags: [],
          statusData: { status: "idle" },
          enabled: true,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          posts: [...state.posts, post],
        }));

        return post;
      },

      removePost: (postId) => {
        set((state) => ({
          posts: state.posts.filter((p) => p.id !== postId),
        }));
      },

      duplicatePost: (postId) => {
        const original = get().posts.find((p) => p.id === postId);
        if (!original) return null;

        const duplicate: Post = {
          ...original,
          id: generateId(),
          createdAt: new Date().toISOString(),
          statusData: { status: "idle" },
        };

        set((state) => ({
          posts: [...state.posts, duplicate],
        }));

        return duplicate;
      },

      // ============ Content Setters ============

      setPostClip: (postId, clipId) => {
        set((state) => ({
          posts: state.posts.map((p) => {
            if (p.id !== postId) return p;
            // When setting a clip, also set the default format for the destination
            const config = PLATFORM_CONFIGS[p.destination];
            return {
              ...p,
              clipId,
              format: clipId ? p.format || config.defaultFormat : undefined,
            };
          }),
        }));
      },

      setPostText: (postId, text, fromSnippetId) => {
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  textContent: text,
                  // If text differs from snippet, clear the attribution (set to null)
                  // If fromSnippetId is explicitly provided, use it
                  sourceSnippetId: fromSnippetId !== undefined ? fromSnippetId : p.sourceSnippetId,
                }
              : p
          ),
        }));
      },

      setPostTitle: (postId, title) => {
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, title } : p)),
        }));
      },

      setPostDescription: (postId, description, fromSnippetId) => {
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  description,
                  sourceSnippetId: fromSnippetId !== undefined ? fromSnippetId : p.sourceSnippetId,
                }
              : p
          ),
        }));
      },

      setPostFormat: (postId, format) => {
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, format } : p)),
        }));
      },

      setPostRenderScale: (postId, renderScale) => {
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, renderScale } : p)),
        }));
      },

      setPostHashtags: (postId, hashtags) => {
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, hashtags } : p)),
        }));
      },

      togglePost: (postId) => {
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, enabled: !p.enabled } : p)),
        }));
      },

      // ============ Status Updates with Transition Validation ============

      updatePostStatus: (postId, newStatusData) => {
        const post = get().posts.find((p) => p.id === postId);
        if (!post) return false;

        // Enforce valid state transitions
        if (!isValidPostTransition(post.statusData.status, newStatusData.status)) {
          console.warn(
            `[PublishStore] Invalid transition: ${post.statusData.status} → ${newStatusData.status}`
          );
          return false;
        }

        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId ? { ...p, statusData: newStatusData } : p
          ),
        }));
        return true;
      },

      // ============ Batch Operations ============

      enableAll: () => {
        set((state) => ({
          posts: state.posts.map((p) => ({ ...p, enabled: true })),
        }));
      },

      disableAll: () => {
        set((state) => ({
          posts: state.posts.map((p) => ({ ...p, enabled: false })),
        }));
      },

      removeCompleted: () => {
        set((state) => ({
          posts: state.posts.filter((p) => p.statusData.status !== "completed"),
        }));
      },

      // ============ Publishing Workflow ============

      startPublishing: () => {
        set((state) => {
          const shouldResetInProgress = !state.isPublishing;
          const posts = state.posts.map((p) => {
            if (!p.enabled) return p;
            if (
              (p.statusData.status === "rendering" || p.statusData.status === "uploading") &&
              !shouldResetInProgress
            ) {
              return p;
            }
            return { ...p, statusData: { status: "queued" as const } };
          });

          const queuedCount = posts.filter((p) => p.statusData.status === "queued").length;

          return {
            isPublishing: queuedCount > 0,
            posts,
          };
        });
      },

      cancelPublishing: () => {
        set((state) => ({
          isPublishing: false,
          posts: state.posts.map((p) => {
            // Reset queued posts back to idle
            if (p.statusData.status === "queued") {
              return { ...p, statusData: { status: "idle" as const } };
            }
            return p;
          }),
        }));
      },

      retryPost: (postId) => {
        const post = get().posts.find((p) => p.id === postId);
        if (!post || !canRetryPost(post)) return;

        // Use updatePostStatus to enforce transition rules
        get().updatePostStatus(postId, { status: "queued" });
      },

      retryAllFailed: () => {
        const failedPosts = get()
          .posts.filter((p) => canRetryPost(p))
          .map((p) => p.id);

        // Retry each failed post
        failedPosts.forEach((postId) => {
          get().updatePostStatus(postId, { status: "queued" });
        });
      },

      resetStuckPosts: () => {
        set((state) => ({
          isPublishing: false,
          posts: state.posts.map((p) => {
            if (
              p.statusData.status === "queued" ||
              p.statusData.status === "rendering" ||
              p.statusData.status === "uploading"
            ) {
              return { ...p, statusData: { status: "idle" as const } };
            }
            return p;
          }),
        }));
      },

      markPostComplete: (postId, outputPath, uploadedUrl) => {
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  statusData: {
                    status: "completed" as const,
                    outputPath,
                    uploadedUrl,
                    completedAt: new Date().toISOString(),
                  },
                }
              : p
          ),
        }));

        // Check if we're done publishing
        const remaining = get().getQueuedPosts();
        const inProgress = get().getInProgressPost();
        if (remaining.length === 0 && !inProgress) {
          set({ isPublishing: false });
        }
      },

      markPostFailed: (postId, error) => {
        const post = get().posts.find((p) => p.id === postId);
        if (!post) return;

        // Get current retry count (0 if not failed before)
        const currentRetryCount =
          post.statusData.status === "failed" ? post.statusData.retryCount : 0;

        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  statusData: {
                    status: "failed" as const,
                    error,
                    failedAt: new Date().toISOString(),
                    retryCount: currentRetryCount + 1,
                  },
                }
              : p
          ),
        }));

        // Check if we're done publishing
        const remaining = get().getQueuedPosts();
        const inProgress = get().getInProgressPost();
        if (remaining.length === 0 && !inProgress) {
          set({ isPublishing: false });
        }
      },

      // ============ Selectors (Derived from Status) ============

      getEnabledPosts: () => {
        return get().posts.filter((p) => p.enabled);
      },

      // Queue derived from status, ordered by createdAt (FIFO)
      getQueuedPosts: () => {
        return get()
          .posts.filter((p) => p.statusData.status === "queued")
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      },

      getNextInQueue: () => {
        return get().getQueuedPosts()[0] ?? null;
      },

      getFailedPosts: () => {
        return get().posts.filter((p) => p.statusData.status === "failed");
      },

      getInProgressPost: () => {
        return (
          get().posts.find(
            (p) => p.statusData.status === "rendering" || p.statusData.status === "uploading"
          ) ?? null
        );
      },

      getOverallProgress: () => {
        const enabledPosts = get().posts.filter((p) => p.enabled);
        const completed = enabledPosts.filter((p) => p.statusData.status === "completed").length;
        const failed = enabledPosts.filter((p) => p.statusData.status === "failed").length;
        const inProgress = enabledPosts.filter(
          (p) => p.statusData.status === "rendering" || p.statusData.status === "uploading"
        ).length;
        const queued = enabledPosts.filter((p) => p.statusData.status === "queued").length;

        const progressSum = enabledPosts.reduce((sum, post) => {
          switch (post.statusData.status) {
            case "completed":
            case "failed":
              return sum + 100;
            case "rendering":
            case "uploading":
              return sum + Math.max(0, Math.min(100, post.statusData.progress));
            default:
              return sum;
          }
        }, 0);

        const percent =
          enabledPosts.length === 0 ? 0 : Math.round(progressSum / enabledPosts.length);

        return {
          completed,
          total: enabledPosts.length,
          failed,
          inProgress,
          queued,
          percent,
        };
      },

      getPost: (postId) => {
        return get().posts.find((p) => p.id === postId);
      },

      // ============ Reset ============

      resetPublishState: () => {
        set(INITIAL_STATE);
      },
    }),
    {
      name: "podcastomatic-publish",
      version: 3,

      // Only persist posts array - derive runtime state on load
      partialize: (state) => ({ posts: state.posts }),

      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          // Old clip-centric state structure is incompatible
          // User content (clips, snippets) is in database - this is just export queue
          console.log("[PublishStore] Migrating to v2 - resetting export queue");
          return { posts: [] };
        }
        if (version < 3) {
          const state = persistedState as { posts?: Post[] };
          if (!state?.posts) return persistedState;
          return {
            ...state,
            posts: state.posts.map((post) => {
              if (
                (post.destination === "youtube-shorts" || post.destination === "youtube-video") &&
                post.textContent &&
                (!post.title || !post.description)
              ) {
                const firstLine = post.textContent.split("\n")[0]?.trim();
                return {
                  ...post,
                  title: post.title || firstLine || post.title,
                  description: post.description || post.textContent,
                };
              }
              return post;
            }),
          };
        }
        return persistedState;
      },

      // Clean up any stale in-progress states on load (immutable approach)
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;

        // Use setState for proper immutable update, not direct mutation
        usePublishStore.setState({
          posts: state.posts.map((p) => {
            // Reset any stuck in-progress or queued posts to idle
            if (isPostInProgress(p) || isPostQueued(p)) {
              return { ...p, statusData: { status: "idle" as const } };
            }
            return p;
          }),
          isPublishing: false,
        });
      },
    }
  )
);
