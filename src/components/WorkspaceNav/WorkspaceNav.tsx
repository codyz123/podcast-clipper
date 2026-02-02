import React, { useState } from "react";
import {
  DashboardIcon,
  FileTextIcon,
  EnvelopeClosedIcon,
  BarChartIcon,
  IdCardIcon,
  Link2Icon,
  PinLeftIcon,
  PinRightIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAuthStore } from "../../stores/authStore";

export type WorkspaceSection =
  | "dashboard"
  | "episodes"
  | "outreach"
  | "analytics"
  | "podcast-info"
  | "connections";

interface WorkspaceNavProps {
  activeSection: WorkspaceSection;
  onNavigate: (section: WorkspaceSection) => void;
}

interface NavItemConfig {
  id: WorkspaceSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const navItems: NavItemConfig[] = [
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon, disabled: true },
  { id: "episodes", label: "Episodes", icon: FileTextIcon },
  { id: "outreach", label: "Outreach", icon: EnvelopeClosedIcon, disabled: true },
  { id: "analytics", label: "Analytics", icon: BarChartIcon, disabled: true },
  { id: "podcast-info", label: "Podcast Info", icon: IdCardIcon },
  { id: "connections", label: "Connections", icon: Link2Icon },
];

export const WorkspaceNav: React.FC<WorkspaceNavProps> = ({ activeSection, onNavigate }) => {
  const { podcastMetadata } = useWorkspaceStore();
  const { podcasts, currentPodcastId, setCurrentPodcast, setShowCreatePodcast } = useAuthStore();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isWorkspaceSwitcherOpen, setIsWorkspaceSwitcherOpen] = useState(false);

  // Get current podcast and workspace name
  const currentPodcast = podcasts.find((p) => p.id === currentPodcastId);
  const workspaceName = currentPodcast?.name || podcastMetadata.name || "My Podcast";

  // Sidebar is expanded if pinned OR hovered
  const showExpanded = isPinned || isHovered;

  const handleCreateWorkspace = () => {
    setIsWorkspaceSwitcherOpen(false);
    setShowCreatePodcast(true);
  };

  return (
    <>
      <nav
        className={cn(
          "relative flex flex-shrink-0 flex-col",
          "bg-[hsl(var(--void))]",
          "border-r border-[hsl(var(--border-subtle))]",
          "transition-[width] duration-200 ease-out",
          showExpanded ? "w-[200px]" : "w-12"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Workspace Switcher */}
        <div className="p-2 pt-3 pb-2">
          <div className="relative">
            <button
              onClick={() => setIsWorkspaceSwitcherOpen(!isWorkspaceSwitcherOpen)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg",
                showExpanded ? "px-2.5 py-2" : "justify-center px-2 py-2",
                "bg-[hsl(var(--surface)/0.5)]",
                "border border-[hsl(var(--border-subtle))]",
                "text-sm text-[hsl(var(--text-muted))]",
                "hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]",
                "transition-all duration-150"
              )}
              title={!showExpanded ? workspaceName : undefined}
            >
              {/* Workspace icon/avatar - show cover image if available */}
              {currentPodcast?.coverImageUrl ? (
                <img
                  src={currentPodcast.coverImageUrl}
                  alt={workspaceName}
                  className="h-5 w-5 flex-shrink-0 rounded object-cover"
                />
              ) : podcastMetadata.coverImage ? (
                <img
                  src={podcastMetadata.coverImage}
                  alt={workspaceName}
                  className="h-5 w-5 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <div
                  className={cn(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded",
                    "bg-gradient-to-br from-[hsl(var(--cyan)/0.3)] to-[hsl(var(--magenta)/0.3)]",
                    "text-[10px] font-bold text-[hsl(var(--text))]"
                  )}
                >
                  {workspaceName.charAt(0).toUpperCase()}
                </div>
              )}
              {showExpanded && (
                <>
                  <span className="flex-1 truncate text-left text-[13px]">{workspaceName}</span>
                  <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                </>
              )}
            </button>

            {/* Dropdown */}
            {isWorkspaceSwitcherOpen && showExpanded && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsWorkspaceSwitcherOpen(false)}
                />
                <div
                  className={cn(
                    "absolute top-full left-0 z-50 mt-1 w-full rounded-lg",
                    "bg-[hsl(var(--surface))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "shadow-lg shadow-black/20",
                    "py-1"
                  )}
                >
                  <div className="px-3 py-2 text-[10px] font-medium tracking-wider text-[hsl(var(--text-ghost))] uppercase">
                    Workspaces
                  </div>
                  {podcasts.map((p) => (
                    <button
                      key={p.id}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2",
                        p.id === currentPodcastId
                          ? "bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--text))]"
                          : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                      )}
                      onClick={() => {
                        setCurrentPodcast(p.id);
                        setIsWorkspaceSwitcherOpen(false);
                      }}
                    >
                      {p.id === currentPodcastId && (
                        <div className="h-2 w-2 rounded-full bg-[hsl(var(--cyan))]" />
                      )}
                      <span className="flex-1 truncate text-left text-sm">{p.name}</span>
                      {p.role === "owner" && (
                        <span className="text-[10px] text-[hsl(var(--text-ghost))]">Owner</span>
                      )}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[hsl(var(--border-subtle))]" />
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2",
                      "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]",
                      "text-sm whitespace-nowrap"
                    )}
                    onClick={handleCreateWorkspace}
                  >
                    <span className="text-[hsl(var(--cyan))]">+</span>
                    <span>New Podcast</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-2 border-t border-[hsl(var(--border-subtle))]" />

        {/* Nav Items */}
        <div className="flex flex-col gap-1 p-2 pt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const isDisabled = item.disabled;

            return (
              <button
                key={item.id}
                onClick={() => !isDisabled && onNavigate(item.id)}
                disabled={isDisabled}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2",
                  "transition-all duration-150",
                  "overflow-hidden",
                  isActive
                    ? cn("bg-[hsl(var(--cyan)/0.15)]", "text-[hsl(var(--cyan))]")
                    : isDisabled
                      ? "cursor-not-allowed text-[hsl(var(--text-ghost)/0.5)]"
                      : cn(
                          "text-[hsl(var(--text-ghost))]",
                          "hover:bg-[hsl(var(--surface))]",
                          "hover:text-[hsl(var(--text-muted))]"
                        )
                )}
                title={!showExpanded ? item.label : undefined}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span
                  className={cn(
                    "text-sm font-medium whitespace-nowrap",
                    "transition-opacity duration-150",
                    showExpanded ? "opacity-100" : "w-0 opacity-0"
                  )}
                >
                  {item.label}
                </span>
                {isDisabled && showExpanded && (
                  <span className="ml-auto text-[10px] text-[hsl(var(--text-ghost)/0.5)] uppercase">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Pin Button */}
        <div className="p-2 pb-3">
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2",
              "transition-all duration-150",
              isPinned
                ? "text-[hsl(var(--cyan))]"
                : "text-[hsl(var(--text-ghost))] hover:text-[hsl(var(--text-muted))]",
              "hover:bg-[hsl(var(--surface))]"
            )}
            title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {isPinned ? (
              <PinRightIcon className="h-[18px] w-[18px] flex-shrink-0" />
            ) : (
              <PinLeftIcon className="h-[18px] w-[18px] flex-shrink-0" />
            )}
            <span
              className={cn(
                "text-sm font-medium whitespace-nowrap",
                "transition-opacity duration-150",
                showExpanded ? "opacity-100" : "w-0 opacity-0"
              )}
            >
              {isPinned ? "Unpin" : "Pin sidebar"}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default WorkspaceNav;
