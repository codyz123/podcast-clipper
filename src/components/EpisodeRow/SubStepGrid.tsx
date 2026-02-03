import React from "react";
import { StageColumn } from "./StageColumn";
import {
  StageId,
  SubStepId,
  StageStatus,
  STAGES,
  StageStatusWithSubSteps,
} from "../../lib/statusConfig";
import { cn } from "../../lib/utils";

interface SubStepGridProps {
  stageStatus: StageStatusWithSubSteps;
  onStageStatusChange: (stageId: StageId, status: StageStatus) => void;
  onSubStepStatusChange: (subStepId: SubStepId, status: StageStatus) => void;
}

export const SubStepGrid: React.FC<SubStepGridProps> = ({
  stageStatus,
  onStageStatusChange,
  onSubStepStatusChange,
}) => {
  // Extract sub-step statuses from stageStatus
  const subStepStatuses = stageStatus.subSteps || {};

  // Convert sub-step statuses to a simple Record<SubStepId, StageStatus>
  const getSubStepStatus = (subStepId: SubStepId): StageStatus => {
    const entry = subStepStatuses[subStepId];
    return (entry?.status as StageStatus) || "not-started";
  };

  const subStepStatusMap: Partial<Record<SubStepId, StageStatus>> = {};
  Object.keys(subStepStatuses).forEach((key) => {
    const subStepId = key as SubStepId;
    subStepStatusMap[subStepId] = getSubStepStatus(subStepId);
  });

  return (
    <div
      className={cn(
        "mt-3 overflow-x-auto rounded-lg",
        "border border-[hsl(var(--glass-border)/0.5)]",
        "bg-[hsl(var(--surface)/0.3)]",
        "p-3"
      )}
    >
      <div className="grid min-w-[700px] grid-cols-5 gap-3">
        {STAGES.map((stage) => {
          const stageEntry = stageStatus[stage.id];
          const currentStageStatus = (stageEntry?.status as StageStatus) || "not-started";

          return (
            <StageColumn
              key={stage.id}
              stageId={stage.id}
              stageStatus={currentStageStatus}
              subStepStatuses={subStepStatusMap}
              onStageStatusChange={(status) => onStageStatusChange(stage.id, status)}
              onSubStepStatusChange={onSubStepStatusChange}
            />
          );
        })}
      </div>
    </div>
  );
};
