import { authFetch, getApiBase, parseApiError } from "../../lib/api";
import { useSettingsStore } from "../../stores/settingsStore";

export interface UploadStatus {
  status: "pending" | "uploading" | "processing" | "completed" | "failed";
  uploadProgress: number;
  processingProgress: number;
  videoId?: string;
  videoUrl?: string;
  errorMessage?: string;
}

export interface InitializeYouTubeUploadRequest {
  postId: string;
  clipId: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
  categoryId?: string;
  isShort?: boolean;
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

export async function initializeYouTubeUpload(
  payload: InitializeYouTubeUploadRequest
): Promise<{ uploadId: string; status: string }> {
  const res = await authFetch(`${getApiBase()}/api/youtube/upload/init`, {
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

export async function getUploadStatus(uploadId: string): Promise<UploadStatus> {
  const res = await authFetch(`${getApiBase()}/api/youtube/upload/${uploadId}/status`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}

export async function pollUploadProgress(
  uploadId: string,
  onProgress: (status: UploadStatus) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getUploadStatus(uploadId);
        onProgress(status);

        if (status.status === "completed" && status.videoUrl) {
          resolve(status.videoUrl);
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
