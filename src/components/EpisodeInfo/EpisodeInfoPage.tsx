import React, { useState, useEffect } from "react";
import { CalendarIcon, PersonIcon, FileTextIcon, SpeakerLoudIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { useProjectStore } from "../../stores/projectStore";
import { useEpisodes } from "../../hooks/useEpisodes";
import { StageProgressBar } from "../ui/StageProgressBar";
import { ImportButton } from "../ImportButton";
import type { StageStatus } from "../EpisodePipeline/EpisodePipeline";

interface EpisodeMetadata {
  title: string;
  description: string;
  episodeNumber?: number;
  seasonNumber?: number;
  publishDate?: string;
  showNotes?: string;
  explicit: boolean;
  guests: Guest[];
}

interface Guest {
  id: string;
  name: string;
  bio?: string;
  website?: string;
  twitter?: string;
}

export const EpisodeInfoPage: React.FC = () => {
  const { currentProject, updateProject } = useProjectStore();
  const { updateEpisode, updateStageStatus, error: episodeError } = useEpisodes();

  // Debug: log on mount
  useEffect(() => {
    console.warn("[EpisodeInfoPage] Mounted with project:", currentProject?.id);
  }, [currentProject?.id]);

  const [metadata, setMetadata] = useState<EpisodeMetadata>({
    title: currentProject?.name || "",
    description: currentProject?.description || "",
    episodeNumber: currentProject?.episodeNumber,
    seasonNumber: currentProject?.seasonNumber,
    publishDate: currentProject?.publishDate || "",
    showNotes: currentProject?.showNotes || "",
    explicit: currentProject?.explicit || false,
    guests: currentProject?.guests || [],
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync from store when project changes
  useEffect(() => {
    if (currentProject) {
      setMetadata({
        title: currentProject.name || "",
        description: currentProject.description || "",
        episodeNumber: currentProject.episodeNumber,
        seasonNumber: currentProject.seasonNumber,
        publishDate: currentProject.publishDate || "",
        showNotes: currentProject.showNotes || "",
        explicit: currentProject.explicit || false,
        guests: currentProject.guests || [],
      });
      setIsDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only sync on project identity change; adding full currentProject would overwrite user edits
  }, [currentProject?.id]);

  const handleChange = (
    field: keyof EpisodeMetadata,
    value: string | number | boolean | Guest[] | undefined
  ) => {
    setMetadata((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!currentProject) return;

    console.warn("[EpisodeInfoPage] Saving changes for project:", currentProject.id);
    setIsSaving(true);
    setSaveError(null);
    try {
      const updates = {
        name: metadata.title,
        description: metadata.description,
        episodeNumber: metadata.episodeNumber,
        seasonNumber: metadata.seasonNumber,
        publishDate: metadata.publishDate,
        showNotes: metadata.showNotes,
        explicit: metadata.explicit,
        guests: metadata.guests,
      };
      console.warn("[EpisodeInfoPage] Updates:", updates);

      // Persist to database
      const savedEpisode = await updateEpisode(currentProject.id, updates);
      console.warn("[EpisodeInfoPage] Save result:", savedEpisode);

      if (savedEpisode) {
        // Update local store on success
        updateProject(updates);
        setIsDirty(false);
        setSaveError(null);
        console.warn("[EpisodeInfoPage] Save successful");
      } else {
        // updateEpisode returned null - check for error from hook or show generic message
        console.error(
          "[EpisodeInfoPage] Save failed - updateEpisode returned null. episodeError:",
          episodeError
        );
        setSaveError(episodeError || "Failed to save changes. Please try again.");
      }
    } catch (err) {
      console.error("[EpisodeInfoPage] Save error:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddGuest = () => {
    const newGuest: Guest = {
      id: crypto.randomUUID(),
      name: "",
    };
    handleChange("guests", [...metadata.guests, newGuest]);
  };

  const handleUpdateGuest = (id: string, field: keyof Guest, value: string) => {
    const updatedGuests = metadata.guests.map((g) => (g.id === id ? { ...g, [field]: value } : g));
    handleChange("guests", updatedGuests);
  };

  const handleRemoveGuest = (id: string) => {
    handleChange(
      "guests",
      metadata.guests.filter((g) => g.id !== id)
    );
  };

  const handleStageStatusChange = async (stageId: string, nextStatus: StageStatus) => {
    if (!currentProject) return;

    const previousStageStatus = currentProject.stageStatus || {};
    const updatedStageStatus = {
      ...previousStageStatus,
      [stageId]: { status: nextStatus, updatedAt: new Date().toISOString() },
    };

    updateProject({ stageStatus: updatedStageStatus });

    const result = await updateStageStatus(currentProject.id, stageId, nextStatus);
    if (!result) {
      updateProject({ stageStatus: previousStageStatus });
    }
  };

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[hsl(var(--text-muted))]">No episode selected</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[hsl(var(--text))]">Episode Info</h1>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Edit your episode metadata and details
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all",
              isDirty
                ? "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))] hover:bg-[hsl(var(--cyan)/0.9)]"
                : "cursor-not-allowed bg-[hsl(var(--surface))] text-[hsl(var(--text-ghost))]"
            )}
          >
            {isSaving ? "Saving..." : isDirty ? "Save Changes" : "Saved"}
          </button>
        </div>

        {/* Error Message */}
        {saveError && (
          <div className="mb-6 rounded-lg border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error)/0.1)] p-4">
            <p className="text-sm text-[hsl(var(--error))]">{saveError}</p>
          </div>
        )}

        {/* Pipeline Progress - Full Width */}
        <div className="mb-8">
          <StageProgressBar
            stageStatus={currentProject?.stageStatus}
            fullWidth
            onStageStatusChange={handleStageStatusChange}
          />
        </div>

        {/* Form */}
        <div className="space-y-8">
          {/* Audio Import Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <SpeakerLoudIcon className="h-4 w-4" />
              Audio
            </h2>
            <ImportButton variant="expanded" />
          </section>
          {/* Basic Info Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <FileTextIcon className="h-4 w-4" />
              Basic Information
            </h2>
            <div className="space-y-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              {/* Title */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Episode Title
                </label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="Enter episode title..."
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5",
                    "bg-[hsl(var(--bg-base))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                    "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                  )}
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Description
                </label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Write a brief description of your episode..."
                  rows={4}
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5",
                    "bg-[hsl(var(--bg-base))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                    "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none",
                    "resize-none"
                  )}
                />
              </div>

              {/* Episode/Season Numbers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                    Episode Number
                  </label>
                  <input
                    type="number"
                    value={metadata.episodeNumber || ""}
                    onChange={(e) =>
                      handleChange(
                        "episodeNumber",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    placeholder="e.g., 42"
                    className={cn(
                      "w-full rounded-lg px-4 py-2.5",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                    Season Number
                  </label>
                  <input
                    type="number"
                    value={metadata.seasonNumber || ""}
                    onChange={(e) =>
                      handleChange(
                        "seasonNumber",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    placeholder="e.g., 2"
                    className={cn(
                      "w-full rounded-lg px-4 py-2.5",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                    )}
                  />
                </div>
              </div>

              {/* Explicit Content */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleChange("explicit", !metadata.explicit)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    metadata.explicit ? "bg-[hsl(var(--cyan))]" : "bg-[hsl(var(--surface))]"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                      metadata.explicit ? "left-6" : "left-1"
                    )}
                  />
                </button>
                <label className="text-sm text-[hsl(var(--text))]">Contains explicit content</label>
              </div>
            </div>
          </section>

          {/* Publishing Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <CalendarIcon className="h-4 w-4" />
              Publishing
            </h2>
            <div className="space-y-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              {/* Publish Date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Publish Date
                </label>
                <input
                  type="date"
                  value={metadata.publishDate}
                  onChange={(e) => handleChange("publishDate", e.target.value)}
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5",
                    "bg-[hsl(var(--bg-base))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "text-[hsl(var(--text))]",
                    "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                  )}
                />
              </div>

              {/* Show Notes */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Show Notes
                </label>
                <textarea
                  value={metadata.showNotes}
                  onChange={(e) => handleChange("showNotes", e.target.value)}
                  placeholder="Links, timestamps, resources mentioned in the episode..."
                  rows={6}
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5",
                    "bg-[hsl(var(--bg-base))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                    "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none",
                    "resize-none font-mono text-sm"
                  )}
                />
                <p className="mt-1.5 text-xs text-[hsl(var(--text-ghost))]">
                  Supports markdown formatting
                </p>
              </div>
            </div>
          </section>

          {/* Guests Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <PersonIcon className="h-4 w-4" />
              Guests
            </h2>
            <div className="space-y-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              {metadata.guests.length === 0 ? (
                <p className="py-4 text-center text-sm text-[hsl(var(--text-ghost))]">
                  No guests added yet
                </p>
              ) : (
                <div className="space-y-4">
                  {metadata.guests.map((guest, index) => (
                    <div
                      key={guest.id}
                      className="rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))] p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-medium text-[hsl(var(--text-ghost))] uppercase">
                          Guest {index + 1}
                        </span>
                        <button
                          onClick={() => handleRemoveGuest(guest.id)}
                          className="text-xs text-[hsl(var(--error))] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-3">
                        <input
                          type="text"
                          value={guest.name}
                          onChange={(e) => handleUpdateGuest(guest.id, "name", e.target.value)}
                          placeholder="Guest name"
                          className={cn(
                            "w-full rounded-lg px-3 py-2",
                            "bg-[hsl(var(--surface))]",
                            "border border-[hsl(var(--border-subtle))]",
                            "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                            "text-sm",
                            "focus:border-[hsl(var(--cyan))] focus:outline-none"
                          )}
                        />
                        <input
                          type="text"
                          value={guest.bio || ""}
                          onChange={(e) => handleUpdateGuest(guest.id, "bio", e.target.value)}
                          placeholder="Short bio"
                          className={cn(
                            "w-full rounded-lg px-3 py-2",
                            "bg-[hsl(var(--surface))]",
                            "border border-[hsl(var(--border-subtle))]",
                            "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                            "text-sm",
                            "focus:border-[hsl(var(--cyan))] focus:outline-none"
                          )}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="url"
                            value={guest.website || ""}
                            onChange={(e) => handleUpdateGuest(guest.id, "website", e.target.value)}
                            placeholder="Website URL"
                            className={cn(
                              "w-full rounded-lg px-3 py-2",
                              "bg-[hsl(var(--surface))]",
                              "border border-[hsl(var(--border-subtle))]",
                              "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                              "text-sm",
                              "focus:border-[hsl(var(--cyan))] focus:outline-none"
                            )}
                          />
                          <input
                            type="text"
                            value={guest.twitter || ""}
                            onChange={(e) => handleUpdateGuest(guest.id, "twitter", e.target.value)}
                            placeholder="@twitter"
                            className={cn(
                              "w-full rounded-lg px-3 py-2",
                              "bg-[hsl(var(--surface))]",
                              "border border-[hsl(var(--border-subtle))]",
                              "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                              "text-sm",
                              "focus:border-[hsl(var(--cyan))] focus:outline-none"
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleAddGuest}
                className={cn(
                  "w-full rounded-lg border border-dashed border-[hsl(var(--border-subtle))] py-3",
                  "text-sm text-[hsl(var(--text-muted))]",
                  "hover:border-[hsl(var(--cyan))] hover:text-[hsl(var(--cyan))]",
                  "transition-colors"
                )}
              >
                + Add Guest
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default EpisodeInfoPage;
