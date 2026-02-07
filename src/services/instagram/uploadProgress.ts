import { authFetch, getApiBase, parseApiError } from "../../lib/api";
import { useSettingsStore } from "../../stores/settingsStore";

export interface InstagramUploadStatus {
  status: "pending" | "processing" | "publishing" | "completed" | "failed";
  uploadProgress: number;
  processingProgress: number;
  mediaId?: string;
  errorMessage?: string;
}

export interface InitializeInstagramUploadRequest {
  postId: string;
  clipId: string;
  caption?: string;
  format?: string;
  mediaType?: "REELS" | "VIDEO";
  shareToFeed?: boolean;
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

export async function initializeInstagramUpload(
  payload: InitializeInstagramUploadRequest
): Promise<{ uploadId: string; status: string }> {
  const res = await authFetch(`${getApiBase()}/api/instagram/upload/init`, {
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

export async function getInstagramUploadStatus(uploadId: string): Promise<InstagramUploadStatus> {
  const res = await authFetch(`${getApiBase()}/api/instagram/upload/${uploadId}/status`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}

export async function pollInstagramUploadProgress(
  uploadId: string,
  onProgress: (status: InstagramUploadStatus) => void
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getInstagramUploadStatus(uploadId);
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
