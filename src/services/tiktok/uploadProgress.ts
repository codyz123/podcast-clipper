import { authFetch, getApiBase, parseApiError } from "../../lib/api";
import { useSettingsStore } from "../../stores/settingsStore";

export interface TikTokUploadStatus {
  status: "pending" | "processing" | "completed" | "failed";
  uploadProgress: number;
  processingProgress: number;
  videoId?: string;
  errorMessage?: string;
}

export interface InitializeTikTokUploadRequest {
  postId: string;
  clipId: string;
  caption?: string;
  format?: string;
}

function getAuthHeaders(): HeadersInit {
  const accessCode = useSettingsStore.getState().settings.accessCode;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessCode) {
    headers["x-access-code"] = accessCode;
  }
  return headers;
}

export async function initializeTikTokUpload(
  payload: InitializeTikTokUploadRequest
): Promise<{ uploadId: string; status: string }> {
  const res = await authFetch(`${getApiBase()}/api/tiktok/upload/init`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}

export async function getTikTokUploadStatus(uploadId: string): Promise<TikTokUploadStatus> {
  const res = await authFetch(`${getApiBase()}/api/tiktok/upload/${uploadId}/status`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}

export async function pollTikTokUploadProgress(
  uploadId: string,
  onProgress: (status: TikTokUploadStatus) => void
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getTikTokUploadStatus(uploadId);
        onProgress(status);

        if (status.status === "completed") {
          resolve(undefined);
          return;
        }

        if (status.status === "failed") {
          reject(new Error(status.errorMessage || "Upload failed"));
          return;
        }

        setTimeout(poll, 2000);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}
