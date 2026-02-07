import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { ChevronDownIcon, ExitIcon, PlusIcon, GearIcon } from "@radix-ui/react-icons";
import { usePodcast } from "../../hooks/usePodcast";
import { useDropdown } from "../../hooks/useDropdown";
import { cn } from "../../lib/utils";

export function UserMenu() {
  const navigate = useNavigate();
  const { user, logout, podcasts, currentPodcastId, setCurrentPodcast } = useAuthStore();
  const { createPodcast } = usePodcast();
  const { isOpen, close, containerRef, triggerProps, menuProps } = useDropdown();
  const [isCreating, setIsCreating] = useState(false);
  const [newPodcastName, setNewPodcastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const handleCreatePodcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPodcastName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createPodcast(newPodcastName.trim());
      setNewPodcastName("");
      setIsCreating(false);
    } catch (err) {
      console.error("Failed to create podcast:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={containerRef as React.RefObject<HTMLDivElement>}>
      <button
        {...triggerProps}
        className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[hsl(var(--surface-hover))]"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-sm font-medium text-white">
            {initials}
          </div>
        )}
        <ChevronDownIcon className="h-4 w-4 text-[hsl(var(--text-muted))]" />
      </button>

      {isOpen && (
        <div
          {...menuProps}
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] py-2 shadow-lg"
        >
          {/* User info */}
          <div className="border-b border-[hsl(var(--glass-border))] px-4 py-3">
            <p className="font-medium text-[hsl(var(--text))]">{user.name}</p>
            <p className="text-sm text-[hsl(var(--text-muted))]">{user.email}</p>
          </div>

          {/* Podcast switcher */}
          <div className="border-b border-[hsl(var(--glass-border))] px-2 py-2">
            <p className="px-2 pb-1 text-xs font-medium text-[hsl(var(--text-muted))] uppercase">
              Podcasts
            </p>
            {podcasts.map((podcast) => (
              <button
                key={podcast.id}
                onClick={() => {
                  setCurrentPodcast(podcast.id);
                  close();
                }}
                role="menuitem"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  podcast.id === currentPodcastId
                    ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-hover))]"
                )}
              >
                <span className="flex-1 truncate">{podcast.name}</span>
                {podcast.role === "owner" && (
                  <span className="rounded bg-[hsl(var(--surface-hover))] px-1.5 py-0.5 text-xs text-[hsl(var(--text-muted))]">
                    Owner
                  </span>
                )}
              </button>
            ))}

            {/* Create new podcast */}
            {isCreating ? (
              <form onSubmit={handleCreatePodcast} className="mt-2 px-2">
                <input
                  type="text"
                  value={newPodcastName}
                  onChange={(e) => setNewPodcastName(e.target.value)}
                  placeholder="Podcast name..."
                  autoFocus
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] px-3 py-1.5 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))] focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={!newPodcastName.trim() || isSubmitting}
                    className="flex-1 rounded-md bg-[hsl(var(--primary))] px-3 py-1 text-sm font-medium text-white hover:bg-[hsl(var(--primary)/0.9)] disabled:opacity-50"
                  >
                    {isSubmitting ? "..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewPodcastName("");
                    }}
                    className="rounded-md px-3 py-1 text-sm text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-hover))]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface-hover))]"
              >
                <PlusIcon className="h-4 w-4" />
                Create new podcast
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="px-2 pt-2">
            <button
              onClick={() => {
                navigate("/app-settings");
                close();
              }}
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[hsl(var(--text))] transition-colors hover:bg-[hsl(var(--surface-hover))]"
            >
              <GearIcon className="h-4 w-4" />
              Settings
            </button>
            <button
              onClick={() => {
                logout();
                close();
              }}
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[hsl(var(--error))] transition-colors hover:bg-[hsl(var(--error)/0.1)]"
            >
              <ExitIcon className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
