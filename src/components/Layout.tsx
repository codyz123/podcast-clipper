import React from "react";
import { FileIcon } from "@radix-ui/react-icons";
import { cn } from "../lib/utils";
import { useProjectStore } from "../stores/projectStore";
import { EpisodeStage, PlanningSubStage } from "./EpisodePipeline/EpisodePipeline";
import { EpisodeInfoPage } from "./EpisodeInfo/EpisodeInfoPage";
import { PlanningPage } from "./Planning/PlanningPage";

export type ViewType =
  | "projects"
  | "import"
  | "transcript"
  | "clips"
  | "editor"
  | "export"
  | "publish"
  | "settings";

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  activeStage: EpisodeStage;
  activePlanningSubStage: PlanningSubStage;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  activeStage,
  activePlanningSubStage,
}) => {
  const { currentProject } = useProjectStore();

  const hasProject = !!currentProject;
  const hasAudio = !!currentProject?.audioPath;
  const hasTranscript = !!currentProject?.transcript;
  const hasClips = (currentProject?.clips?.length ?? 0) > 0;

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      {/* Projects Quick Access - when on project views */}
      {!hasProject && currentView === "projects" && (
        <div
          className={cn(
            "flex h-12 items-center justify-center",
            "bg-gradient-to-r from-[hsl(var(--cyan)/0.05)] via-transparent to-[hsl(var(--magenta)/0.05)]",
            "border-b border-[hsl(0_0%_100%/0.04)]"
          )}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <FileIcon className="h-4 w-4 text-[hsl(var(--cyan))]" />
            <span className="text-[hsl(var(--text-muted))]">
              Select a project to begin your workflow
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="relative flex-1 overflow-hidden">
        {/* Decorative gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-[hsl(var(--cyan)/0.03)] blur-[100px]" />
          <div className="absolute -bottom-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-[hsl(var(--magenta)/0.03)] blur-[100px]" />
        </div>

        <div className="relative h-full overflow-auto">
          {activeStage === "info" && currentView !== "projects" ? (
            <EpisodeInfoPage />
          ) : activeStage === "planning" && currentView !== "projects" ? (
            <PlanningPage activeSubStage={activePlanningSubStage} />
          ) : (
            <div className="animate-fadeInUp px-6 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</div>
          )}
        </div>
      </main>

      {/* Bottom Status Bar */}
      {hasProject && (
        <footer
          className={cn(
            "flex h-8 items-center justify-between px-4",
            "bg-[hsl(var(--void)/0.95)]",
            "border-t border-[hsl(0_0%_100%/0.04)]"
          )}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  hasClips
                    ? "bg-[hsl(var(--success))]"
                    : hasTranscript
                      ? "bg-[hsl(var(--cyan))]"
                      : "bg-[hsl(var(--magenta))]",
                  "shadow-[0_0_6px_currentColor]"
                )}
              />
              <span className="text-[11px] font-medium text-[hsl(var(--text-ghost))]">
                {hasClips
                  ? "Ready to export"
                  : hasTranscript
                    ? "Transcript ready"
                    : hasAudio
                      ? "Audio loaded"
                      : "Waiting for audio"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-[hsl(var(--text-ghost))]">
              {currentProject?.clips?.length || 0} clips
            </span>
            <span className="text-[10px] text-[hsl(var(--text-ghost))]">•</span>
            <span className="font-mono text-[10px] text-[hsl(var(--text-ghost))]">
              {currentProject?.transcript?.words?.length || 0} words
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};
