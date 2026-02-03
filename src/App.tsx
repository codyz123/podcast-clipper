import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout, ViewType } from "./components/Layout";
import { AppShell } from "./components/AppShell/AppShell";
import { WorkspaceLayout } from "./components/WorkspaceNav/WorkspaceLayout";
import { WorkspaceSection } from "./components/WorkspaceNav/WorkspaceNav";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProjectsView } from "./components/ProjectsView";
import { ImportButton } from "./components/ImportButton";
import { TranscriptEditor } from "./components/TranscriptEditor/TranscriptEditor";
import { ClipSelector } from "./components/ClipSelector/ClipSelector";
import { VideoEditor } from "./components/VideoEditor";
import { PublishPanel } from "./components/PublishPanel";
import { TextContent } from "./components/TextContent";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { PodcastInfoPage } from "./components/PodcastInfo/PodcastInfoPage";
import { PodcastSettingsPage } from "./components/Settings/PodcastSettingsPage";
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
import type { EpisodeStage } from "./components/EpisodePipeline/EpisodePipeline";
import {
  ROUTE_TO_SUB_STEP,
  type StageStatus,
  type SubStepId,
  cycleStatus,
} from "./lib/statusConfig";

const planningSubStageIds = new Set(["guests", "topics", "notes"]);
const productionSubStageIds = new Set(["record"]);
const postProductionSubStageIds = new Set(["transcript"]);
const marketingSubStageIds = new Set(["clips", "editor", "export", "text-content"]);

const stageDefaults: Record<EpisodeStage, string | null> = {
  info: null,
  planning: "guests",
  production: "record",
  "post-production": "transcript",
  distribution: null,
  marketing: "clips",
};

const stageSubStages: Record<EpisodeStage, Set<string> | null> = {
  info: null,
  planning: planningSubStageIds,
  production: productionSubStageIds,
  "post-production": postProductionSubStageIds,
  distribution: null,
  marketing: marketingSubStageIds,
};

const subStageToStage: Record<string, EpisodeStage> = {
  guests: "planning",
  topics: "planning",
  notes: "planning",
  record: "production",
  transcript: "post-production",
  clips: "marketing",
  editor: "marketing",
  export: "marketing",
  "text-content": "marketing",
};

const subStageToView: Record<string, ViewType> = {
  guests: "planning",
  topics: "planning",
  notes: "planning",
  record: "record",
  transcript: "transcript",
  clips: "clips",
  editor: "editor",
  export: "export",
  "text-content": "text-content",
};

const stageToRouteSegment: Record<EpisodeStage, string> = {
  info: "info",
  planning: "planning",
  production: "production",
  "post-production": "post",
  distribution: "distribution",
  marketing: "marketing",
};

const routeSegmentToStage: Record<string, EpisodeStage> = {
  info: "info",
  planning: "planning",
  production: "production",
  post: "post-production",
  "post-production": "post-production",
  distribution: "distribution",
  marketing: "marketing",
};

const subStageToRouteSegment: Record<string, string> = {
  guests: "guests",
  topics: "topics",
  notes: "notes",
  record: "record",
  transcript: "transcribe",
  clips: "clips",
  editor: "editor",
  export: "publish",
  "text-content": "text-content",
};

const routeSegmentToSubStage: Record<string, string> = {
  guests: "guests",
  topics: "topics",
  notes: "notes",
  import: "record", // Redirect old import URLs to record
  record: "record",
  transcript: "transcript",
  transcribe: "transcript",
  clips: "clips",
  editor: "editor",
  export: "export",
  publish: "export",
  "text-content": "text-content",
};

const slugifyTitle = (value: string) => {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "episode";
};

type RouteInfo =
  | { kind: "oauth" }
  | { kind: "login" }
  | { kind: "create-podcast" }
  | { kind: "episodes-list"; section: WorkspaceSection; view: ViewType }
  | { kind: "section"; section: WorkspaceSection }
  | { kind: "episode-route"; slugOrId: string; stageSegment?: string; subStageSegment?: string }
  | { kind: "redirect"; to: string };

