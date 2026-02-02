import { useState, useEffect } from "react";
import { Layout, ViewType } from "./components/Layout";
import {
  AppShell,
  ProductionSubStage,
  PostProductionSubStage,
  MarketingSubStage,
} from "./components/AppShell/AppShell";
import { WorkspaceLayout } from "./components/WorkspaceNav/WorkspaceLayout";
import { WorkspaceSection } from "./components/WorkspaceNav/WorkspaceNav";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProjectsView } from "./components/ProjectsView";
import { AudioImport } from "./components/AudioImport/AudioImport";
import { TranscriptEditor } from "./components/TranscriptEditor/TranscriptEditor";
import { ClipSelector } from "./components/ClipSelector/ClipSelector";
import { VideoEditor } from "./components/VideoEditor";
import { PublishPanel } from "./components/PublishPanel";
import { TextContent } from "./components/TextContent";
import { Settings } from "./components/Settings/Settings";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { PodcastInfoPage } from "./components/PodcastInfo/PodcastInfoPage";
import { ConnectionsPage } from "./components/Connections/ConnectionsPage";
import { OAuthCallback } from "./pages/OAuthCallback";
import { AuthScreen, LoadingScreen, CreatePodcastScreen } from "./components/Auth";
import { useProjectStore } from "./stores/projectStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useAuthStore } from "./stores/authStore";
import { usePodcast } from "./hooks/usePodcast";
import { useEpisodes } from "./hooks/useEpisodes";
import { Project, Transcript, Clip } from "./lib/types";
import type { EpisodeWithDetails } from "./hooks/useEpisodes";
import { applyBrandColors, parseBrandColorsFromStorage } from "./lib/colorExtractor";
import { EpisodeStage, StageStatus } from "./components/EpisodePipeline/EpisodePipeline";

// Check if we're on the OAuth callback page
const isOAuthCallback = window.location.pathname.startsWith("/oauth/callback");

// Keys for persisting navigation state
const VIEW_STORAGE_KEY = "podcastomatic-current-view";
const PROJECT_ID_STORAGE_KEY = "podcastomatic-current-project-id";
const SECTION_STORAGE_KEY = "podcastomatic-current-section";
const STAGE_STORAGE_KEY = "podcastomatic-current-stage";
const SUBSTAGE_STORAGE_KEY = "podcastomatic-active-substage";

// Map ViewType to sub-stages
const viewToProductionSubStage: Record<string, ProductionSubStage> = {
  import: "import",
};

const viewToPostProductionSubStage: Record<string, PostProductionSubStage> = {
  transcript: "transcript",
};

const viewToMarketingSubStage: Record<string, MarketingSubStage> = {
  clips: "clips",
  editor: "editor",
  export: "export",
  "text-content": "text-content",
};

const productionSubStageToView: Record<ProductionSubStage, ViewType> = {
  import: "import",
  record: "import", // Record uses import view for now (placeholder)
};

const postProductionSubStageToView: Record<PostProductionSubStage, ViewType> = {
  transcript: "transcript",
};

const marketingSubStageToView: Record<MarketingSubStage, ViewType> = {
  clips: "clips",
  editor: "editor",
  export: "export",
  "text-content": "text-content",
};

// Valid sub-stage IDs for each stage (used to determine which stage a sub-stage belongs to)
const planningSubStageIds = new Set(["guests", "topics", "notes"]);
const productionSubStageIds = new Set(["import", "record"]);
const postProductionSubStageIds = new Set(["transcript"]);
const marketingSubStageIds = new Set(["clips", "editor", "export", "text-content"]);

