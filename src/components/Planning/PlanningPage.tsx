import React from "react";
import { PersonIcon, ChatBubbleIcon, FileTextIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { PlanningSubStage } from "../EpisodePipeline/EpisodePipeline";

interface PlanningPageProps {
  activeSubStage: PlanningSubStage;
}

export const PlanningPage: React.FC<PlanningPageProps> = ({ activeSubStage }) => {
  const renderSubStageContent = () => {
    switch (activeSubStage) {
      case "guests":
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className={cn(
                "mb-6 flex h-16 w-16 items-center justify-center rounded-xl",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--border-subtle))]"
              )}
            >
              <PersonIcon className="h-8 w-8 text-[hsl(var(--cyan))]" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-[hsl(var(--text))]">Guests</h3>
            <p className="max-w-md text-sm text-[hsl(var(--text-muted))]">
              Manage your episode guests, their contact information, and talking points. Track RSVPs
              and schedule recording sessions.
            </p>
            <div className="mt-6 rounded-lg bg-[hsl(var(--cyan)/0.1)] px-4 py-2 text-sm text-[hsl(var(--cyan))]">
              Coming soon
            </div>
          </div>
        );

      case "topics":
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className={cn(
                "mb-6 flex h-16 w-16 items-center justify-center rounded-xl",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--border-subtle))]"
              )}
            >
              <ChatBubbleIcon className="h-8 w-8 text-[hsl(var(--magenta))]" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-[hsl(var(--text))]">Topics</h3>
            <p className="max-w-md text-sm text-[hsl(var(--text-muted))]">
              Outline your episode topics, questions to ask, and key points to cover. Create a
              structured rundown for smooth recording.
            </p>
            <div className="mt-6 rounded-lg bg-[hsl(var(--magenta)/0.1)] px-4 py-2 text-sm text-[hsl(var(--magenta))]">
              Coming soon
            </div>
          </div>
        );

      case "notes":
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className={cn(
                "mb-6 flex h-16 w-16 items-center justify-center rounded-xl",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--border-subtle))]"
              )}
            >
              <FileTextIcon className="h-8 w-8 text-[hsl(var(--success))]" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-[hsl(var(--text))]">Notes</h3>
            <p className="max-w-md text-sm text-[hsl(var(--text-muted))]">
              Capture research, background information, and pre-production notes. Keep all your
              episode preparation in one place.
            </p>
            <div className="mt-6 rounded-lg bg-[hsl(var(--success)/0.1)] px-4 py-2 text-sm text-[hsl(var(--success))]">
              Coming soon
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div
          className={cn(
            "rounded-xl",
            "bg-[hsl(var(--surface)/0.3)]",
            "border border-[hsl(var(--border-subtle))]"
          )}
        >
          {renderSubStageContent()}
        </div>
      </div>
    </div>
  );
};

export default PlanningPage;
