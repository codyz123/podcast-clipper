import { useState, useCallback, useRef } from "react";
import { getApiBase } from "../lib/api";
import { useAuthStore } from "../stores/authStore";

export interface UploadProgress {
  status:
    | "idle"
    | "checking"
    | "initializing"
    | "uploading"
    | "completing"
    | "complete"
    | "error"
    | "cancelled";
  uploadedBytes: number;
  totalBytes: number;
  completedParts: number;
  totalParts: number;
  percentage: number;
  speed: number; // bytes/sec
  eta: number; // seconds remaining
  error?: string;
}

interface UploadSession {
  sessionId: string;
  chunkSize: number;
  totalParts: number;
}

interface ResumableSession {
  hasResumable: boolean;
  sessionId?: string;
  filename?: string;
  totalBytes?: number;
  uploadedBytes?: number;
  completedParts?: number;
  totalParts?: number;
  chunkSize?: number;
  progress?: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const initialProgress: UploadProgress = {
  status: "idle",
  uploadedBytes: 0,
  totalBytes: 0,
  completedParts: 0,
  totalParts: 0,
  percentage: 0,
  speed: 0,
  eta: 0,
};

export function useChunkedUpload(podcastId: string | null, episodeId: string | null) {
  const [progress, setProgress] = useState<UploadProgress>(initialProgress);
  const abortRef = useRef(false);
  const sessionRef = useRef<UploadSession | null>(null);

  const reset = useCallback(() => {
    abortRef.current = false;
    sessionRef.current = null;
    setProgress(initialProgress);
  }, []);

  const checkResumable = useCallback(async (): Promise<ResumableSession | null> => {
    if (!podcastId || !episodeId) return null;

    const baseUrl = `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/uploads`;
    const { accessToken } = useAuthStore.getState();

    try {
      const res = await fetch(`${baseUrl}/resume`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.hasResumable ? data : null;
    } catch {
      return null;
    }
  }, [podcastId, episodeId]);

  const upload = useCallback(
    async (file: File): Promise<{ url: string; size: number } | null> => {
      if (!podcastId || !episodeId) {
        setProgress((p) => ({
          ...p,
          status: "error",
          error: "Missing podcast or episode ID",
        }));
        return null;
      }

      abortRef.current = false;

      const baseUrl = `${getApiBase()}/api/podcasts/${podcastId}/episodes/${episodeId}/uploads`;
      const { accessToken } = useAuthStore.getState();
      const headers = { Authorization: `Bearer ${accessToken}` };

      try {
        // 1. Check for resumable session
        setProgress({
          ...initialProgress,
          status: "checking",
          totalBytes: file.size,
        });

        const resumable = await checkResumable();
        let session: UploadSession;
        let startPart = 1;
        let uploadedBytes = 0;

        if (
          resumable &&
          resumable.filename === file.name &&
          resumable.totalBytes === file.size &&
          resumable.sessionId &&
          resumable.chunkSize &&
          resumable.totalParts
        ) {
          // Resume existing upload
          session = {
            sessionId: resumable.sessionId,
            chunkSize: resumable.chunkSize,
            totalParts: resumable.totalParts,
          };
          startPart = (resumable.completedParts || 0) + 1;
          uploadedBytes = resumable.uploadedBytes || 0;

          setProgress({
            status: "uploading",
            uploadedBytes,
            totalBytes: file.size,
            completedParts: resumable.completedParts || 0,
            totalParts: session.totalParts,
            percentage: resumable.progress || 0,
            speed: 0,
            eta: 0,
          });
        } else {
          // Initialize new upload session
          setProgress({
            ...initialProgress,
            status: "initializing",
            totalBytes: file.size,
          });

          const initRes = await fetch(`${baseUrl}/init`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              totalBytes: file.size,
            }),
          });

          if (!initRes.ok) {
            const err = await initRes.json();
            throw new Error(err.error || "Failed to init upload");
          }

          session = await initRes.json();
          startPart = 1;
        }

        sessionRef.current = session;

        // 2. Upload chunks sequentially
        const startTime = Date.now();
        const bytesAtStart = uploadedBytes;

        for (let partNumber = startPart; partNumber <= session.totalParts; partNumber++) {
          if (abortRef.current) {
            setProgress((p) => ({ ...p, status: "cancelled" }));
            return null;
          }

          const start = (partNumber - 1) * session.chunkSize;
          const end = Math.min(start + session.chunkSize, file.size);
          const chunk = file.slice(start, end);

          // Retry logic for each chunk
          let lastError: Error | null = null;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (abortRef.current) break;

            try {
              const partRes = await fetch(`${baseUrl}/${session.sessionId}/part/${partNumber}`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/octet-stream" },
                body: chunk,
              });

              if (!partRes.ok) {
                const err = await partRes.json();
                throw new Error(err.error || `Part ${partNumber} failed`);
              }

              const result = await partRes.json();
              if (!result.skipped) {
                uploadedBytes += chunk.size;
              }
              lastError = null;
              break;
            } catch (err) {
              lastError = err as Error;
              if (attempt < MAX_RETRIES - 1) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt)));
              }
            }
          }

          if (lastError) throw lastError;

          // Update progress
          const elapsed = (Date.now() - startTime) / 1000;
          const bytesUploaded = uploadedBytes - bytesAtStart;
          const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
          const remaining = file.size - uploadedBytes;
          const eta = speed > 0 ? remaining / speed : 0;

          setProgress({
            status: "uploading",
            uploadedBytes,
            totalBytes: file.size,
            completedParts: partNumber,
            totalParts: session.totalParts,
            percentage: Math.round((partNumber / session.totalParts) * 100),
            speed,
            eta,
          });
        }

        if (abortRef.current) {
          setProgress((p) => ({ ...p, status: "cancelled" }));
          return null;
        }

        // 3. Complete upload
        setProgress((p) => ({ ...p, status: "completing", percentage: 99 }));

        const completeRes = await fetch(`${baseUrl}/${session.sessionId}/complete`, {
          method: "POST",
          headers,
        });

        if (!completeRes.ok) {
          const err = await completeRes.json();
          throw new Error(err.error || "Failed to complete");
        }

        const result = await completeRes.json();

        setProgress((p) => ({
          ...p,
          status: "complete",
          percentage: 100,
          uploadedBytes: file.size,
        }));

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setProgress((p) => ({
          ...p,
          status: "error",
          error: message,
        }));
        return null;
      }
    },
    [podcastId, episodeId, checkResumable]
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    upload,
    cancel,
    reset,
    checkResumable,
    progress,
    isUploading:
      progress.status === "uploading" ||
      progress.status === "initializing" ||
      progress.status === "checking" ||
      progress.status === "completing",
    isComplete: progress.status === "complete",
    hasError: progress.status === "error",
  };
}
