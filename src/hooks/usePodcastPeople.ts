import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import { getApiBase, authFetch } from "../lib/api";
import type { PodcastPerson } from "../lib/types";

export function usePodcastPeople() {
  const { currentPodcastId } = useAuthStore();
  const [people, setPeople] = useState<PodcastPerson[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPeople = useCallback(async () => {
    if (!currentPodcastId) {
      setPeople([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}/people`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch people");
      }

      const { people: peopleList } = await res.json();
      setPeople(peopleList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch people");
      setPeople([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPodcastId]);

  const createPerson = useCallback(
    async (data: { name: string; role: "host" | "guest" }): Promise<PodcastPerson | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(`${getApiBase()}/api/podcasts/${currentPodcastId}/people`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to create person");
        }

        const { person } = await res.json();
        setPeople((prev) => [...prev, person].sort((a, b) => a.name.localeCompare(b.name)));
        return person;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create person");
        return null;
      }
    },
    [currentPodcastId]
  );

  const updatePerson = useCallback(
    async (personId: string, updates: Partial<PodcastPerson>): Promise<PodcastPerson | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/people/${personId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to update person");
        }

        const { person } = await res.json();
        setPeople((prev) =>
          prev.map((p) => (p.id === personId ? person : p)).sort((a, b) => a.name.localeCompare(b.name))
        );
        return person;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update person");
        return null;
      }
    },
    [currentPodcastId]
  );

  const deletePerson = useCallback(
    async (personId: string): Promise<boolean> => {
      if (!currentPodcastId) return false;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/people/${personId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to delete person");
        }

        setPeople((prev) => prev.filter((p) => p.id !== personId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete person");
        return false;
      }
    },
    [currentPodcastId]
  );

  const uploadPhoto = useCallback(
    async (personId: string, file: File): Promise<string | null> => {
      if (!currentPodcastId) return null;

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/people/${personId}/photo`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to upload photo");
        }

        const { person, photoUrl } = await res.json();
        setPeople((prev) => prev.map((p) => (p.id === personId ? person : p)));
        return photoUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload photo");
        return null;
      }
    },
    [currentPodcastId]
  );

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  return {
    people,
    isLoading,
    error,
    createPerson,
    updatePerson,
    deletePerson,
    uploadPhoto,
    fetchPeople,
  };
}
