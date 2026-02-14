/**
 * Centralized API utilities with authentication and error handling
 */
import { useSettingsStore } from "../stores/settingsStore";
import { useAuthStore } from "../stores/authStore";

/**
 * Get the API base URL from settings
 */
export function getApiBase(): string {
  return useSettingsStore.getState().settings.backendUrl || "http://localhost:3002";
}

/**
 * Make an authenticated fetch request with automatic token refresh
 * This is a standalone function that can be used outside of React hooks
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken, refreshAccessToken, logout } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(url, { ...options, headers });

  // If 401, try to refresh token and retry
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = useAuthStore.getState().accessToken;
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(url, { ...options, headers });
    } else {
      // Token refresh failed, log the user out
      logout();
    }
  }

  return res;
}

/**
 * Convert a media URL to go through our server proxy.
 * Handles direct R2 URLs (existing data) by routing them through /api/media/.
 * In development, returns R2 public URLs directly (no proxy needed for media tags).
 */
export function getMediaUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const apiBase = getApiBase();
  // Rewrite absolute localhost media URLs to use the current backend
  // (handles stale URLs stored with old ports like localhost:3001)
  const localMediaIdx = url.indexOf("/api/local-media/");
  if (localMediaIdx !== -1) {
    return `${apiBase}${url.slice(localMediaIdx)}`;
  }
  const mediaIdx = url.indexOf("/api/media/");
  if (mediaIdx !== -1) {
    return `${apiBase}${url.slice(mediaIdx)}`;
  }
  // In dev, use R2 public URLs directly — avoids needing R2 credentials locally
  if (import.meta.env.DEV) return url;
  // Production: proxy through our server to avoid CORS issues
  try {
    const parsed = new URL(url);
    const key = parsed.pathname.slice(1); // Remove leading "/"
    if (key) return `${apiBase}/api/media/${key}`;
  } catch {
    // Not a valid URL, return as-is
  }
  return url;
}

/**
 * Standard API error type
 */
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Extract error message from a failed response
 */
export async function parseApiError(res: Response): Promise<ApiError> {
  try {
    const data = await res.json();
    return {
      message: data.error || data.message || `Request failed with status ${res.status}`,
      status: res.status,
      code: data.code,
    };
  } catch {
    return {
      message: `Request failed with status ${res.status}`,
      status: res.status,
    };
  }
}

/**
 * Helper to make API calls with error parsing
 * Throws ApiError on failure
 */
export async function apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await authFetch(url, options);

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}
