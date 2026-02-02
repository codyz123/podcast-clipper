import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { ChevronDownIcon, ExitIcon, PlusIcon } from "@radix-ui/react-icons";
import { usePodcast } from "../../hooks/usePodcast";

export function UserMenu() {
  const { user, logout, podcasts, currentPodcastId, setCurrentPodcast } = useAuthStore();
  const { createPodcast } = usePodcast();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newPodcastName, setNewPodcastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-medium text-white">
            {initials}
          </div>
        )}
        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {/* User info */}
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>

          {/* Podcast switcher */}
          <div className="border-b border-gray-200 px-2 py-2 dark:border-gray-700">
            <p className="px-2 pb-1 text-xs font-medium text-gray-500 uppercase">Podcasts</p>
            {podcasts.map((podcast) => (
              <button
                key={podcast.id}
                onClick={() => {
                  setCurrentPodcast(podcast.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  podcast.id === currentPodcastId
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <span className="flex-1 truncate">{podcast.name}</span>
                {podcast.role === "owner" && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
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
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={!newPodcastName.trim() || isSubmitting}
                    className="flex-1 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmitting ? "..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewPodcastName("");
                    }}
                    className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
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
                logout();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
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