const parseRoute = (pathname: string): RouteInfo => {
  if (pathname.startsWith("/oauth/callback")) {
    return { kind: "oauth" };
  }

  const cleanPath = pathname.split("?")[0].split("#")[0];
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { kind: "redirect", to: "/episodes" };
  }

  switch (segments[0]) {
    case "login":
      return { kind: "login" };
    case "create-podcast":
      return { kind: "create-podcast" };
    case "dashboard":
      return { kind: "section", section: "dashboard" };
    case "outreach":
      return { kind: "section", section: "outreach" };
    case "analytics":
      return { kind: "section", section: "analytics" };
    case "podcast-info":
      return { kind: "section", section: "podcast-info" };
    case "settings":
      return { kind: "section", section: "settings" };
    case "episodes": {
      if (segments.length === 1) {
        return { kind: "episodes-list", section: "episodes", view: "projects" };
      }

      const slugOrId = segments[1];
      const stageSegment = segments[2];
      const subStageSegment = segments[3];

      return {
        kind: "episode-route",
        slugOrId,
        stageSegment,
        subStageSegment,
      };
    }
    default:
      return { kind: "redirect", to: "/episodes" };
  }
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const route = useMemo(() => parseRoute(location.pathname), [location.pathname]);

  const [episodeStageStatus, setEpisodeStageStatus] = useState<Record<string, StageStatus>>({});
  const [lastSection, setLastSection] = useState<WorkspaceSection>("episodes");

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
  const {
    episodes,
    fetchEpisode,
    updateStageStatus,
    updateSubStepStatus,
    isLoading: episodesLoading,
  } = useEpisodes();

  const getEpisodeSlug = useCallback(
    (episodeId: string, fallbackName?: string) => {
      if (currentProject?.id === episodeId && currentProject.name) {
        return slugifyTitle(currentProject.name);
      }
      const episode = episodes.find((e) => e.id === episodeId);
      const name = episode?.name || fallbackName || "episode";
      return slugifyTitle(name);
    },
    [episodes, currentProject?.id, currentProject?.name]
  );

  const buildEpisodePath = useCallback(
    (episodeId: string, stage: EpisodeStage, subStage?: string, slugOverride?: string) => {
      const slug = slugOverride || getEpisodeSlug(episodeId);
      const stageSegment = stageToRouteSegment[stage];

      if (stage === "info") {
        return `/episodes/${slug}/${stageSegment}`;
      }

      const targetSubStage = subStage || stageDefaults[stage] || "import";
      const subStageSegment = subStageToRouteSegment[targetSubStage] || targetSubStage;

      return `/episodes/${slug}/${stageSegment}/${subStageSegment}`;
    },
    [getEpisodeSlug]
  );

  const resolveEpisodeBySlugOrId = useCallback(
    (slugOrId: string) => {
      const byId = episodes.find((e) => e.id === slugOrId);
      if (byId) {
        return { episode: byId, slug: slugifyTitle(byId.name), matchedById: true };
      }

      const bySlug = episodes.find((e) => slugifyTitle(e.name) === slugOrId);
      if (bySlug) {
        return { episode: bySlug, slug: slugifyTitle(bySlug.name), matchedById: false };
      }

      if (currentProject && slugifyTitle(currentProject.name) === slugOrId) {
        return {
          episode: { id: currentProject.id, name: currentProject.name },
          slug: slugOrId,
          matchedById: false,
        };
      }

      return null;
    },
    [episodes, currentProject]
  );

  const resolvedEpisode = useMemo(() => {
    if (route.kind !== "episode-route") return null;
    return resolveEpisodeBySlugOrId(route.slugOrId);
  }, [route, resolveEpisodeBySlugOrId]);

  const episodeRouteState = useMemo(() => {
    if (route.kind !== "episode-route") return null;

    const stageSegment = route.stageSegment;
    let stage = stageSegment ? routeSegmentToStage[stageSegment] : undefined;

    if (!stage) {
      stage = "production";
    }

    if (stage === "distribution") {
      stage = "marketing";
    }

    if (stage === "info") {
      return { stage, subStage: undefined, view: "info" as ViewType };
    }

    const subStageSegment = route.subStageSegment;
    let subStage = subStageSegment ? routeSegmentToSubStage[subStageSegment] : undefined;

    if (!subStage || !stageSubStages[stage]?.has(subStage)) {
      subStage = stageDefaults[stage] || undefined;
    }

    const view = subStage ? subStageToView[subStage] : "projects";

    return { stage, subStage, view };
  }, [route]);

  const canonicalEpisodePath = useMemo(() => {
    if (route.kind !== "episode-route") return null;
    if (!resolvedEpisode || !episodeRouteState) return null;

    return buildEpisodePath(
      resolvedEpisode.episode.id,
      episodeRouteState.stage,
      episodeRouteState.subStage,
      resolvedEpisode.slug
    );
  }, [route, resolvedEpisode, episodeRouteState, buildEpisodePath]);

  // Helper to convert database episode to Project format
  const episodeToProject = useCallback((episode: EpisodeWithDetails): Project => {
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
  }, []);

  const goToEpisodeStage = useCallback(
    (episodeId: string, stage: EpisodeStage, subStage?: string, slugOverride?: string) => {
      if (!episodeId) return;

      if (stage === "distribution") {
        navigate(buildEpisodePath(episodeId, "marketing", "clips", slugOverride));
        return;
      }

      navigate(buildEpisodePath(episodeId, stage, subStage, slugOverride));
    },
    [buildEpisodePath, navigate]
  );

  // Redirects for invalid or default routes
  useEffect(() => {
    if (route.kind === "redirect" && route.to !== location.pathname) {
      navigate(route.to, { replace: true });
    }
  }, [route, location.pathname, navigate]);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Track last non-settings section for sidebar highlight
  useEffect(() => {
    if (route.kind === "section" || route.kind === "episodes-list") {
      if (route.section && route.section !== lastSection) {
        setLastSection(route.section);
      }
    }
    if (route.kind === "episode-route") {
      if (lastSection !== "episodes") {
        setLastSection("episodes");
      }
    }
  }, [route, lastSection]);

  // Sync brand colors from current podcast when it changes
  useEffect(() => {
    if (podcast?.brandColors) {
      const colors = parseBrandColorsFromStorage(podcast.brandColors);
      setBrandColors(colors);
    } else if (currentPodcastId) {
      setBrandColors(null);
    }
  }, [podcast?.brandColors, currentPodcastId, setBrandColors]);

  // Apply brand colors on mount and when they change
  useEffect(() => {
    applyBrandColors(brandColors);
  }, [brandColors]);

  // Ensure unauthenticated users land on login route
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated && route.kind !== "login" && route.kind !== "oauth") {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [authLoading, isAuthenticated, route.kind, location.pathname, navigate]);

  // Ensure authenticated users leave login route
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated && route.kind === "login") {
      navigate("/episodes", { replace: true });
    }
  }, [authLoading, isAuthenticated, route.kind, navigate]);

  // Route to create podcast when needed
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    if ((podcasts.length === 0 || showCreatePodcast) && route.kind !== "create-podcast") {
      navigate("/create-podcast", { replace: true });
      return;
    }

    if (route.kind === "create-podcast" && podcasts.length > 0 && !showCreatePodcast) {
      navigate("/episodes", { replace: true });
    }
  }, [authLoading, isAuthenticated, podcasts.length, showCreatePodcast, route.kind, navigate]);

  // Canonicalize episode routes (slug + stage + sub-stage)
  useEffect(() => {
    if (route.kind !== "episode-route") return;
    if (authLoading || !isAuthenticated) return;

    if (!resolvedEpisode) {
      if (!episodesLoading && episodes.length > 0) {
        navigate("/episodes", { replace: true });
      }
      return;
    }

    if (canonicalEpisodePath && canonicalEpisodePath !== location.pathname) {
      navigate(canonicalEpisodePath, { replace: true });
    }
  }, [
    route,
    resolvedEpisode,
    canonicalEpisodePath,
    episodesLoading,
    episodes.length,
    location.pathname,
    navigate,
    authLoading,
    isAuthenticated,
  ]);

  // Keep slug in URL synced to current episode title
  useEffect(() => {
    if (route.kind !== "episode-route") return;
    if (!currentProject?.id || !currentProject.name) return;

    const currentSlug = slugifyTitle(currentProject.name);
    if (route.slugOrId === currentSlug) return;

    if (episodeRouteState) {
      const target = buildEpisodePath(
        currentProject.id,
        episodeRouteState.stage,
        episodeRouteState.subStage,
        currentSlug
      );
      if (target !== location.pathname) {
        navigate(target, { replace: true });
      }
    }
  }, [
    route,
    currentProject?.id,
    currentProject?.name,
    episodeRouteState,
    buildEpisodePath,
    location.pathname,
    navigate,
  ]);

  // Load episode when URL changes
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (route.kind !== "episode-route") return;
    if (!resolvedEpisode) return;
    if (currentProject?.id === resolvedEpisode.episode.id) return;

    const loadEpisode = async () => {
      const episode = await fetchEpisode(resolvedEpisode.episode.id);
      if (episode) {
        setCurrentProject(episodeToProject(episode));
      }
    };

    loadEpisode();
  }, [
    authLoading,
    isAuthenticated,
    route,
    resolvedEpisode,
    currentProject?.id,
    fetchEpisode,
    setCurrentProject,
    episodeToProject,
  ]);

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

  const currentSection: WorkspaceSection =
    route.kind === "section" || route.kind === "episodes-list"
      ? route.section
      : route.kind === "episode-route"
        ? "episodes"
        : lastSection;

  const currentView: ViewType =
    route.kind === "episodes-list"
      ? route.view
      : route.kind === "episode-route" && episodeRouteState
        ? episodeRouteState.view
        : "projects";

  const activeStage = route.kind === "episode-route" ? episodeRouteState?.stage : undefined;
  const activeSubStage = route.kind === "episode-route" ? episodeRouteState?.subStage : undefined;

  const hasEpisodeContext =
    currentSection === "episodes" && route.kind === "episode-route" && currentProject;

  const currentStageStatus: StageStatus = activeStage
    ? episodeStageStatus[activeStage] || "not-started"
    : "not-started";

  // Get sub-step ID from active sub-stage (if it maps to a sub-step)
  const currentSubStepId: SubStepId | undefined = activeSubStage
    ? ROUTE_TO_SUB_STEP[activeSubStage]
    : undefined;

  // Get sub-step status from stageStatus.subSteps
  const currentSubStepStatus: StageStatus = currentSubStepId
    ? (currentProject?.stageStatus?.subSteps?.[currentSubStepId]?.status as StageStatus) ||
      "not-started"
    : "not-started";

  const handleSectionNavigate = (section: WorkspaceSection) => {
    const target =
      section === "episodes"
        ? "/episodes"
        : section === "podcast-info"
          ? "/podcast-info"
          : section === "settings"
            ? "/settings"
            : section === "dashboard"
              ? "/dashboard"
              : section === "outreach"
                ? "/outreach"
                : "/analytics";
    navigate(target);
  };

  const handleOpenSettings = () => {
    navigate("/settings");
  };

  const handleStageChange = (stage: EpisodeStage) => {
    if (!currentProject?.id) return;
    goToEpisodeStage(currentProject.id, stage);
  };

  const handleSubStageChange = (subStage: string) => {
    if (!currentProject?.id) return;
    const stage = subStageToStage[subStage];
    if (!stage) return;
    goToEpisodeStage(currentProject.id, stage, subStage);
  };

  const handleSelectEpisode = (episodeId: string) => {
    if (!episodeId) return;

    if (activeStage === "info") {
      goToEpisodeStage(episodeId, "info");
      return;
    }

    if (activeStage && activeSubStage) {
      goToEpisodeStage(episodeId, activeStage, activeSubStage);
      return;
    }

    goToEpisodeStage(episodeId, "production", "record");
  };

  const handleProjectLoad = (episodeId: string) => {
    if (!episodeId) return;
    goToEpisodeStage(episodeId, "production", "record");
  };

  const handleStageStatusClick = async () => {
    if (!currentProject?.id || !activeStage || activeStage === "info") return;

    const nextStatus = cycleStatus(currentStageStatus);

    setEpisodeStageStatus((prev) => ({ ...prev, [activeStage]: nextStatus }));

    const result = await updateStageStatus(currentProject.id, activeStage, nextStatus);

    if (!result) {
      setEpisodeStageStatus((prev) => ({ ...prev, [activeStage]: currentStageStatus }));
    }
  };

  const handleSubStepStatusClick = async () => {
    if (!currentProject?.id || !currentSubStepId) return;

    const nextStatus = cycleStatus(currentSubStepStatus);

    // Optimistically update local state
    const prevSubSteps = currentProject?.stageStatus?.subSteps || {};
    const updatedSubSteps = {
      ...prevSubSteps,
      [currentSubStepId]: { status: nextStatus, updatedAt: new Date().toISOString() },
    };

    // Update projectStore
    const projectState = useProjectStore.getState();
    projectState.updateProject({
      stageStatus: {
        ...currentProject.stageStatus,
        subSteps: updatedSubSteps,
      },
    });

    const result = await updateSubStepStatus(currentProject.id, currentSubStepId, nextStatus);

    if (!result) {
      // Rollback on failure
      projectState.updateProject({
        stageStatus: {
          ...currentProject.stageStatus,
          subSteps: prevSubSteps,
        },
      });
    }
  };

  const handleMarketingSubStepStatusChange = async (subStepId: string, newStatus: StageStatus) => {
    if (!currentProject?.id) return;

    // Optimistically update local state
    const prevSubSteps = currentProject?.stageStatus?.subSteps || {};
    const updatedSubSteps = {
      ...prevSubSteps,
      [subStepId]: { status: newStatus, updatedAt: new Date().toISOString() },
    };

    // Update projectStore
    const projectState = useProjectStore.getState();
    projectState.updateProject({
      stageStatus: {
        ...currentProject.stageStatus,
        subSteps: updatedSubSteps,
      },
    });

    const result = await updateSubStepStatus(currentProject.id, subStepId, newStatus);

    if (!result) {
      // Rollback on failure
      projectState.updateProject({
        stageStatus: {
          ...currentProject.stageStatus,
          subSteps: prevSubSteps,
        },
      });
    }
  };

  const renderView = () => {
    switch (currentView) {
      case "projects":
        return <ProjectsView onProjectLoad={handleProjectLoad} />;
      case "record":
        return (
          <div className="mx-auto max-w-2xl">
            <div className="mb-8 sm:mb-10">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
                Record & Import
              </h1>
              <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                Import your podcast audio or record directly (coming soon)
              </p>
            </div>
            <ImportButton
              variant="expanded"
              onImportComplete={() =>
                currentProject?.id &&
                goToEpisodeStage(currentProject.id, "post-production", "transcript")
              }
            />
          </div>
        );
      case "transcript":
        return (
          <TranscriptEditor
            onComplete={() =>
              currentProject?.id && goToEpisodeStage(currentProject.id, "marketing", "clips")
            }
          />
        );
      case "clips":
        return (
          <ClipSelector
            onComplete={() =>
              currentProject?.id && goToEpisodeStage(currentProject.id, "marketing", "editor")
            }
          />
        );
      case "editor":
        return <VideoEditor />;
      case "export":
        return <PublishPanel />;
      case "text-content":
        return <TextContent />;
      case "planning":
      case "info":
        return null;
      default:
        return <ProjectsView onProjectLoad={handleProjectLoad} />;
    }
  };

  const renderSectionContent = () => {
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
      case "settings":
        return <PodcastSettingsPage />;
      case "episodes":
      default:
        return (
          <Layout
            currentView={currentView}
            activeStage={activeStage}
            activeSubStage={activeSubStage}
          >
            {renderView()}
          </Layout>
        );
    }
  };

  const episodesList = episodes.map((e) => ({ id: e.id, name: e.name }));

  if (route.kind === "redirect") {
    return null;
  }

  if (route.kind === "oauth") {
    return <OAuthCallback />;
  }

  if (
    authLoading ||
    (route.kind === "episode-route" &&
      !resolvedEpisode &&
      (episodesLoading || episodes.length === 0))
  ) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (route.kind === "create-podcast") {
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
      onBackToEpisodes={() => navigate("/episodes")}
      onSelectEpisode={handleSelectEpisode}
      activeStage={hasEpisodeContext ? activeStage : undefined}
      onStageChange={hasEpisodeContext ? handleStageChange : undefined}
      activeSubStage={hasEpisodeContext ? activeSubStage : undefined}
      onSubStageChange={hasEpisodeContext ? handleSubStageChange : undefined}
      stageStatus={hasEpisodeContext ? currentStageStatus : undefined}
      onStageStatusClick={hasEpisodeContext ? handleStageStatusClick : undefined}
      subStepId={hasEpisodeContext ? currentSubStepId : undefined}
      subStepStatus={hasEpisodeContext ? currentSubStepStatus : undefined}
      onSubStepStatusClick={
        hasEpisodeContext && currentSubStepId ? handleSubStepStatusClick : undefined
      }
      stageStatusWithSubSteps={hasEpisodeContext ? currentProject?.stageStatus : undefined}
      onMarketingSubStepStatusChange={
        hasEpisodeContext && activeStage === "marketing"
          ? handleMarketingSubStepStatusChange
          : undefined
      }
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
