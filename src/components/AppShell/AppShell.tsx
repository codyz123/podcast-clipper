import React, { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  BellIcon,
  PersonIcon,
  CheckIcon,
  InfoCircledIcon,
  Pencil1Icon,
  SpeakerLoudIcon,
  MixerHorizontalIcon,
  RocketIcon,
  Share1Icon,
  // Sub-stage icons
  TextIcon,
  ScissorsIcon,
  VideoIcon,
  DownloadIcon,
  ChatBubbleIcon,
  FileTextIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import type { EpisodeStage } from "../EpisodePipeline/EpisodePipeline";
import { UserMenu } from "../Auth/UserMenu";
import { StageStatusIndicator } from "./StageStatusIndicator";
import { StatusDropdown } from "../ui/StatusDropdown";
import type { StageStatus, SubStepId } from "../../lib/statusConfig";
import {
  SUB_STEP_LABELS,
  STAGE_SUB_STEPS,
  type StageStatusWithSubSteps,
} from "../../lib/statusConfig";

// Sub-stage types for each workflow
export type ProductionSubStage = "record";
export type PostProductionSubStage = "transcript";
export type MarketingSubStage = "clips" | "editor" | "export" | "text-content";

interface Episode {
  id: string;
  name: string;
}

interface StageOption {
  id: EpisodeStage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

interface SubStageOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const stageOptions: StageOption[] = [
  { id: "info", label: "Episode Info", icon: InfoCircledIcon },
  { id: "planning", label: "Planning", icon: Pencil1Icon },
  { id: "production", label: "Production", icon: SpeakerLoudIcon },
  { id: "post-production", label: "Post", icon: MixerHorizontalIcon },
  { id: "distribution", label: "Distribution", icon: RocketIcon, disabled: true },
  { id: "marketing", label: "Marketing", icon: Share1Icon },
];

const planningSubStages: SubStageOption[] = [
  { id: "guests", label: "Guests", icon: PersonIcon },
  { id: "topics", label: "Topics", icon: ChatBubbleIcon },
  { id: "notes", label: "Notes", icon: FileTextIcon },
];

const productionSubStages: SubStageOption[] = [
  { id: "record", label: "Record", icon: SpeakerLoudIcon },
];

const postProductionSubStages: SubStageOption[] = [
  { id: "transcript", label: "Transcribe", icon: TextIcon },
];

const marketingSubStages: SubStageOption[] = [
  { id: "clips", label: "Clips", icon: ScissorsIcon },
  { id: "editor", label: "Editor", icon: VideoIcon },
  { id: "text-content", label: "Text Content", icon: FileTextIcon },
  { id: "export", label: "Publish", icon: DownloadIcon },
];

// Get sub-stages for a given stage
const getSubStagesForStage = (stage: EpisodeStage): SubStageOption[] => {
  if (stage === "planning") return planningSubStages;
  if (stage === "production") return productionSubStages;
  if (stage === "post-production") return postProductionSubStages;
  if (stage === "marketing") return marketingSubStages;
  return [];
};

interface AppShellProps {
  children: React.ReactNode;
  // Episode breadcrumb
  episodeName?: string;
  episodes?: Episode[];
  onBackToEpisodes?: () => void;
  onSelectEpisode?: (episodeId: string) => void;
  // Stage navigation
  activeStage?: EpisodeStage;
  onStageChange?: (stage: EpisodeStage) => void;
  // Sub-stage navigation
  activeSubStage?: string;
  onSubStageChange?: (subStage: string) => void;
  // Stage status
  stageStatus?: StageStatus;
  onStageStatusClick?: () => void;
  // Sub-step status (for granular tracking)
  subStepId?: SubStepId;
  subStepStatus?: StageStatus;
  onSubStepStatusClick?: () => void;
  // Marketing sub-steps (for dropdown on marketing pages)
  stageStatusWithSubSteps?: StageStatusWithSubSteps;
  onMarketingSubStepStatusChange?: (subStepId: string, status: StageStatus) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  episodeName,
  episodes = [],
  onBackToEpisodes,
  onSelectEpisode,
  activeStage,
  onStageChange,
  activeSubStage,
  onSubStageChange,
  stageStatus,
  onStageStatusClick,
  subStepId,
  subStepStatus,
  onSubStepStatusClick,
  stageStatusWithSubSteps,
  onMarketingSubStepStatusChange,
}) => {
  const [megaDropdownOpen, setMegaDropdownOpen] = useState(false);
  const [hoveredStage, setHoveredStage] = useState<EpisodeStage | null>(null);

  const currentStageOption = stageOptions.find((s) => s.id === activeStage);

  // Get sub-stages based on current or hovered stage
  const getSubStages = (): SubStageOption[] => {
    const stage = hoveredStage || activeStage;
    if (!stage) return [];
    return getSubStagesForStage(stage);
  };

  const subStages = getSubStages();
  const currentSubStage = subStages.find((s) => s.id === activeSubStage);

  // The stage to show sub-stages for (hovered or active)
  const displayStage = hoveredStage || activeStage;
  const displaySubStages = displayStage ? getSubStagesForStage(displayStage) : [];

  const closeMegaDropdown = () => {
    setMegaDropdownOpen(false);
    setHoveredStage(null);
  };

  const handleStageSelect = (stage: EpisodeStage) => {
    if (onStageChange) {
      onStageChange(stage);
    }
    // If this stage has sub-stages, select the first one
    const stageSubStages = getSubStagesForStage(stage);
    if (stageSubStages.length > 0 && onSubStageChange) {
      onSubStageChange(stageSubStages[0].id);
    }
    closeMegaDropdown();
  };

  const handleSubStageSelect = (stage: EpisodeStage, subStageId: string) => {
    // First set the stage if different
    if (stage !== activeStage && onStageChange) {
      onStageChange(stage);
    }
    if (onSubStageChange) {
      onSubStageChange(subStageId);
    }
    closeMegaDropdown();
  };

  const handleEpisodeSelect = (episodeId: string) => {
    if (onSelectEpisode) {
      onSelectEpisode(episodeId);
    }
    closeMegaDropdown();
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(var(--bg-base))]">
      {/* Level 0: Global App Shell - 40px */}
      <header
        className={cn(
          "flex h-10 flex-shrink-0 items-center justify-between px-4",
          "bg-[hsl(var(--void))]",
          "border-b border-[hsl(var(--border-subtle))]"
        )}
      >
        {/* Left: Logo + Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                "bg-[hsl(var(--cyan))]"
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[hsl(var(--bg-base))]"
              >
                {/* Microphone */}
                <rect x="8" y="2" width="8" height="12" rx="4" fill="currentColor" />
                <path d="M12 14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                {/* Small gear for automation */}
                <circle cx="19" cy="19" r="4" fill="currentColor" />
                <circle cx="19" cy="19" r="2" className="fill-[hsl(var(--bg-base)/0.3)]" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[hsl(var(--text))]">Podcastomatic</span>
          </div>

          {/* Breadcrumb Navigation */}
          {episodeName && (
            <>
              <div className="h-4 w-px bg-[hsl(var(--border-subtle))]" />
              <nav className="relative flex items-center gap-1">
                {/* Episodes Link */}
                <button
                  onClick={onBackToEpisodes}
                  className={cn(
                    "text-sm text-[hsl(var(--text-ghost))]",
                    "transition-colors hover:text-[hsl(var(--text-muted))]"
                  )}
                >
                  Episodes
                </button>

                <ChevronRightIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />

                {/* Clickable breadcrumb that opens mega-dropdown */}
                <button
                  onClick={() => setMegaDropdownOpen(!megaDropdownOpen)}
                  className={cn(
                    "flex items-center gap-1 text-sm",
                    "transition-colors hover:text-[hsl(var(--cyan))]"
                  )}
                >
                  <span className="font-medium text-[hsl(var(--text))]">
                    <span className="max-w-[150px] truncate">{episodeName}</span>
                  </span>
                  {activeStage && onStageChange && (
                    <>
                      <ChevronRightIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />
                      <span className="font-medium text-[hsl(var(--text))]">
                        {currentStageOption?.label || activeStage}
                      </span>
                    </>
                  )}
                  {subStages.length > 0 && activeSubStage && onSubStageChange && (
                    <>
                      <ChevronRightIcon className="h-3 w-3 text-[hsl(var(--text-ghost))]" />
                      <span className="font-medium text-[hsl(var(--cyan))]">
                        {currentSubStage?.label || activeSubStage}
                      </span>
                    </>
                  )}
                  <ChevronDownIcon className="ml-1 h-3 w-3 opacity-60" />
                </button>

                {/* Mega Dropdown */}
                {megaDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={closeMegaDropdown} />
                    <div
                      className={cn(
                        "absolute top-full left-0 z-50 mt-1 flex rounded-lg",
                        "bg-[hsl(var(--surface))]",
                        "border border-[hsl(var(--border-subtle))]",
                        "shadow-lg shadow-black/20",
                        "overflow-hidden"
                      )}
                    >
                      {/* Column 1: Episodes */}
                      <div className="w-[180px] border-r border-[hsl(var(--border-subtle))]">
                        <div className="border-b border-[hsl(var(--border-subtle))] px-3 py-2 text-[10px] font-medium tracking-wider text-[hsl(var(--text-ghost))] uppercase">
                          Episodes
                        </div>
                        <div className="max-h-[300px] overflow-y-auto py-1">
                          {episodes.slice(0, 8).map((episode) => (
                            <button
                              key={episode.id}
                              onClick={() => handleEpisodeSelect(episode.id)}
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-sm",
                                episode.name === episodeName
                                  ? "bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))]"
                                  : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                              )}
                            >
                              {episode.name === episodeName && (
                                <CheckIcon className="h-3 w-3 flex-shrink-0" />
                              )}
                              <span
                                className={cn(
                                  "truncate",
                                  episode.name === episodeName ? "" : "ml-5"
                                )}
                              >
                                {episode.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Column 2: Stages */}
                      {activeStage && onStageChange && (
                        <div
                          className={cn(
                            "w-[160px]",
                            displaySubStages.length > 0 &&
                              "border-r border-[hsl(var(--border-subtle))]"
                          )}
                        >
                          <div className="border-b border-[hsl(var(--border-subtle))] px-3 py-2 text-[10px] font-medium tracking-wider text-[hsl(var(--text-ghost))] uppercase">
                            Stage
                          </div>
                          <div className="py-1">
                            {stageOptions.map((stage) => {
                              const Icon = stage.icon;
                              const isActive = activeStage === stage.id;
                              const isHovered = hoveredStage === stage.id;
                              const hasSubStages = getSubStagesForStage(stage.id).length > 0;
                              return (
                                <button
                                  key={stage.id}
                                  onClick={() => !stage.disabled && handleStageSelect(stage.id)}
                                  onMouseEnter={() => !stage.disabled && setHoveredStage(stage.id)}
                                  disabled={stage.disabled}
                                  className={cn(
                                    "flex w-full items-center gap-2 px-3 py-2 text-sm",
                                    stage.disabled
                                      ? "cursor-not-allowed text-[hsl(var(--text-ghost)/0.5)]"
                                      : isActive || isHovered
                                        ? "bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))]"
                                        : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                                  )}
                                >
                                  <Icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="flex-1 text-left">{stage.label}</span>
                                  {stage.disabled && (
                                    <span className="text-[10px] uppercase opacity-50">Soon</span>
                                  )}
                                  {!stage.disabled && hasSubStages && (
                                    <ChevronRightIcon className="h-3 w-3 opacity-50" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Column 3: Sub-stages (only if hovered/active stage has them) */}
                      {displaySubStages.length > 0 && onSubStageChange && (
                        <div className="w-[140px]">
                          <div className="border-b border-[hsl(var(--border-subtle))] px-3 py-2 text-[10px] font-medium tracking-wider text-[hsl(var(--text-ghost))] uppercase">
                            {displayStage === "planning" ? "Planning" : "Workflow"}
                          </div>
                          <div className="py-1">
                            {displaySubStages.map((subStage) => {
                              const isActive =
                                activeSubStage === subStage.id && displayStage === activeStage;
                              const SubStageIcon = subStage.icon;
                              return (
                                <button
                                  key={subStage.id}
                                  onClick={() => handleSubStageSelect(displayStage!, subStage.id)}
                                  className={cn(
                                    "flex w-full items-center gap-2 px-3 py-2 text-sm",
                                    isActive
                                      ? "bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))]"
                                      : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-[hsl(var(--text))]"
                                  )}
                                >
                                  <SubStageIcon className="h-4 w-4 flex-shrink-0" />
                                  <span>{subStage.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </nav>
            </>
          )}
        </div>

        {/* Right: Notifications + Account */}
        <div className="flex items-center gap-1">
          {/* Stage Status Indicator - show dropdown for marketing, sub-step for others */}
          {activeStage && activeStage !== "info" && (
            <>
              {activeStage === "marketing" && onMarketingSubStepStatusChange ? (
                // Marketing pages show a dropdown with all marketing sub-steps
                <StatusDropdown
                  label="Marketing"
                  items={STAGE_SUB_STEPS.marketing.map((subStepId) => {
                    const subStepEntry = stageStatusWithSubSteps?.subSteps?.[subStepId];
                    const status = (subStepEntry?.status as StageStatus) || "not-started";
                    return {
                      id: subStepId,
                      label: SUB_STEP_LABELS[subStepId],
                      status,
                    };
                  })}
                  onStatusChange={onMarketingSubStepStatusChange}
                />
              ) : subStepId && onSubStepStatusClick ? (
                <StageStatusIndicator
                  status={subStepStatus || "not-started"}
                  stageName={activeStage}
                  displayName={SUB_STEP_LABELS[subStepId]}
                  onClick={onSubStepStatusClick}
                />
              ) : onStageStatusClick ? (
                <StageStatusIndicator
                  status={stageStatus || "not-started"}
                  stageName={activeStage}
                  onClick={onStageStatusClick}
                />
              ) : null}
              <div className="h-4 w-px bg-[hsl(var(--border-subtle))]" />
            </>
          )}

          {/* Notifications */}
          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              "text-[hsl(var(--text-ghost))]",
              "hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text-muted))]",
              "transition-colors"
            )}
            title="Notifications"
          >
            <BellIcon className="h-4 w-4" />
          </button>

          {/* User Menu */}
          <UserMenu />
        </div>
      </header>

      {/* Content Area - Everything below the app shell */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
};

export default AppShell;
