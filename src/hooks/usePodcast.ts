import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { PodcastDetails } from "../lib/authTypes";

function getApiBase(): string {
  return useSettingsStore.getState().settings.backendUrl || "http://localhost:3001";
}

// Helper to make authenticated requests with automatic token refresh
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
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
      logout();
    }
  }

  return res;
}

export function usePodcast() {
  const { currentPodcastId, setPodcasts } = useAuthStore();
  const [podcast, setPodcast] = useState<PodcastDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPodcast = useCallback(async () => {
    if (!currentPodcastId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch podcast");
      }

      const data = await res.json();
      setPodcast({
        ...data.podcast,
        members: data.members,
        pendingInvitations: data.pendingInvitations,
        currentUserRole: data.currentUserRole,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch podcast");
    } finally {
      setIsLoading(false);
    }
  }, [currentPodcastId]);

  useEffect(() => {
    fetchPodcast();
  }, [fetchPodcast]);

  const inviteMember = async (email: string): Promise<{ status: "added" | "invited" }> => {
    if (!currentPodcastId) {
      throw new Error("No podcast selected");
    }

    const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to invite user");
    }

    const data = await res.json();
    await fetchPodcast(); // Refresh the podcast data
    return data;
  };

  const removeMember = async (userId: string): Promise<void> => {
    if (!currentPodcastId) {
      throw new Error("No podcast selected");
    }

    const res = await authFetch(
      `${getApiBase()}/api/podcasts/${currentPodcastId}/members/${userId}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to remove member");
    }

    await fetchPodcast(); // Refresh the podcast data
  };

  const cancelInvitation = async (invitationId: string): Promise<void> => {
    if (!currentPodcastId) {
      throw new Error("No podcast selected");
    }

    const url = `${getApiBase()}/api/podcasts/${currentPodcastId}/invitations/${invitationId}`;
    const res = await authFetch(url, { method: "DELETE" });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to cancel invitation");
    }

    await fetchPodcast(); // Refresh the podcast data
  };

  const createPodcast = async (name: string, description?: string): Promise<void> => {
    const res = await authFetch(`${getApiBase()}/api/podcasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to create podcast");
    }

    // Refresh podcasts list
    const podcastsRes = await authFetch(`${getApiBase()}/api/podcasts`);
    const { podcasts } = await podcastsRes.json();
    setPodcasts(podcasts);
  };

  return {
    podcast,
    isLoading,
    error,
    refetch: fetchPodcast,
    inviteMember,
    removeMember,
    cancelInvitation,
    createPodcast,
    isOwner: podcast?.currentUserRole === "owner",
  };
}
