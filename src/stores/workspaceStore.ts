import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BrandColors, applyBrandColors } from "../lib/colorExtractor";

export interface PodcastMetadata {
  name: string;
  description: string;
  author: string;
  email: string;
  website: string;
  language: string;
  category: string;
  explicit: boolean;
  coverImage?: string;
}

export interface SocialConnection {
  id: string;
  platform: "youtube" | "tiktok" | "instagram" | "x";
  connected: boolean;
  accountName?: string;
  connectedAt?: string;
}

interface WorkspaceState {
  // Podcast metadata
  podcastMetadata: PodcastMetadata;
  updatePodcastMetadata: (updates: Partial<PodcastMetadata>) => void;

  // Brand colors (extracted from cover image)
  brandColors: BrandColors | null;
  setBrandColors: (colors: BrandColors | null) => void;

  // Social connections
  connections: SocialConnection[];
  connectAccount: (platform: SocialConnection["platform"], accountName: string) => void;
  disconnectAccount: (platform: SocialConnection["platform"]) => void;
  getConnection: (platform: SocialConnection["platform"]) => SocialConnection | undefined;
}

const DEFAULT_PODCAST_METADATA: PodcastMetadata = {
  name: "My Podcast",
  description: "",
  author: "",
  email: "",
  website: "",
  language: "en",
  category: "Technology",
  explicit: false,
  coverImage: undefined,
};

const DEFAULT_CONNECTIONS: SocialConnection[] = [
  { id: "youtube", platform: "youtube", connected: false },
  { id: "tiktok", platform: "tiktok", connected: false },
  { id: "instagram", platform: "instagram", connected: false },
  { id: "x", platform: "x", connected: false },
];

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      podcastMetadata: DEFAULT_PODCAST_METADATA,

      updatePodcastMetadata: (updates) => {
        set((state) => ({
          podcastMetadata: { ...state.podcastMetadata, ...updates },
        }));
      },

      brandColors: null,

      setBrandColors: (colors) => {
        set({ brandColors: colors });
        // Apply to CSS immediately
        applyBrandColors(colors);
      },

      connections: DEFAULT_CONNECTIONS,

      connectAccount: (platform, accountName) => {
        set((state) => ({
          connections: state.connections.map((conn) =>
            conn.platform === platform
              ? {
                  ...conn,
                  connected: true,
                  accountName,
                  connectedAt: new Date().toISOString(),
                }
              : conn
          ),
        }));
      },

      disconnectAccount: (platform) => {
        set((state) => ({
          connections: state.connections.map((conn) =>
            conn.platform === platform
              ? {
                  ...conn,
                  connected: false,
                  accountName: undefined,
                  connectedAt: undefined,
                }
              : conn
          ),
        }));
      },

      getConnection: (platform) => {
        return get().connections.find((conn) => conn.platform === platform);
      },
    }),
    {
      name: "podcast-clipper-workspace",
      version: 2,
      onRehydrateStorage: () => (state) => {
        // Apply brand colors when store is rehydrated from localStorage
        if (state?.brandColors) {
          applyBrandColors(state.brandColors);
        }
      },
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as WorkspaceState;
        if (version < 2) {
          // Add brandColors for stores created before v2
          return { ...state, brandColors: null };
        }
        return state;
      },
    }
  )
);
