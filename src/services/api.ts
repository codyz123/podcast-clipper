import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";

class ApiClient {
  private getBaseUrl(): string {
    return useSettingsStore.getState().settings.backendUrl || "http://localhost:3002";
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { accessToken, refreshAccessToken, logout } = useAuthStore.getState();

    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    let response = await fetch(`${this.getBaseUrl()}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle token expiration
    if (response.status === 401 && accessToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry with new token
        const newToken = useAuthStore.getState().accessToken;
        headers.set("Authorization", `Bearer ${newToken}`);
        response = await fetch(`${this.getBaseUrl()}${endpoint}`, {
          ...options,
          headers,
        });
      } else {
        logout();
        throw new Error("Session expired");
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const api = new ApiClient();
