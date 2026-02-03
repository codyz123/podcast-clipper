import React from "react";
import { StatusCycleButton } from "../ui/StatusCycleButton";
import {
  StageId,
  SubStepId,
  StageStatus,
  STAGE_SUB_STEPS,
  SUB_STEP_LABELS,
  STAGES,
} from "../../lib/statusConfig";
import { cn } from "../../lib/utils";

interface StageColumnProps {
  stageId: StageId;
  stageStatus: StageStatus;
  subStepStatuses: Partial<Record<SubStepId, StageStatus>>;
  onStageStatusChange: (status: StageStatus) => void;
  onSubStepStatusChange: (subStepId: SubStepId, status: StageStatus) => void;
}

export const StageColumn: React.FC<StageColumnProps> = ({
  stageId,
  stageStatus,
  subStepStatuses,
  onStageStatusChange,
  onSubStepStatusChange,
}) => {
  const stage = STAGES.find((s) => s.id === stageId);
  const subSteps = STAGE_SUB_STEPS[stageId];

  if (!stage) return null;

  return (
    <div className="flex flex-col">
      {/* Stage Header */}
      <div
        className={cn(
          "mb-1.5 flex items-center gap-2 pb-1.5",
          "border-b border-[hsl(var(--glass-border)/0.3)]"
        )}
      >
        <StatusCycleButton
          status={stageStatus}
          label={stage.shortLabel}
          onCycle={onStageStatusChange}
          showLabel
          size="sm"
          className="font-semibold"
        />
      </div>

      {/* Sub-steps */}
      <div className="flex flex-col gap-0.5 pl-2">
        {subSteps.map((subStepId) => {
          const subStepStatus = subStepStatuses[subStepId] || "not-started";
          const label = SUB_STEP_LABELS[subStepId];

          return (
            <div
              key={subStepId}
              className={cn(
                "flex items-center gap-2 rounded px-1 py-0.5",
                "transition-colors hover:bg-[hsl(var(--surface)/0.3)]"
              )}
            >
              <StatusCycleButton
                status={subStepStatus}
                label={label}
                onCycle={(newStatus) => onSubStepStatusChange(subStepId, newStatus)}
                showLabel
                size="sm"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
