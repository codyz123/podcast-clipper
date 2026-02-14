import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import type { PodcastDetails } from "../lib/authTypes";
import { getApiBase, authFetch } from "../lib/api";

export function usePodcast() {
  const { currentPodcastId, setPodcasts } = useAuthStore();
  const [podcast, setPodcast] = useState<PodcastDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPodcast = useCallback(async () => {
    if (!currentPodcastId) return;

    setPodcast(null);
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

  const inviteMember = async (
    email: string
  ): Promise<{
    status: "added" | "invited";
    emailSent?: boolean;
    emailError?: string;
    emailErrorCode?: "NOT_CONFIGURED" | "TESTING_DOMAIN" | "API_ERROR" | "UNKNOWN";
    invitationUrl?: string;
    message?: string;
  }> => {
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

  const resendInvitation = async (
    invitationId: string
  ): Promise<{
    success: boolean;
    emailSent?: boolean;
    emailError?: string;
    errorCode?: "NOT_CONFIGURED" | "TESTING_DOMAIN" | "API_ERROR" | "UNKNOWN";
    invitationUrl?: string;
    message?: string;
  }> => {
    if (!currentPodcastId) {
      throw new Error("No podcast selected");
    }

    const url = `${getApiBase()}/api/podcasts/${currentPodcastId}/invitations/${invitationId}/resend`;
    const res = await authFetch(url, { method: "POST" });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to resend invitation");
    }

    return await res.json();
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

  const updatePodcast = async (updates: {
    name?: string;
    description?: string;
    coverImageUrl?: string;
    podcastMetadata?: {
      author?: string;
      category?: string;
      language?: string;
      explicit?: boolean;
      email?: string;
      website?: string;
    };
    brandColors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
  }): Promise<void> => {
    if (!currentPodcastId) throw new Error("No podcast selected");

    const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update podcast");
    }

    await fetchPodcast();
  };

  const deletePodcast = async (): Promise<void> => {
    if (!currentPodcastId) throw new Error("No podcast selected");

    const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete podcast");
    }

    // Refresh podcasts list
    const podcastsRes = await authFetch(`${getApiBase()}/api/podcasts`);
    const { podcasts } = await podcastsRes.json();
    setPodcasts(podcasts);

    // If podcasts remain, select the first one
    // If none remain, App.tsx will automatically show CreatePodcastScreen
    if (podcasts.length > 0) {
      const { setCurrentPodcast } = useAuthStore.getState();
      setCurrentPodcast(podcasts[0].id);
    }
  };

  const transferOwnership = async (newOwnerId: string): Promise<void> => {
    if (!currentPodcastId) throw new Error("No podcast selected");

    const res = await authFetch(
      `${getApiBase()}/api/podcasts/${currentPodcastId}/transfer-ownership`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId }),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to transfer ownership");
    }

    await fetchPodcast();
  };

  return {
    podcast,
    isLoading,
    error,
    refetch: fetchPodcast,
    inviteMember,
    removeMember,
    cancelInvitation,
    resendInvitation,
    createPodcast,
    updatePodcast,
    deletePodcast,
    transferOwnership,
    isOwner: podcast?.currentUserRole === "owner",
  };
}
