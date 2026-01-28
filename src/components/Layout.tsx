import React from "react";
import {
  FileIcon,
  SpeakerLoudIcon,
  TextIcon,
  ScissorsIcon,
  VideoIcon,
  DownloadIcon,
  GearIcon,
  CheckIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import { cn } from "../lib/utils";
import { useProjectStore } from "../stores/projectStore";

export type ViewType =
  | "projects"
  | "import"
  | "transcript"
  | "clips"
  | "preview"
  | "export"
  | "settings";

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

interface NavItem {
  id: ViewType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresProject?: boolean;
  requiresTranscript?: boolean;
  requiresClips?: boolean;
  step?: number;
}

const workflowItems: NavItem[] = [
  { id: "import", label: "Import", icon: SpeakerLoudIcon, requiresProject: true, step: 1 },
  { id: "transcript", label: "Transcribe", icon: TextIcon, requiresProject: true, step: 2 },
  { id: "clips", label: "Clips", icon: ScissorsIcon, requiresProject: true, requiresTranscript: true, step: 3 },
  { id: "preview", label: "Preview", icon: VideoIcon, requiresProject: true, requiresClips: true, step: 4 },
  { id: "export", label: "Export", icon: DownloadIcon, requiresProject: true, requiresClips: true, step: 5 },
];

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onViewChange,
}) => {
  const { currentProject } = useProjectStore();

  const hasProject = !!currentProject;
  const hasAudio = !!currentProject?.audioPath;
  const hasTranscript = !!currentProject?.transcript;
  const hasClips = (currentProject?.clips?.length ?? 0) > 0;

  const isNavItemEnabled = (item: NavItem): boolean => {
    if (item.requiresProject && !hasProject) return false;
    if (item.requiresTranscript && !hasTranscript) return false;
    if (item.requiresClips && !hasClips) return false;
    return true;
  };

  const isStepComplete = (item: NavItem): boolean => {
    if (item.step === 1) return hasAudio;
    if (item.step === 2) return hasTranscript;
    if (item.step === 3) return hasClips;
    if (item.step === 4) return hasClips;
    if (item.step === 5) return false;
    return false;
  };

  const getCurrentStep = (): number => {
    if (!hasProject) return 0;
    if (!hasAudio) return 1;
    if (!hasTranscript) return 2;
    if (!hasClips) return 3;
    return 4;
  };

  const currentStep = getCurrentStep();

  return (
    <div className="flex flex-col h-screen overflow-hidden relative z-10">
      {/* Top Bar - Cinematic Header */}
      <header className={cn(
        "h-14 flex items-center justify-between px-5",
        "bg-[hsl(var(--void)/0.95)]",
        "border-b border-[hsl(0_0%_100%/0.06)]",
        "backdrop-blur-xl"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onViewChange("projects")}
            className="flex items-center gap-3 group"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              "bg-gradient-to-br from-[hsl(185_100%_50%)] to-[hsl(200_100%_40%)]",
              "shadow-[0_0_20px_hsl(185_100%_50%/0.4)]",
              "group-hover:shadow-[0_0_30px_hsl(185_100%_50%/0.6)]",
              "transition-shadow duration-300"
            )}>
              <ScissorsIcon className="w-4 h-4 text-[hsl(260_30%_6%)]" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-[15px] text-[hsl(var(--text))] font-[family-name:var(--font-display)] tracking-tight">
                Clipper
              </span>
              <span className="text-[hsl(var(--cyan))] font-bold">.</span>
            </div>
          </button>

          {/* Breadcrumb */}
          {hasProject && currentView !== "projects" && (
            <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l border-[hsl(0_0%_100%/0.08)]">
              <span className="text-[12px] text-[hsl(var(--text-ghost))]">
                {currentProject?.name}
              </span>
              <ChevronRightIcon className="w-3 h-3 text-[hsl(var(--text-ghost))]" />
              <span className="text-[12px] text-[hsl(var(--text-muted))] font-medium">
                {workflowItems.find(i => i.id === currentView)?.label || "Settings"}
              </span>
            </div>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewChange("settings")}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
              currentView === "settings"
                ? "bg-[hsl(var(--surface))] text-[hsl(var(--text))]"
                : "text-[hsl(var(--text-ghost))] hover:text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface)/0.5)]"
            )}
          >
            <GearIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Workflow Timeline - Horizontal Steps */}
      {hasProject && currentView !== "projects" && currentView !== "settings" && (
        <div className={cn(
          "h-16 flex items-center justify-center px-6",
          "bg-[hsl(var(--deep)/0.8)]",
          "border-b border-[hsl(0_0%_100%/0.04)]"
        )}>
          <div className="flex items-center gap-1">
            {workflowItems.map((item, index) => {
              const Icon = item.icon;
              const enabled = isNavItemEnabled(item);
              const complete = isStepComplete(item);
              const isActive = currentView === item.id;
              const isCurrent = item.step === currentStep;

              return (
                <React.Fragment key={item.id}>
                  <button
                    onClick={() => enabled && onViewChange(item.id)}
                    disabled={!enabled}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 rounded-full transition-all duration-300",
                      isActive
                        ? cn(
                            "bg-gradient-to-r from-[hsl(185_100%_50%/0.15)] to-[hsl(185_100%_50%/0.05)]",
                            "border border-[hsl(185_100%_50%/0.3)]",
                            "shadow-[0_0_20px_-5px_hsl(185_100%_50%/0.3),inset_0_1px_0_hsl(185_100%_50%/0.1)]"
                          )
                        : enabled
                          ? "hover:bg-[hsl(var(--surface)/0.5)]"
                          : "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {/* Step indicator */}
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300",
                        isActive
                          ? cn(
                              "bg-gradient-to-br from-[hsl(185_100%_50%)] to-[hsl(185_90%_40%)]",
                              "shadow-[0_0_15px_hsl(185_100%_50%/0.5)]"
                            )
                          : complete
                            ? "bg-[hsl(158_60%_45%)] shadow-[0_0_10px_hsl(158_60%_45%/0.4)]"
                            : isCurrent
                              ? "bg-[hsl(var(--surface))] border-2 border-[hsl(185_100%_50%/0.5)]"
                              : "bg-[hsl(var(--surface))] border border-[hsl(var(--glass-border))]"
                      )}
                    >
                      {complete && !isActive ? (
                        <CheckIcon className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Icon className={cn(
                          "w-3.5 h-3.5",
                          isActive ? "text-[hsl(260_30%_6%)]" : "text-[hsl(var(--text-ghost))]"
                        )} />
                      )}
                    </div>

                    {/* Label - only show on active or larger screens */}
                    <span className={cn(
                      "text-[13px] font-medium transition-all",
                      isActive
                        ? "text-[hsl(var(--text))]"
                        : complete
                          ? "text-[hsl(var(--success))] hidden lg:block"
                          : "text-[hsl(var(--text-ghost))] hidden lg:block"
                    )}>
                      {item.label}
                    </span>
                  </button>

                  {/* Connector line */}
                  {index < workflowItems.length - 1 && (
                    <div className={cn(
                      "w-8 h-px mx-1",
                      complete ? "bg-[hsl(var(--success)/0.5)]" : "bg-[hsl(var(--glass-border))]"
                    )} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Projects Quick Access - when on project views */}
      {!hasProject && currentView === "projects" && (
        <div className={cn(
          "h-12 flex items-center justify-center",
          "bg-gradient-to-r from-[hsl(185_100%_50%/0.05)] via-transparent to-[hsl(325_100%_58%/0.05)]",
          "border-b border-[hsl(0_0%_100%/0.04)]"
        )}>
          <div className="flex items-center gap-2 text-[13px]">
            <FileIcon className="w-4 h-4 text-[hsl(var(--cyan))]" />
            <span className="text-[hsl(var(--text-muted))]">
              Select a project to begin your workflow
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {/* Decorative gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-[hsl(185_100%_50%/0.03)] blur-[100px]" />
          <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-[hsl(325_100%_58%/0.03)] blur-[100px]" />
        </div>

        <div className="relative h-full overflow-auto">
          <div className="animate-fadeInUp px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
            {children}
          </div>
        </div>
      </main>

      {/* Bottom Status Bar */}
      {hasProject && (
        <footer className={cn(
          "h-8 flex items-center justify-between px-4",
          "bg-[hsl(var(--void)/0.95)]",
          "border-t border-[hsl(0_0%_100%/0.04)]"
        )}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                hasClips ? "bg-[hsl(var(--success))]" : hasTranscript ? "bg-[hsl(var(--cyan))]" : "bg-[hsl(var(--magenta))]",
                "shadow-[0_0_6px_currentColor]"
              )} />
              <span className="text-[11px] text-[hsl(var(--text-ghost))] font-medium">
                {hasClips ? "Ready to export" : hasTranscript ? "Transcript ready" : hasAudio ? "Audio loaded" : "Waiting for audio"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-[hsl(var(--text-ghost))] font-mono">
              {currentProject?.clips?.length || 0} clips
            </span>
            <span className="text-[10px] text-[hsl(var(--text-ghost))]">•</span>
            <span className="text-[10px] text-[hsl(var(--text-ghost))] font-mono">
              {currentProject?.transcript?.words?.length || 0} words
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};