function App() {
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return (stored as ViewType) || "projects";
  });
  const [currentSection, setCurrentSection] = useState<WorkspaceSection>(() => {
    const stored = localStorage.getItem(SECTION_STORAGE_KEY);
    return (stored as WorkspaceSection) || "episodes";
  });
  const [activeStage, setActiveStage] = useState<EpisodeStage>(() => {
    const stored = localStorage.getItem(STAGE_STORAGE_KEY);
    return (stored as EpisodeStage) || "marketing";
  });
  const [activeSubStage, setActiveSubStage] = useState<string>(() => {
    const stored = localStorage.getItem(SUBSTAGE_STORAGE_KEY);
    return stored || "import";
  });
  const [episodeStageStatus, setEpisodeStageStatus] = useState<Record<string, StageStatus>>({});
  const [isRestoring, setIsRestoring] = useState(true);

  const { currentProject, setCurrentProject } = useProjectStore();
  const { brandColors, setBrandColors } = useWorkspaceStore();
  const {
    isAuthenticated,
    isLoading: authLoading,
    checkAuth,
    podcasts,
    currentPodcastId,
    showCreatePodcast,
    setShowCreatePodcast,
  } = useAuthStore();
  const { podcast } = usePodcast();
  const { episodes, fetchEpisode, updateStageStatus } = useEpisodes();

  // Helper to convert database episode to Project format
  const episodeToProject = (episode: EpisodeWithDetails): Project => {
    const transcripts: Transcript[] = episode.transcripts.map((t) => ({
      id: t.id,
      projectId: episode.id,
      audioFingerprint: t.audioFingerprint,
      text: t.text,
      words: t.words,
      language: t.language || "en",
      createdAt: t.createdAt,
      name: t.name,
    }));

    const clips: Clip[] = episode.clips.map((c) => ({
      id: c.id,
      projectId: episode.id,
      name: c.name,
      startTime: c.startTime,
      endTime: c.endTime,
      transcript: c.transcript || "",
      words: c.words,
      clippabilityScore: c.clippabilityScore,
      isManual: c.isManual || false,
      createdAt: c.createdAt,
      tracks: c.tracks as Clip["tracks"],
      captionStyle: c.captionStyle as Clip["captionStyle"],
      format: c.format as Clip["format"],
    }));

    return {
      id: episode.id,
      name: episode.name,
      audioPath: episode.audioBlobUrl || "",
      audioFileName: episode.audioFileName,
      audioDuration: episode.audioDuration || 0,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
      description: episode.description,
      episodeNumber: episode.episodeNumber,
      seasonNumber: episode.seasonNumber,
      publishDate: episode.publishDate,
      showNotes: episode.showNotes,
      explicit: episode.explicit,
      guests: episode.guests,
      stageStatus: episode.stageStatus,
      transcript: transcripts[0],
      transcripts,
      activeTranscriptId: transcripts[0]?.id,
      clips,
      exportHistory: [],
    };
  };

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Sync brand colors from current podcast when it changes
  useEffect(() => {
    if (podcast?.brandColors) {
      const colors = parseBrandColorsFromStorage(podcast.brandColors);
      setBrandColors(colors);
    } else if (currentPodcastId) {
      // Clear brand colors if podcast has none
      setBrandColors(null);
    }
  }, [podcast?.brandColors, currentPodcastId, setBrandColors]);

  // Apply brand colors on mount and when they change
  useEffect(() => {
    applyBrandColors(brandColors);
  }, [brandColors]);

  // Restore project on mount (wait for auth to complete first)
  useEffect(() => {
    // Don't try to restore until auth is complete
    if (authLoading) {
      return;
    }

    // If no podcast ID after auth completes, stop restoring
    if (!currentPodcastId) {
      setIsRestoring(false);
      return;
    }

    const restoreProject = async () => {
      const storedProjectId = localStorage.getItem(PROJECT_ID_STORAGE_KEY);
      if (storedProjectId) {
        const episode = await fetchEpisode(storedProjectId);
        if (episode) {
          const project = episodeToProject(episode);
          setCurrentProject(project);
        }
      }
      setIsRestoring(false);
    };
    restoreProject();
  }, [authLoading, currentPodcastId, fetchEpisode, setCurrentProject]);

  // Persist current view to localStorage
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  // Persist current section to localStorage
  useEffect(() => {
    localStorage.setItem(SECTION_STORAGE_KEY, currentSection);
  }, [currentSection]);

  // Persist current stage to localStorage
  useEffect(() => {
    localStorage.setItem(STAGE_STORAGE_KEY, activeStage);
  }, [activeStage]);

  // Persist active sub-stage to localStorage
  useEffect(() => {
    localStorage.setItem(SUBSTAGE_STORAGE_KEY, activeSubStage);
  }, [activeSubStage]);

  // Persist current project ID to localStorage
  useEffect(() => {
    if (currentProject?.id) {
      localStorage.setItem(PROJECT_ID_STORAGE_KEY, currentProject.id);
    } else {
      localStorage.removeItem(PROJECT_ID_STORAGE_KEY);
    }
  }, [currentProject?.id]);

  // Reset to projects view when project is cleared (but not during restoration)
  useEffect(() => {
    if (
      !isRestoring &&
      !currentProject &&
      currentView !== "projects" &&
      currentView !== "settings"
    ) {
      setCurrentView("projects");
    }
  }, [currentProject, currentView, isRestoring]);

  // Load stage status when project changes
  useEffect(() => {
    if (currentProject?.stageStatus) {
      const statuses: Record<string, StageStatus> = {};
      for (const [stage, entry] of Object.entries(currentProject.stageStatus)) {
        if (entry && typeof entry === "object" && "status" in entry) {
          statuses[stage] = (entry.status as StageStatus) || "not-started";
        }
      }
      setEpisodeStageStatus(statuses);
    } else {
      setEpisodeStageStatus({});
    }
  }, [currentProject?.id, currentProject?.stageStatus]);

  // Handle workspace section navigation
  const handleSectionNavigate = (section: WorkspaceSection) => {
    setCurrentSection(section);
    // Reset currentView when changing sections (clears settings view if open)
    if (currentView === "settings") {
      setCurrentView("projects");
    }
    switch (section) {
      case "dashboard":
        break;
      case "episodes":
        setCurrentView("projects");
        break;
      case "outreach":
        break;
      case "analytics":
        break;
      case "podcast-info":
        break;
      case "connections":
        break;
    }
  };

  // Handle app-level settings (from header gear icon)
  const handleOpenSettings = () => {
    setCurrentView("settings");
  };

  // Handle stage change from breadcrumb
  const handleStageChange = (stage: EpisodeStage) => {
    setActiveStage(stage);
    // When switching stages, ensure we're on a valid view for that stage
    if (stage === "production" && !viewToProductionSubStage[currentView]) {
      setCurrentView("import");
    } else if (stage === "post-production" && !viewToPostProductionSubStage[currentView]) {
      setCurrentView("transcript");
    } else if (stage === "marketing" && !viewToMarketingSubStage[currentView]) {
      setCurrentView("clips");
    }
  };

  // Handle sub-stage change from breadcrumb
  // Determines the stage based on the sub-stage ID (not activeStage) to handle
  // cross-stage navigation where stage and sub-stage updates may be batched
  const handleSubStageChange = (subStage: string) => {
    setActiveSubStage(subStage);

    if (planningSubStageIds.has(subStage)) {
      setActiveStage("planning");
    } else if (productionSubStageIds.has(subStage)) {
      const view = productionSubStageToView[subStage as ProductionSubStage];
      if (view) setCurrentView(view);
      setActiveStage("production");
    } else if (postProductionSubStageIds.has(subStage)) {
      const view = postProductionSubStageToView[subStage as PostProductionSubStage];
      if (view) setCurrentView(view);
      setActiveStage("post-production");
    } else if (marketingSubStageIds.has(subStage)) {
      const view = marketingSubStageToView[subStage as MarketingSubStage];
      if (view) setCurrentView(view);
      setActiveStage("marketing");
    }
  };

  // Handle episode selection from breadcrumb
  const handleSelectEpisode = async (episodeId: string) => {
    const episode = await fetchEpisode(episodeId);
    if (episode) {
      const project = episodeToProject(episode);
      setCurrentProject(project);
    }
  };

  // Current stage status (computed)
  const currentStageStatus: StageStatus = episodeStageStatus[activeStage] || "not-started";

  // Handle stage status click (cycle through statuses)
  const handleStageStatusClick = async () => {
    if (!currentProject?.id || activeStage === "info") return;

    const cycleMap: Record<StageStatus, StageStatus> = {
      "not-started": "in-progress",
      "in-progress": "complete",
      complete: "not-started",
    };
    const nextStatus = cycleMap[currentStageStatus];

    // Optimistic update
    setEpisodeStageStatus((prev) => ({ ...prev, [activeStage]: nextStatus }));

    // Persist to backend
    const result = await updateStageStatus(currentProject.id, activeStage, nextStatus);

    // Rollback on failure
    if (!result) {
      setEpisodeStageStatus((prev) => ({ ...prev, [activeStage]: currentStageStatus }));
    }
  };

  // Get current sub-stage (unified state for all stages)
  const getCurrentSubStage = (): string | undefined => {
    return activeSubStage;
  };

  // Render section content based on current section
  const renderSectionContent = () => {
    // App-level settings (accessed from header gear icon)
    if (currentView === "settings") {
      return <Settings />;
    }

    switch (currentSection) {
      case "dashboard":
        return (
          <PlaceholderPage
            title="Dashboard"
            description="Your workspace overview with recent activity, quick stats, and upcoming tasks."
          />
        );
      case "outreach":
        return (
          <PlaceholderPage
            title="Outreach"
            description="Manage guest outreach campaigns, contacts, email templates, and track responses."
          />
        );
      case "analytics":
        return (
          <PlaceholderPage
            title="Analytics"
            description="Track your podcast performance with download stats, clip engagement, and growth metrics."
          />
        );
      case "podcast-info":
        return <PodcastInfoPage />;
      case "connections":
        return <ConnectionsPage />;
      case "episodes":
      default:
        return (
          <Layout
            currentView={currentView}
            onViewChange={setCurrentView}
            activeStage={activeStage}
            activeSubStage={activeSubStage}
          >
            {renderView()}
          </Layout>
        );
    }
  };

  const renderView = () => {
    switch (currentView) {
      case "projects":
        return <ProjectsView onProjectLoad={() => setCurrentView("import")} />;
      case "import":
        return <AudioImport onComplete={() => setCurrentView("transcript")} />;
      case "transcript":
        return <TranscriptEditor onComplete={() => setCurrentView("clips")} />;
      case "clips":
        return <ClipSelector onComplete={() => setCurrentView("editor")} />;
      case "editor":
        return (
          <VideoEditor
            onExport={() => setCurrentView("export")}
            onPublish={() => setCurrentView("publish")}
          />
        );
      case "export":
        return <PublishPanel />;
      case "publish":
        return (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-[hsl(var(--text))]">Publishing Suite</h2>
              <p className="mt-2 text-[hsl(var(--text-secondary))]">
                Coming soon - direct publishing to YouTube, TikTok, Instagram, and X
              </p>
              <button
                onClick={() => setCurrentView("editor")}
                className="mt-4 rounded-lg bg-[hsl(var(--cyan))] px-4 py-2 text-sm font-medium text-[hsl(var(--bg-base))]"
              >
                Back to Editor
              </button>
            </div>
          </div>
        );
      case "text-content":
        return <TextContent />;
      default:
        return <ProjectsView onProjectLoad={() => setCurrentView("import")} />;
    }
  };

  // Show episode context when a project is selected (in episodes section)
  const hasEpisodeContext =
    currentSection === "episodes" && currentProject && currentView !== "projects";

  // Get episodes list for dropdown (from database)
  const episodesList = episodes.map((e) => ({ id: e.id, name: e.name }));

  // Render OAuth callback page if on that route
  if (isOAuthCallback) {
    return <OAuthCallback />;
  }

  // Show loading screen while checking auth
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Show create podcast screen if user has no podcasts or explicitly requested
  if (podcasts.length === 0 || showCreatePodcast) {
    return (
      <CreatePodcastScreen
        onCancel={podcasts.length > 0 ? () => setShowCreatePodcast(false) : undefined}
      />
    );
  }

  return (
    <AppShell
      onSettingsClick={handleOpenSettings}
      episodeName={hasEpisodeContext ? currentProject?.name : undefined}
      episodes={episodesList}
      onBackToEpisodes={() => setCurrentView("projects")}
      onSelectEpisode={handleSelectEpisode}
      activeStage={hasEpisodeContext ? activeStage : undefined}
      onStageChange={hasEpisodeContext ? handleStageChange : undefined}
      activeSubStage={hasEpisodeContext ? getCurrentSubStage() : undefined}
      onSubStageChange={hasEpisodeContext ? handleSubStageChange : undefined}
      stageStatus={hasEpisodeContext ? currentStageStatus : undefined}
      onStageStatusClick={hasEpisodeContext ? handleStageStatusClick : undefined}
    >
      <ErrorBoundary>
        <WorkspaceLayout activeSection={currentSection} onNavigate={handleSectionNavigate}>
          {renderSectionContent()}
        </WorkspaceLayout>
      </ErrorBoundary>
    </AppShell>
  );
}

export default App;
