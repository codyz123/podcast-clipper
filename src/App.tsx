import { useState, useEffect } from "react";
import { Layout, ViewType } from "./components/Layout";
import { ProjectsView } from "./components/ProjectsView";
import { AudioImport } from "./components/AudioImport/AudioImport";
import { TranscriptEditor } from "./components/TranscriptEditor/TranscriptEditor";
import { ClipSelector } from "./components/ClipSelector/ClipSelector";
import { VideoPreview } from "./components/VideoPreview/VideoPreview";
import { ExportPanel } from "./components/ExportPanel/ExportPanel";
import { Settings } from "./components/Settings/Settings";
import { useProjectStore } from "./stores/projectStore";

// Keys for persisting navigation state
const VIEW_STORAGE_KEY = "podcast-clipper-current-view";
const PROJECT_ID_STORAGE_KEY = "podcast-clipper-current-project-id";

function App() {
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return (stored as ViewType) || "projects";
  });
  const [isRestoring, setIsRestoring] = useState(true);
  const { currentProject, loadProject } = useProjectStore();

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

  const renderView = () => {
    switch (currentView) {
      case "projects":
        return <ProjectsView onProjectLoad={() => setCurrentView("import")} />;
      case "import":
        return <AudioImport onComplete={() => setCurrentView("transcript")} />;
      case "transcript":
        return <TranscriptEditor onComplete={() => setCurrentView("clips")} />;
      case "clips":
        return <ClipSelector onComplete={() => setCurrentView("preview")} />;
      case "preview":
        return <VideoPreview onComplete={() => setCurrentView("export")} />;
      case "export":
        return <ExportPanel />;
      case "settings":
        return <Settings />;
      default:
        return <ProjectsView onProjectLoad={() => setCurrentView("import")} />;
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {renderView()}
    </Layout>
  );
}

export default App;
