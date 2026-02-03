import React from "react";
import { EpisodeStage, PlanningSubStage } from "./EpisodePipeline/EpisodePipeline";
import { EpisodeInfoPage } from "./EpisodeInfo/EpisodeInfoPage";
import { PlanningPage } from "./Planning/PlanningPage";

export type ViewType =
  | "projects"
  | "info"
  | "planning"
  | "record"
  | "transcript"
  | "clips"
  | "editor"
  | "export"
  | "text-content";

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  activeStage?: EpisodeStage;
  activeSubStage?: string;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  activeStage,
  activeSubStage,
}) => {
  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
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
            <PlanningPage activeSubStage={(activeSubStage as PlanningSubStage) || "guests"} />
          ) : currentView === "editor" ? (
            <div className="h-full">{children}</div>
          ) : (
            <div className="animate-fadeInUp px-6 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</div>
          )}
        </div>
      </main>
    </div>
  );
};
