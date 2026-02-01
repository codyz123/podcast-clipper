import { useState, useEffect } from "react";
import { Layout, ViewType } from "./components/Layout";
import { AppShell, MarketingSubStage } from "./components/AppShell/AppShell";
import { WorkspaceLayout } from "./components/WorkspaceNav/WorkspaceLayout";
import { WorkspaceSection } from "./components/WorkspaceNav/WorkspaceNav";
import { ProjectsView } from "./components/ProjectsView";
import { AudioImport } from "./components/AudioImport/AudioImport";
import { TranscriptEditor } from "./components/TranscriptEditor/TranscriptEditor";
import { ClipSelector } from "./components/ClipSelector/ClipSelector";
import { VideoEditor } from "./components/VideoEditor";
import { ExportPanel } from "./components/ExportPanel/ExportPanel";
import { Settings } from "./components/Settings/Settings";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { PodcastInfoPage } from "./components/PodcastInfo/PodcastInfoPage";
import { ConnectionsPage } from "./components/Connections/ConnectionsPage";
import { useProjectStore } from "./stores/projectStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { applyBrandColors } from "./lib/colorExtractor";
import { EpisodeStage, PlanningSubStage } from "./components/EpisodePipeline/EpisodePipeline";

// Keys for persisting navigation state
const VIEW_STORAGE_KEY = "podcast-clipper-current-view";
const PROJECT_ID_STORAGE_KEY = "podcast-clipper-current-project-id";
const SECTION_STORAGE_KEY = "podcast-clipper-current-section";
const STAGE_STORAGE_KEY = "podcast-clipper-current-stage";
const PLANNING_SUBSTAGE_STORAGE_KEY = "podcast-clipper-planning-substage";

// Map ViewType to MarketingSubStage
const viewToMarketingSubStage: Record<string, MarketingSubStage> = {
  import: "import",
  transcript: "transcript",
  clips: "clips",
  editor: "editor",
  export: "export",
};

const marketingSubStageToView: Record<MarketingSubStage, ViewType> = {
  import: "import",
  transcript: "transcript",
  clips: "clips",
  editor: "editor",
  export: "export",
};

// Valid sub-stage IDs for each stage (used to determine which stage a sub-stage belongs to)
const planningSubStageIds = new Set(["guests", "topics", "notes"]);
const marketingSubStageIds = new Set(["import", "transcript", "clips", "editor", "export"]);

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
  const [activePlanningSubStage, setActivePlanningSubStage] = useState<PlanningSubStage>(() => {
    const stored = localStorage.getItem(PLANNING_SUBSTAGE_STORAGE_KEY);
    return planningSubStageIds.has(stored || "") ? (stored as PlanningSubStage) : "guests";
  });
  const [isRestoring, setIsRestoring] = useState(true);

  const { currentProject, projects, loadProject } = useProjectStore();
  const { brandColors } = useWorkspaceStore();

  // Apply brand colors on mount and when they change
  useEffect(() => {
    applyBrandColors(brandColors);
  }, [brandColors]);

  // Restore project on mount
  useEffect(() => {
    const storedProjectId = localStorage.getItem(PROJECT_ID_STORAGE_KEY);
    if (storedProjectId) {
      loadProject(storedProjectId);
    }
    setIsRestoring(false);
  }, [loadProject]);

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

  // Persist planning sub-stage to localStorage
  useEffect(() => {
    localStorage.setItem(PLANNING_SUBSTAGE_STORAGE_KEY, activePlanningSubStage);
  }, [activePlanningSubStage]);

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
    // When switching to marketing, ensure we're on a valid marketing view
    if (stage === "marketing" && !viewToMarketingSubStage[currentView]) {
      setCurrentView("import");
    }
  };

  // Handle sub-stage change from breadcrumb
  // Determines the stage based on the sub-stage ID (not activeStage) to handle
  // cross-stage navigation where stage and sub-stage updates may be batched
  const handleSubStageChange = (subStage: string) => {
    if (planningSubStageIds.has(subStage)) {
      setActivePlanningSubStage(subStage as PlanningSubStage);
      // Also ensure we're on the planning stage
      setActiveStage("planning");
    } else if (marketingSubStageIds.has(subStage)) {
      const view = marketingSubStageToView[subStage as MarketingSubStage];
      if (view) {
        setCurrentView(view);
        // Also ensure we're on the marketing stage
        setActiveStage("marketing");
      }
    }
  };

  // Handle episode selection from breadcrumb
  const handleSelectEpisode = (episodeId: string) => {
    loadProject(episodeId);
  };

  // Get current sub-stage based on active stage
  const getCurrentSubStage = (): string | undefined => {
    if (activeStage === "planning") {
      return activePlanningSubStage;
    }
    if (activeStage === "marketing") {
      return viewToMarketingSubStage[currentView] || "import";
    }
    return undefined;
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
            activePlanningSubStage={activePlanningSubStage}
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
        return <ExportPanel />;
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
      default:
        return <ProjectsView onProjectLoad={() => setCurrentView("import")} />;
    }
  };

  // Show episode context when a project is selected (in episodes section)
  const hasEpisodeContext =
    currentSection === "episodes" && currentProject && currentView !== "projects";

  // Get episodes list for dropdown
  const episodesList = projects.map((p) => ({ id: p.id, name: p.name }));

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
    >
      <WorkspaceLayout activeSection={currentSection} onNavigate={handleSectionNavigate}>
        {renderSectionContent()}
      </WorkspaceLayout>
    </AppShell>
  );
}

export default App;
