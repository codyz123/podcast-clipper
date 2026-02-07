import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type StoreModule = typeof import("../../../src/stores/publishStore.js");

const createLocalStorage = () => {
  let data: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    clear: () => {
      data = {};
    },
  };
};

describe("publishStore", () => {
  let storeModule: StoreModule;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createLocalStorage());
    storeModule = await import("../../../src/stores/publishStore.js");
    storeModule.usePublishStore.getState().resetPublishState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues failed posts when publishing starts", () => {
    const { createPost, markPostFailed, startPublishing, getPost } =
      storeModule.usePublishStore.getState();

    const post = createPost("youtube-shorts");
    markPostFailed(post.id, "boom");

    startPublishing();

    const updated = getPost(post.id);
    expect(updated?.statusData.status).toBe("queued");
    expect(storeModule.usePublishStore.getState().isPublishing).toBe(true);
  });

  it("queues completed posts when publishing starts", () => {
    const { createPost, markPostComplete, startPublishing, getPost } =
      storeModule.usePublishStore.getState();

    const post = createPost("youtube-shorts");
    markPostComplete(post.id, "local.mp4", "https://youtube.com/watch?v=123");

    startPublishing();

    const updated = getPost(post.id);
    expect(updated?.statusData.status).toBe("queued");
  });

  it("does not enter publishing when no enabled posts are queued", () => {
    const { createPost, togglePost, startPublishing } = storeModule.usePublishStore.getState();

    const post = createPost("youtube-shorts");
    togglePost(post.id); // disable

    startPublishing();

    expect(storeModule.usePublishStore.getState().isPublishing).toBe(false);
  });

  it("re-queues in-progress posts when publishing is restarted", () => {
    const { createPost, updatePostStatus, startPublishing, getPost } =
      storeModule.usePublishStore.getState();

    const post = createPost("youtube-shorts");
    updatePostStatus(post.id, { status: "queued" });
    updatePostStatus(post.id, { status: "rendering", progress: 20, stage: "encoding" });

    startPublishing();

    const updated = getPost(post.id);
    expect(updated?.statusData.status).toBe("queued");
  });

  it("resets stuck posts to idle", () => {
    const { createPost, updatePostStatus, resetStuckPosts, getPost } =
      storeModule.usePublishStore.getState();

    const post = createPost("youtube-shorts");
    updatePostStatus(post.id, { status: "queued" });
    updatePostStatus(post.id, { status: "rendering", progress: 20, stage: "encoding" });

    resetStuckPosts();

    const updated = getPost(post.id);
    expect(updated?.statusData.status).toBe("idle");
  });

  it("computes overall progress using live post progress", () => {
    const { createPost, markPostComplete, markPostFailed, updatePostStatus, getOverallProgress } =
      storeModule.usePublishStore.getState();

    const completed = createPost("youtube-shorts");
    const failed = createPost("youtube-shorts");
    const inFlight = createPost("youtube-shorts");

    markPostComplete(completed.id, "local.mp4", "https://youtube.com/watch?v=123");
    markPostFailed(failed.id, "boom");

    updatePostStatus(inFlight.id, { status: "queued" });
    updatePostStatus(inFlight.id, { status: "rendering", progress: 10, stage: "encoding" });
    updatePostStatus(inFlight.id, { status: "uploading", progress: 40, stage: "uploading" });

    const progress = getOverallProgress();

    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.inProgress).toBe(1);
    expect(progress.percent).toBe(80);
  });
});
