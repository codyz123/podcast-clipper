import { useState, useCallback, useRef } from "react";
import { getApiBase } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { createVideoSourceApi, processVideoSourceApi } from "../lib/queries";

// SHA-256 of file size (8 bytes LE) + first 2MB of content
const FINGERPRINT_BYTES = 2 * 1024 * 1024;

export async function computeFileFingerprint(file: File): Promise<string> {
  const sizeBuffer = new ArrayBuffer(8);
  const sizeView = new DataView(sizeBuffer);
  // Store as two 32-bit values (DataView doesn't have setBigUint64 in all browsers)
  sizeView.setUint32(0, file.size & 0xffffffff, true);
  sizeView.setUint32(4, Math.floor(file.size / 0x100000000), true);

  const slice = file.slice(0, FINGERPRINT_BYTES);
  const sliceBuffer = await slice.arrayBuffer();

  // Concatenate size + content prefix
  const combined = new Uint8Array(8 + sliceBuffer.byteLength);
  combined.set(new Uint8Array(sizeBuffer), 0);
  combined.set(new Uint8Array(sliceBuffer), 8);

  const hash = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface VideoFileUpload {
  file: File;
  id: string; // client-side ID for tracking
  fingerprint: string;
  status: "pending" | "uploading" | "creating" | "processing" | "complete" | "error";
  progress: number; // 0-100
  error?: string;
  videoSourceId?: string; // server-assigned ID after creation
  blobUrl?: string;
}

export interface MultiVideoUploadState {
  files: VideoFileUpload[];
  isUploading: boolean;
  activeUploads: number;
}

const MAX_CONCURRENT = 2;

export function useMultiVideoUpload(podcastId: string | null, episodeId: string | null) {
  const [state, setState] = useState<MultiVideoUploadState>({
    files: [],
    isUploading: false,
    activeUploads: 0,
  });
  const abortRef = useRef(false);
  const queueRef = useRef<VideoFileUpload[]>([]);
  const workersRunningRef = useRef(0);

  const updateFile = useCallback((id: string, updates: Partial<VideoFileUpload>) => {
    setState((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }));
  }, []);

  const uploadSingleFile = useCallback(
    async (fileUpload: VideoFileUpload): Promise<void> => {
      if (!podcastId || !episodeId) return;

      const { file, id, fingerprint } = fileUpload;
      const baseUrl = `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/uploads`;
      const { accessToken } = useAuthStore.getState();
      const headers = { Authorization: `Bearer ${accessToken}` };

      try {
        updateFile(id, { status: "uploading", progress: 0 });

        // Initialize upload session
        const initRes = await fetch(`${baseUrl}/init`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "video/mp4",
            totalBytes: file.size,
          }),
        });

        if (!initRes.ok) {
          const err = await initRes.json();
          throw new Error(err.error || "Failed to init upload");
        }

        const session = await initRes.json();
        const { sessionId, chunkSize, totalParts } = session;

        // Upload chunks
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          if (abortRef.current) {
            updateFile(id, { status: "error", error: "Cancelled" });
            return;
          }

          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = file.slice(start, end);

          const partRes = await fetch(`${baseUrl}/${sessionId}/part/${partNumber}`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/octet-stream" },
            body: chunk,
          });

          if (!partRes.ok) {
            const err = await partRes.json();
            throw new Error(err.error || `Part ${partNumber} failed`);
          }

          const pct = Math.round((partNumber / totalParts) * 80); // 0-80% for upload
          updateFile(id, { progress: pct });
        }

        // Complete upload
        const completeRes = await fetch(`${baseUrl}/${sessionId}/complete`, {
          method: "POST",
          headers,
        });

        if (!completeRes.ok) {
          const err = await completeRes.json();
          throw new Error(err.error || "Failed to complete upload");
        }

        const { url: blobUrl } = await completeRes.json();
        updateFile(id, { status: "creating", progress: 85, blobUrl });

        // Create video source record
        const videoSource = await createVideoSourceApi(podcastId, episodeId, {
          videoBlobUrl: blobUrl,
          fileName: file.name,
          label: file.name.replace(/\.[^.]+$/, ""),
          contentType: file.type || "video/mp4",
          sizeBytes: file.size,
          contentFingerprint: fingerprint,
        });

        updateFile(id, {
          status: "processing",
          progress: 90,
          videoSourceId: videoSource.id,
        });

        // Trigger background processing (proxy, audio extraction, metadata)
        await processVideoSourceApi(podcastId, episodeId, videoSource.id);

        updateFile(id, { status: "complete", progress: 100 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        updateFile(id, { status: "error", error: message });
      }
    },
    [podcastId, episodeId, updateFile]
  );

  // Worker that drains the shared queue
  const runWorker = useCallback(async () => {
    workersRunningRef.current++;
    setState((prev) => ({ ...prev, activeUploads: prev.activeUploads + 1 }));

    while (queueRef.current.length > 0 && !abortRef.current) {
      const next = queueRef.current.shift()!;
      await uploadSingleFile(next);
    }

    workersRunningRef.current--;
    setState((prev) => {
      const newActive = Math.max(0, prev.activeUploads - 1);
      return {
        ...prev,
        activeUploads: newActive,
        // Done when no workers are running and queue is empty
        isUploading: newActive > 0 || queueRef.current.length > 0,
      };
    });
  }, [uploadSingleFile]);

  const uploadAll = useCallback(
    async (files: File[]): Promise<void> => {
      if (!podcastId || !episodeId || files.length === 0) return;

      abortRef.current = false;

      // Compute fingerprints for all files
      const fingerprints = await Promise.all(files.map(computeFileFingerprint));

      // Initialize file tracking
      const fileUploads: VideoFileUpload[] = files.map((file, i) => ({
        file,
        id: `${Date.now()}-${i}`,
        fingerprint: fingerprints[i],
        status: "pending" as const,
        progress: 0,
      }));

      // Add to shared queue
      queueRef.current.push(...fileUploads);

      // Add to state
      setState((prev) => ({
        files: [...prev.files, ...fileUploads],
        isUploading: true,
        activeUploads: prev.activeUploads,
      }));

      // Spin up workers if needed (up to MAX_CONCURRENT)
      const workersToStart = Math.min(
        MAX_CONCURRENT - workersRunningRef.current,
        fileUploads.length
      );

      const workers: Promise<void>[] = [];
      for (let i = 0; i < workersToStart; i++) {
        workers.push(runWorker());
      }

      await Promise.all(workers);
    },
    [podcastId, episodeId, runWorker]
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    queueRef.current = [];
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
    queueRef.current = [];
    workersRunningRef.current = 0;
    setState({ files: [], isUploading: false, activeUploads: 0 });
  }, []);

  return {
    ...state,
    uploadAll,
    cancel,
    reset,
    completedCount: state.files.filter((f) => f.status === "complete").length,
    errorCount: state.files.filter((f) => f.status === "error").length,
    totalCount: state.files.length,
  };
}
