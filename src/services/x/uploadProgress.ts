import { authFetch, getApiBase, parseApiError } from "../../lib/api";
import { useSettingsStore } from "../../stores/settingsStore";

export interface XUploadStatus {
  status: "pending" | "uploading" | "processing" | "posting" | "completed" | "failed";
  uploadProgress: number;
  processingProgress: number;
  tweetId?: string;
  tweetUrl?: string;
  errorMessage?: string;
}

export interface InitializeXUploadRequest {
  postId: string;
  clipId: string;
  text?: string;
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

export async function initializeXUpload(
  payload: InitializeXUploadRequest
): Promise<{ uploadId: string; status: string }> {
  const res = await authFetch(`${getApiBase()}/api/x/upload/init`, {
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

export async function getXUploadStatus(uploadId: string): Promise<XUploadStatus> {
  const res = await authFetch(`${getApiBase()}/api/x/upload/${uploadId}/status`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}

export async function pollXUploadProgress(
  uploadId: string,
  onProgress: (status: XUploadStatus) => void
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getXUploadStatus(uploadId);
        onProgress(status);

        if (status.status === "completed") {
          resolve(status.tweetUrl);
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
