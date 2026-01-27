import React from "react";
import {
  FileIcon,
  SpeakerLoudIcon,
  TextIcon,
  ScissorsIcon,
  VideoIcon,
  DownloadIcon,
  GearIcon,
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
}

const navItems: NavItem[] = [
  { id: "projects", label: "Projects", icon: FileIcon },
  { id: "import", label: "Import", icon: SpeakerLoudIcon, requiresProject: true },
  { id: "transcript", label: "Transcript", icon: TextIcon, requiresProject: true },
  {
    id: "clips",
    label: "Clips",
    icon: ScissorsIcon,
    requiresProject: true,
    requiresTranscript: true,
  },
  {
    id: "preview",
    label: "Preview",
    icon: VideoIcon,
    requiresProject: true,
    requiresClips: true,
  },
  {
    id: "export",
    label: "Export",
    icon: DownloadIcon,
    requiresProject: true,
    requiresClips: true,
  },
];

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onViewChange,
}) => {
  const { currentProject } = useProjectStore();

  const hasProject = !!currentProject;
  const hasTranscript = !!currentProject?.transcript;
  const hasClips = (currentProject?.clips?.length ?? 0) > 0;

  const isNavItemEnabled = (item: NavItem): boolean => {
    if (item.requiresProject && !hasProject) return false;
    if (item.requiresTranscript && !hasTranscript) return false;
    if (item.requiresClips && !hasClips) return false;
    return true;
  };

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[hsl(var(--border))] flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-[hsl(var(--border))]">
          <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">
            Podcast Clipper
          </h1>
          {currentProject && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 truncate">
              {currentProject.name}
            </p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const enabled = isNavItemEnabled(item);

            return (
              <button
                key={item.id}
                onClick={() => enabled && onViewChange(item.id)}
                disabled={!enabled}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  currentView === item.id
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : enabled
                      ? "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                      : "text-[hsl(var(--muted-foreground))] cursor-not-allowed opacity-50"
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="p-2 border-t border-[hsl(var(--border))]">
          <button
            onClick={() => onViewChange("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              currentView === "settings"
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
            )}
          >
            <GearIcon className="w-5 h-5" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};
