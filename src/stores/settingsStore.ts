import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppSettings, VideoFormat, VideoTemplate } from "../lib/types";
import { generateId } from "../lib/utils";

// Default templates
const DEFAULT_TEMPLATES: VideoTemplate[] = [
  {
    id: "minimal-dark",
    name: "Minimal Dark",
    isBuiltIn: true,
    background: {
      type: "solid",
      color: "#000000",
    },
    subtitle: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 64,
      fontWeight: 700,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 2,
      position: "center",
      animation: "pop",
      wordsPerGroup: 3,
    },
  },
  {
    id: "gradient-pop",
    name: "Gradient Pop",
    isBuiltIn: true,
    background: {
      type: "gradient",
      gradientColors: ["#667eea", "#764ba2"],
      gradientDirection: 135,
    },
    subtitle: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 72,
      fontWeight: 800,
      color: "#ffffff",
      shadowColor: "rgba(0,0,0,0.5)",
      shadowBlur: 10,
      position: "center",
      animation: "karaoke",
      wordsPerGroup: 4,
    },
  },
  {
    id: "clean-light",
    name: "Clean Light",
    isBuiltIn: true,
    background: {
      type: "solid",
      color: "#f8fafc",
    },
    subtitle: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 60,
      fontWeight: 600,
      color: "#1e293b",
      position: "center",
      animation: "fade",
      wordsPerGroup: 4,
    },
  },
  {
    id: "podcast-brand",
    name: "Podcast Brand",
    isBuiltIn: true,
    background: {
      type: "gradient",
      gradientColors: ["#1a1a2e", "#16213e"],
      gradientDirection: 180,
    },
    subtitle: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 68,
      fontWeight: 700,
      color: "#e94560",
      outlineColor: "#ffffff",
      outlineWidth: 3,
      position: "center",
      animation: "typewriter",
      wordsPerGroup: 3,
    },
  },
];

interface SettingsState {
  settings: AppSettings;
  templates: VideoTemplate[];

  // Settings actions
  updateSettings: (updates: Partial<AppSettings>) => void;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setBackendConfig: (url: string, accessCode: string) => void;
  clearBackendConfig: () => void;

  // Template actions
  addTemplate: (template: Omit<VideoTemplate, "id" | "isBuiltIn">) => VideoTemplate;
  updateTemplate: (templateId: string, updates: Partial<VideoTemplate>) => void;
  deleteTemplate: (templateId: string) => void;
  duplicateTemplate: (templateId: string) => VideoTemplate | null;
  getTemplate: (templateId: string) => VideoTemplate | undefined;
}

// Current settings version - increment when adding new required fields
const SETTINGS_VERSION = 4;

// Detect production environment and use appropriate backend URL
const isProduction = window.location.hostname !== "localhost";
const DEFAULT_BACKEND_URL = isProduction
  ? "https://podcastomatic-api-production.up.railway.app"
  : "http://localhost:3001";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        // Backend config
        backendUrl: DEFAULT_BACKEND_URL,
        accessCode: "podcast-friends",
        defaultTemplate: "minimal-dark",
        defaultFormats: ["9:16"] as VideoFormat[],
        defaultClipDuration: 30,
        autoSaveInterval: 30,
        confidenceThreshold: 0,
      },
      templates: DEFAULT_TEMPLATES,

      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      setApiKey: (key) => {
        set((state) => ({
          settings: { ...state.settings, openaiApiKey: key },
        }));
      },

      clearApiKey: () => {
        set((state) => ({
          settings: { ...state.settings, openaiApiKey: undefined },
        }));
      },

      setBackendConfig: (url, accessCode) => {
        set((state) => ({
          settings: { ...state.settings, backendUrl: url, accessCode },
        }));
      },

      clearBackendConfig: () => {
        set((state) => ({
          settings: { ...state.settings, backendUrl: undefined, accessCode: undefined },
        }));
      },

      addTemplate: (templateData) => {
        const template: VideoTemplate = {
          ...templateData,
          id: generateId(),
          isBuiltIn: false,
        };

        set((state) => ({
          templates: [...state.templates, template],
        }));

        return template;
      },

      updateTemplate: (templateId, updates) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === templateId && !t.isBuiltIn ? { ...t, ...updates } : t
          ),
        }));
      },

      deleteTemplate: (templateId) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== templateId || t.isBuiltIn),
        }));
      },

      duplicateTemplate: (templateId) => {
        const original = get().templates.find((t) => t.id === templateId);
        if (!original) return null;

        const duplicate: VideoTemplate = {
          ...original,
          id: generateId(),
          name: `${original.name} (Copy)`,
          isBuiltIn: false,
        };

        set((state) => ({
          templates: [...state.templates, duplicate],
        }));

        return duplicate;
      },

      getTemplate: (templateId) => {
        return get().templates.find((t) => t.id === templateId);
      },
    }),
    {
      name: "podcastomatic-settings",
      version: SETTINGS_VERSION,
      migrate: (persistedState: any, version: number) => {
        let state = persistedState;

        // Migration v2 -> v3: update backend config
        if (version < 3) {
          state = {
            ...state,
            settings: {
              ...state.settings,
              backendUrl: DEFAULT_BACKEND_URL,
              accessCode: state.settings?.accessCode || "podcast-friends",
            },
          };
        }

        // Migration v3 -> v4: ensure access code is set for production users
        if (version < 4) {
          state = {
            ...state,
            settings: {
              ...state.settings,
              accessCode: state.settings?.accessCode || "podcast-friends",
            },
          };
        }

        return state;
      },
    }
  )
);
