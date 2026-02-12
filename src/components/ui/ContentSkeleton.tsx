import { cn } from "../../lib/utils";

export function ContentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse px-4 py-8">
      {/* Title bar */}
      <div className="mb-8">
        <div className="h-7 w-48 rounded-md bg-[hsl(var(--surface))]" />
        <div className="mt-3 h-4 w-72 rounded-md bg-[hsl(var(--surface)/0.6)]" />
      </div>
      {/* Content blocks */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-6">
          <div
            className={cn(
              "rounded-lg border border-[hsl(var(--glass-border)/0.3)] p-5",
              "bg-[hsl(var(--surface)/0.3)]"
            )}
          >
            <div className="mb-3 h-4 w-32 rounded bg-[hsl(var(--surface))]" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-[hsl(var(--surface)/0.6)]" />
              <div className="h-3 w-3/4 rounded bg-[hsl(var(--surface)/0.6)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
