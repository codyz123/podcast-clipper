import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout, ViewType } from "./components/Layout";
import { AppShell } from "./components/AppShell/AppShell";
import { WorkspaceLayout } from "./components/WorkspaceNav/WorkspaceLayout";
import { WorkspaceSection } from "./components/WorkspaceNav/WorkspaceNav";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProjectsView } from "./components/ProjectsView";
import { ImportButton } from "./components/ImportButton";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { OAuthCallback } from "./pages/OAuthCallback";
import { VideoTestPage } from "./pages/VideoTestPage";
import { AuthScreen, LoadingScreen, CreatePodcastScreen } from "./components/Auth";
import { ContentSkeleton } from "./components/ui/ContentSkeleton";
import { useProjectStore } from "./stores/projectStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useAuthStore } from "./stores/authStore";
import { usePodcast } from "./hooks/usePodcast";
import { useEpisodes } from "./hooks/useEpisodes";
import { episodeToProject } from "./lib/episodeToProject";
import { episodeKeys, fetchEpisodeDetail } from "./lib/queries";
import { applyBrandColors, parseBrandColorsFromStorage } from "./lib/colorExtractor";
import type { EpisodeStage } from "./components/EpisodePipeline/EpisodePipeline";
import {
  ROUTE_TO_SUB_STEP,
  type StageStatus,
  type SubStepId,
  cycleStatus,
} from "./lib/statusConfig";

