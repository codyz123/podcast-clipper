import React from "react";
import {
  InfoCircledIcon,
  SpeakerLoudIcon,
  MixerHorizontalIcon,
  RocketIcon,
  Share1Icon,
  Pencil1Icon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";

export type EpisodeStage =
  | "info"
  | "planning"
  | "production"
  | "post-production"
  | "distribution"
  | "marketing";

export type PlanningSubStage = "guests" | "topics" | "notes";

export type StageStatus = "not-started" | "in-progress" | "complete";

interface StageConfig {
  id: EpisodeStage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const stages: StageConfig[] = [
  { id: "info", label: "Episode Info", icon: InfoCircledIcon },
  { id: "planning", label: "Planning", icon: Pencil1Icon },
  { id: "production", label: "Production", icon: SpeakerLoudIcon, disabled: true },
  { id: "post-production", label: "Post", icon: MixerHorizontalIcon, disabled: true },
  { id: "distribution", label: "Distribution", icon: RocketIcon, disabled: true },
  { id: "marketing", label: "Marketing", icon: Share1Icon },
];

interface EpisodePipelineProps {
  activeStage: EpisodeStage;
  stageStatus?: Partial<Record<EpisodeStage, StageStatus>>;
  onStageChange: (stage: EpisodeStage) => void;
}

export const EpisodePipeline: React.FC<EpisodePipelineProps> = ({
  activeStage,
  stageStatus = {},
  onStageChange,
}) => {
  const getStatusColor = (stage: EpisodeStage): string => {
    const status = stageStatus[stage] || "not-started";
    switch (status) {
      case "complete":
        return "bg-[hsl(var(--success))]";
      case "in-progress":
        return "bg-[hsl(var(--cyan))]";
      default:
        return "bg-[hsl(var(--text-ghost)/0.3)]";
    }
  };

  return (
    <div
      className={cn(
        "flex h-11 items-center gap-1 px-4",
        "bg-[hsl(var(--void))]",
        "border-b border-[hsl(var(--border-subtle))]"
      )}
    >
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        const isActive = activeStage === stage.id;
        const isDisabled = stage.disabled;

        return (
          <React.Fragment key={stage.id}>
            <button
              onClick={() => !isDisabled && onStageChange(stage.id)}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5",
                "transition-all duration-150",
                isActive
                  ? cn(
                      "bg-[hsl(var(--cyan)/0.15)]",
                      "text-[hsl(var(--cyan))]",
                      "border border-[hsl(var(--cyan)/0.3)]"
                    )
                  : isDisabled
                    ? "cursor-not-allowed text-[hsl(var(--text-ghost)/0.4)]"
                    : cn(
                        "text-[hsl(var(--text-ghost))]",
                        "hover:bg-[hsl(var(--surface))]",
                        "hover:text-[hsl(var(--text-muted))]"
                      )
              )}
            >
              {/* Status dot */}
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActive ? "bg-[hsl(var(--cyan))]" : getStatusColor(stage.id)
                )}
              />
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{stage.label}</span>
              {isDisabled && (
                <span className="text-[10px] text-[hsl(var(--text-ghost)/0.4)] uppercase">
                  Soon
                </span>
              )}
            </button>

            {/* Connector */}
            {index < stages.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px w-4",
                  stageStatus[stage.id] === "complete"
                    ? "bg-[hsl(var(--success)/0.5)]"
                    : "bg-[hsl(var(--border-subtle))]"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default EpisodePipeline;
