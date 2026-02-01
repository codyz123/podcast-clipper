import React from "react";
import { cn } from "../lib/utils";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description = "This feature is coming soon.",
  icon,
}) => {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md px-6 text-center">
        {icon && (
          <div className="mb-4 flex justify-center">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl",
                "bg-[hsl(var(--surface))]",
                "border border-[hsl(var(--border-subtle))]"
              )}
            >
              {icon}
            </div>
          </div>
        )}
        <h2 className="text-2xl font-semibold text-[hsl(var(--text))]">{title}</h2>
        <p className="mt-3 text-[hsl(var(--text-muted))]">{description}</p>
        <div className="mt-6">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2",
              "bg-[hsl(var(--cyan)/0.1)]",
              "text-sm text-[hsl(var(--cyan))]"
            )}
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--cyan))]" />
            Coming Soon
          </span>
        </div>
      </div>
    </div>
  );
};

export default PlaceholderPage;