// Lazy-loaded view components — only fetched when their route is first visited
const TranscriptEditor = lazy(() =>
  import("./components/TranscriptEditor/TranscriptEditor").then((m) => ({
    default: m.TranscriptEditor,
  }))
);
const ClipSelector = lazy(() =>
  import("./components/ClipSelector/ClipSelector").then((m) => ({ default: m.ClipSelector }))
);
const VideoEditor = lazy(() =>
  import("./components/VideoEditor").then((m) => ({ default: m.VideoEditor }))
);
const PublishPanel = lazy(() =>
  import("./components/PublishPanel").then((m) => ({ default: m.PublishPanel }))
);
const TextContent = lazy(() =>
  import("./components/TextContent").then((m) => ({ default: m.TextContent }))
);
const PodcastInfoPage = lazy(() =>
  import("./components/PodcastInfo/PodcastInfoPage").then((m) => ({ default: m.PodcastInfoPage }))
);
const PodcastSettingsPage = lazy(() =>
  import("./components/Settings/PodcastSettingsPage").then((m) => ({
    default: m.PodcastSettingsPage,
  }))
);
const Settings = lazy(() =>
  import("./components/Settings/Settings").then((m) => ({ default: m.Settings }))
);

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
  | { kind: "app-settings" }
  | { kind: "video-test" }
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

  if (segments[0] === "__video-test") {
    return import.meta.env.MODE === "production"
      ? { kind: "redirect", to: "/episodes" }
      : { kind: "video-test" };
  }

  switch (segments[0]) {
    case "login":
      return { kind: "login" };
    case "create-podcast":
      return { kind: "create-podcast" };
    case "app-settings":
      return { kind: "app-settings" };
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
    if (
      !isAuthenticated &&
      route.kind !== "login" &&
      route.kind !== "oauth" &&
      route.kind !== "video-test"
    ) {
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

  // Load episode data via React Query — automatically cached, deduplicated, and stale-while-revalidate
  const resolvedEpisodeId =
    route.kind === "episode-route" && resolvedEpisode ? resolvedEpisode.episode.id : null;

  const { data: episodeDetail, isLoading: episodeDetailLoading } = useQuery({
    queryKey: episodeKeys.detail(currentPodcastId ?? "", resolvedEpisodeId ?? ""),
    queryFn: () => fetchEpisodeDetail(currentPodcastId ?? "", resolvedEpisodeId ?? ""),
    enabled: !!currentPodcastId && !!resolvedEpisodeId && isAuthenticated && !authLoading,
  });

  // Sync fetched episode data to projectStore
  useEffect(() => {
    if (!episodeDetail) return;
    if (currentProject?.id === episodeDetail.id) return;

    // Preserve the user's active transcript selection across reloads
    const storeState = useProjectStore.getState();
    const currentActiveId =
      storeState.currentProject?.activeTranscriptId ??
      storeState.projects.find((p) => p.id === episodeDetail.id)?.activeTranscriptId;
    setCurrentProject(episodeToProject(episodeDetail, currentActiveId));
  }, [episodeDetail, currentProject?.id, setCurrentProject]);

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

  const renderViewContent = () => {
    // Show skeleton while episode data is loading for non-list views
    if (
      currentView !== "projects" &&
      route.kind === "episode-route" &&
      episodeDetailLoading &&
      !currentProject
    ) {
      return <ContentSkeleton />;
    }

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
        return <TranscriptEditor />;
      case "clips":
        return <ClipSelector />;
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

  const renderView = () => (
    <Suspense fallback={<ContentSkeleton />}>{renderViewContent()}</Suspense>
  );

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
        return (
          <Suspense fallback={<ContentSkeleton />}>
            <PodcastInfoPage />
          </Suspense>
        );
      case "settings":
        return (
          <Suspense fallback={<ContentSkeleton />}>
            <PodcastSettingsPage />
          </Suspense>
        );
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

  // Compute the next pipeline step for the breadcrumb navigation button
  const nextStepInfo = useMemo(() => {
    if (!hasEpisodeContext || !activeSubStage) return null;

    const steps: Record<
      string,
      { label: string; stage: EpisodeStage; subStage: string; isDisabled: boolean }
    > = {
      // Planning steps
      guests: {
        label: "Topics",
        stage: "planning",
        subStage: "topics",
        isDisabled: false,
      },
      topics: {
        label: "Notes",
        stage: "planning",
        subStage: "notes",
        isDisabled: false,
      },
      notes: {
        label: "Record",
        stage: "production",
        subStage: "record",
        isDisabled: false,
      },
      // Production / post-production / marketing steps
      record: {
        label: "Transcribe",
        stage: "post-production",
        subStage: "transcript",
        isDisabled: !currentProject?.audioPath,
      },
      transcript: {
        label: "Clips",
        stage: "marketing",
        subStage: "clips",
        isDisabled: !currentProject?.transcript,
      },
      clips: {
        label: "Editor",
        stage: "marketing",
        subStage: "editor",
        isDisabled: !currentProject?.clips?.length,
      },
      editor: {
        label: "Publish",
        stage: "marketing",
        subStage: "export",
        isDisabled: false,
      },
    };

    return steps[activeSubStage] || null;
  }, [
    hasEpisodeContext,
    activeSubStage,
    currentProject?.audioPath,
    currentProject?.transcript,
    currentProject?.clips?.length,
  ]);

  const episodesList = episodes.map((e) => ({ id: e.id, name: e.name }));

  if (route.kind === "redirect") {
    return null;
  }

  if (route.kind === "oauth") {
    return <OAuthCallback />;
  }

  if (route.kind === "video-test") {
    return <VideoTestPage />;
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  // If episodes list hasn't loaded yet and we're on an episode route, show loading
  // (only for the initial list load — once cached this is instant)
  if (
    route.kind === "episode-route" &&
    !resolvedEpisode &&
    (episodesLoading || episodes.length === 0)
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

  // Global app settings (not podcast-specific)
  if (route.kind === "app-settings") {
    return (
      <AppShell
        episodeName={undefined}
        episodes={episodesList}
        onBackToEpisodes={() => navigate("/episodes")}
        onSelectEpisode={handleSelectEpisode}
      >
        <ErrorBoundary>
          <WorkspaceLayout activeSection={lastSection} onNavigate={handleSectionNavigate}>
            <div className="h-full overflow-auto">
              <div className="px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
                <Suspense fallback={<ContentSkeleton />}>
                  <Settings />
                </Suspense>
              </div>
            </div>
          </WorkspaceLayout>
        </ErrorBoundary>
      </AppShell>
    );
  }

  return (
    <AppShell
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
      onNextStep={
        nextStepInfo
          ? () =>
              currentProject?.id &&
              goToEpisodeStage(currentProject.id, nextStepInfo.stage, nextStepInfo.subStage)
          : undefined
      }
      nextStepLabel={nextStepInfo?.label}
      nextStepDisabled={nextStepInfo?.isDisabled}
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
