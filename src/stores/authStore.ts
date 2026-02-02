import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Podcast, AuthState } from "../lib/authTypes";
import { useSettingsStore } from "./settingsStore";

interface AuthStore extends AuthState {
  podcasts: Podcast[];
  currentPodcastId: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
  setCurrentPodcast: (id: string | null) => void;
  setPodcasts: (podcasts: Podcast[]) => void;
}

function getApiBase(): string {
  return useSettingsStore.getState().settings.backendUrl || "http://localhost:3001";
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      podcasts: [],
      currentPodcastId: null,

      // Actions
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${getApiBase()}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Login failed");
          }

          const { user, accessToken, refreshToken } = await res.json();

          // Fetch podcasts
          const podcastsRes = await fetch(`${getApiBase()}/api/podcasts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const { podcasts } = await podcastsRes.json();

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
            podcasts,
            currentPodcastId: podcasts[0]?.id || null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Login failed",
          });
          throw error;
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${getApiBase()}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Registration failed");
          }

          const { user, accessToken, refreshToken } = await res.json();

          // Fetch podcasts (may have some from pending invitations)
          const podcastsRes = await fetch(`${getApiBase()}/api/podcasts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const { podcasts } = await podcastsRes.json();

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
            podcasts,
            currentPodcastId: podcasts[0]?.id || null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Registration failed",
          });
          throw error;
        }
      },

      logout: () => {
        const { accessToken } = get();

        // Call logout endpoint (fire and forget)
        if (accessToken) {
          fetch(`${getApiBase()}/api/auth/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          }).catch(() => {});
        }

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          podcasts: [],
          currentPodcastId: null,
        });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });

          if (!res.ok) return false;

          const { accessToken, refreshToken: newRefreshToken } = await res.json();
          set({ accessToken, refreshToken: newRefreshToken });
          return true;
        } catch {
          return false;
        }
      },

      checkAuth: async () => {
        const { accessToken, refreshToken, refreshAccessToken } = get();

        if (!accessToken && !refreshToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          // Try to get current user
          let res = await fetch(`${getApiBase()}/api/auth/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          // If token expired, try refresh
          if (res.status === 401 && refreshToken) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
              const newToken = get().accessToken;
              res = await fetch(`${getApiBase()}/api/auth/me`, {
                headers: { Authorization: `Bearer ${newToken}` },
              });
            }
          }

          if (!res.ok) {
            set({
              isLoading: false,
              isAuthenticated: false,
              user: null,
              accessToken: null,
              refreshToken: null,
            });
            return;
          }

          const { user, podcasts } = await res.json();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            podcasts,
            currentPodcastId: get().currentPodcastId || podcasts[0]?.id || null,
          });
        } catch {
          set({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            accessToken: null,
            refreshToken: null,
          });
        }
      },

      setCurrentPodcast: (id) => set({ currentPodcastId: id }),

      setPodcasts: (podcasts) =>
        set({
          podcasts,
          currentPodcastId: get().currentPodcastId || podcasts[0]?.id || null,
        }),
    }),
    {
      name: "podcastomatic-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentPodcastId: state.currentPodcastId,
        podcasts: state.podcasts,
      }),
    }
  )
);
