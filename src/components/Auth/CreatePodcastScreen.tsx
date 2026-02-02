import { useState } from "react";
import { usePodcast } from "../../hooks/usePodcast";
import { useAuthStore } from "../../stores/authStore";
import { Button, Input } from "../ui";

interface CreatePodcastScreenProps {
  onCancel?: () => void;
}

export function CreatePodcastScreen({ onCancel }: CreatePodcastScreenProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createPodcast } = usePodcast();
  const setShowCreatePodcast = useAuthStore((s) => s.setShowCreatePodcast);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Podcast name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createPodcast(name.trim(), description.trim() || undefined);
      // Clear the create flag so we go back to the main app
      setShowCreatePodcast(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create podcast");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--bg-base))]">
      <div className="w-full max-w-md px-6">
        <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-[hsl(var(--text))]">Create Your Podcast</h1>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              Get started by creating a workspace for your podcast
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-sm font-medium text-[hsl(var(--text))]"
              >
                Podcast Name
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Podcast"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-1 block text-sm font-medium text-[hsl(var(--text))]"
              >
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's your podcast about?"
                rows={3}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] px-4 py-2.5 text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))] focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className={onCancel ? "flex gap-3" : ""}>
              {onCancel && (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                className={onCancel ? "flex-1" : "w-full"}
                disabled={isSubmitting || !name.trim()}
              >
                {isSubmitting ? "Creating..." : "Create Podcast"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
