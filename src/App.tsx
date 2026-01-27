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

function App() {
  const [currentView, setCurrentView] = useState<ViewType>("projects");
  const { currentProject } = useProjectStore();

  // Reset to projects view when project is cleared
  useEffect(() => {
    if (!currentProject && currentView !== "projects" && currentView !== "settings") {
      setCurrentView("projects");
    }
  }, [currentProject, currentView]);

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
