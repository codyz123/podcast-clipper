import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ImageIcon,
  Link2Icon,
  GlobeIcon,
  TrashIcon,
  PersonIcon,
  EnvelopeClosedIcon,
  Cross2Icon,
  CameraIcon,
} from "@radix-ui/react-icons";
import { cn, debounce } from "../../lib/utils";
import { useWorkspaceStore, PodcastMetadata } from "../../stores/workspaceStore";
import { extractBrandColors, parseBrandColorsFromStorage } from "../../lib/colorExtractor";
import { usePodcast } from "../../hooks/usePodcast";
import { usePodcastPeople } from "../../hooks/usePodcastPeople";
import { useAuthStore } from "../../stores/authStore";
import { getApiBase, getMediaUrl } from "../../lib/api";
import { ConfirmationDialog } from "../ui/ConfirmationDialog";
import type { PodcastPerson } from "../../lib/types";

// Categories based on Apple Podcasts categories
const PODCAST_CATEGORIES = [
  "Arts",
  "Business",
  "Comedy",
  "Education",
  "Fiction",
  "Government",
  "Health & Fitness",
  "History",
  "Kids & Family",
  "Leisure",
  "Music",
  "News",
  "Religion & Spirituality",
  "Science",
  "Society & Culture",
  "Sports",
  "Technology",
  "True Crime",
  "TV & Film",
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

export const PodcastInfoPage: React.FC = () => {
  const { podcastMetadata, updatePodcastMetadata, setBrandColors, brandColors } =
    useWorkspaceStore();

  // Local state for form editing
  const [metadata, setMetadata] = useState<PodcastMetadata>(podcastMetadata);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");

  // Podcast data
  const { podcast, isOwner, updatePodcast, deletePodcast } = usePodcast();

  // Podcast people (hosts & guests)
  const { people, createPerson, updatePerson, deletePerson, uploadPhoto } = usePodcastPeople();
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState<"host" | "guest">("guest");
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);

  // Danger zone state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cover upload state
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Initialize form from backend data when podcast loads
  useEffect(() => {
    if (podcast) {
      const newMetadata = {
        name: podcast.name || "",
        description: podcast.description || "",
        author: podcast.podcastMetadata?.author || "",
        email: podcast.podcastMetadata?.email || "",
        website: podcast.podcastMetadata?.website || "",
        category: podcast.podcastMetadata?.category || "Technology",
        language: podcast.podcastMetadata?.language || "en",
        explicit: podcast.podcastMetadata?.explicit || false,
        coverImage: podcast.coverImageUrl || "",
      };
      setMetadata(newMetadata);
      setIsDirty(false);
      // Also sync to workspaceStore for sidebar display
      updatePodcastMetadata(newMetadata);
    }
  }, [podcast, updatePodcastMetadata]);

  // Apply brand colors from backend when podcast loads
  useEffect(() => {
    if (podcast?.brandColors) {
      const colors = parseBrandColorsFromStorage(podcast.brandColors);
      if (colors) {
        setBrandColors(colors);
      }
    }
  }, [podcast?.brandColors, setBrandColors]);

  const handleChange = (field: keyof PodcastMetadata, value: string | boolean) => {
    setMetadata((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  // Debounced save function
  const debouncedSave = useMemo(
    () =>
      debounce(async (data: PodcastMetadata) => {
        if (!isOwner) return;
        setSaveStatus("saving");
        try {
          await updatePodcast({
            name: data.name,
            description: data.description,
            podcastMetadata: {
              author: data.author,
              category: data.category,
              language: data.language,
              explicit: data.explicit,
              email: data.email,
              website: data.website,
            },
          });
          updatePodcastMetadata(data);
          setSaveStatus("saved");
        } catch (err) {
          setSaveStatus("error");
          console.error("Auto-save failed:", err);
        }
      }, 1500),
    [updatePodcast, isOwner, updatePodcastMetadata]
  );

  // Trigger save on changes (no cleanup — debounce resets its own timer)
  useEffect(() => {
    if (isDirty) {
      debouncedSave(metadata);
    }
  }, [metadata, isDirty, debouncedSave]);

  // Flush on unmount only (debouncedSave is stable from useMemo)
  useEffect(() => {
    return () => debouncedSave.flush();
  }, [debouncedSave]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !podcast?.id) return;

    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("cover", file);

      const { accessToken } = useAuthStore.getState();
      const res = await fetch(`${getApiBase()}/api/podcasts/${podcast.id}/cover`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload cover");
      }

      const { coverImageUrl } = await res.json();
      handleChange("coverImage", coverImageUrl);

      // Extract and save brand colors
      const colors = await extractBrandColors(coverImageUrl);
      if (colors) {
        setBrandColors(colors);
        await updatePodcast({
          brandColors: {
            primary: colors.primary,
            secondary: colors.secondary,
          },
        });
      }
    } catch (err) {
      console.error("Cover upload failed:", err);
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Clear brand colors if cover image is removed
  const handleRemoveCoverImage = async () => {
    handleChange("coverImage", "");
    setBrandColors(null);
    if (podcast?.id) {
      await updatePodcast({ coverImageUrl: "", brandColors: undefined });
    }
  };

  // Delete workspace handler
  const handleDeleteWorkspace = async () => {
    setIsDeleting(true);
    try {
      await deletePodcast();
    } catch (err) {
      console.error("Failed to delete workspace:", err);
      setIsDeleting(false);
    }
  };

  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    await createPerson({ name: newPersonName.trim(), role: newPersonRole });
    setNewPersonName("");
    setNewPersonRole("guest");
    setIsAddingPerson(false);
  };

  const handleDeletePerson = async (personId: string) => {
    await deletePerson(personId);
    setDeletingPersonId(null);
  };

  const handlePersonPhotoUpload = async (
    personId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(personId, file);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[hsl(var(--text))]">Podcast Info</h1>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Configure your podcast details for RSS feeds and directories
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              saveStatus === "saving"
                ? "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]"
                : saveStatus === "error"
                  ? "bg-[hsl(var(--error)/0.1)] text-[hsl(var(--error))]"
                  : "bg-[hsl(var(--surface))] text-[hsl(var(--text-ghost))]"
            )}
          >
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "error"
                ? "Error saving"
                : "Auto-saved"}
          </div>
        </div>

        {/* Form */}
        <div className="space-y-8">
          {/* Cover Art Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <ImageIcon className="h-4 w-4" />
              Cover Art
            </h2>
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              <div className="flex items-start gap-6">
                {/* Cover Preview */}
                <div
                  className={cn(
                    "relative flex h-40 w-40 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl",
                    "bg-gradient-to-br from-[hsl(var(--cyan)/0.1)] to-[hsl(var(--magenta)/0.1)]",
                    "border-2 border-dashed border-[hsl(var(--border-subtle))]"
                  )}
                >
                  {metadata.coverImage ? (
                    <img
                      src={getMediaUrl(metadata.coverImage)}
                      alt="Podcast cover"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-[hsl(var(--text-ghost))]" />
                      <span className="mt-2 block text-xs text-[hsl(var(--text-ghost))]">
                        No cover
                      </span>
                    </div>
                  )}
                </div>

                {/* Upload Instructions */}
                <div className="flex-1">
                  <p className="text-sm text-[hsl(var(--text-muted))]">
                    Upload a square image for your podcast cover art. This will appear in podcast
                    directories and apps.
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-[hsl(var(--text-ghost))]">
                    <li>Minimum size: 1400 x 1400 pixels</li>
                    <li>Maximum size: 3000 x 3000 pixels</li>
                    <li>Format: JPEG or PNG</li>
                    <li>Must be square (1:1 ratio)</li>
                  </ul>
                  <div className="mt-4 flex items-center gap-2">
                    <label
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2",
                        "bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text))]",
                        "border border-[hsl(var(--border-subtle))]",
                        "hover:bg-[hsl(var(--surface-hover))]",
                        "transition-colors",
                        isUploadingCover && "cursor-wait opacity-50"
                      )}
                    >
                      <ImageIcon className="h-4 w-4" />
                      {isUploadingCover
                        ? "Uploading..."
                        : metadata.coverImage
                          ? "Change Cover"
                          : "Upload Cover"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleImageUpload}
                        disabled={isUploadingCover}
                        className="hidden"
                      />
                    </label>
                    {metadata.coverImage && (
                      <button
                        onClick={handleRemoveCoverImage}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg px-4 py-2",
                          "text-sm text-[hsl(var(--text-muted))]",
                          "hover:text-[hsl(var(--error))]",
                          "transition-colors"
                        )}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Brand Colors Preview */}
                  {brandColors && metadata.coverImage && (
                    <div className="mt-4 border-t border-[hsl(var(--border-subtle))] pt-4">
                      <p className="mb-2 text-xs text-[hsl(var(--text-ghost))]">
                        Brand colors (auto-detected)
                      </p>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 w-6 rounded-md border border-[hsl(var(--border-subtle))]"
                          style={{ background: brandColors.primary }}
                          title="Primary accent"
                        />
                        <div
                          className="h-6 w-6 rounded-md border border-[hsl(var(--border-subtle))]"
                          style={{ background: brandColors.secondary }}
                          title="Secondary accent"
                        />
                        <span className="ml-2 text-xs text-[hsl(var(--text-ghost))]">
                          Applied to UI accents
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Basic Info Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <PersonIcon className="h-4 w-4" />
              Basic Information
            </h2>
            <div className="space-y-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              {/* Podcast Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Podcast Name
                </label>
                <input
                  type="text"
                  value={metadata.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Enter your podcast name..."
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
                  placeholder="What's your podcast about?"
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
                <p className="mt-1.5 text-xs text-[hsl(var(--text-ghost))]">
                  This appears in podcast directories. Keep it under 4000 characters.
                </p>
              </div>

              {/* Author */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Author / Host
                </label>
                <input
                  type="text"
                  value={metadata.author}
                  onChange={(e) => handleChange("author", e.target.value)}
                  placeholder="Your name or organization"
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5",
                    "bg-[hsl(var(--bg-base))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                    "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                  )}
                />
              </div>

              {/* Category & Language */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                    Category
                  </label>
                  <select
                    value={metadata.category}
                    onChange={(e) => handleChange("category", e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-4 py-2.5",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-[hsl(var(--text))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                    )}
                  >
                    {PODCAST_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                    Language
                  </label>
                  <select
                    value={metadata.language}
                    onChange={(e) => handleChange("language", e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-4 py-2.5",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-[hsl(var(--text))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                    )}
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
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

          {/* Contact & Links Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <Link2Icon className="h-4 w-4" />
              Contact & Links
            </h2>
            <div className="space-y-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              {/* Email */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  <EnvelopeClosedIcon className="mr-1.5 inline h-3.5 w-3.5" />
                  Contact Email
                </label>
                <input
                  type="email"
                  value={metadata.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="contact@yourpodcast.com"
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5",
                    "bg-[hsl(var(--bg-base))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                    "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                  )}
                />
                <p className="mt-1.5 text-xs text-[hsl(var(--text-ghost))]">
                  Used for RSS feed and directory submissions
                </p>
              </div>

              {/* Website */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  <GlobeIcon className="mr-1.5 inline h-3.5 w-3.5" />
                  Website
                </label>
                <input
                  type="url"
                  value={metadata.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://yourpodcast.com"
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
          </section>

          {/* Hosts & Guests Section */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <PersonIcon className="h-4 w-4" />
              Hosts & Guests
            </h2>
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              <p className="mb-4 text-sm text-[hsl(var(--text-muted))]">
                Recurring hosts and guests for this podcast. These will appear as options when
                editing speakers in transcripts.
              </p>

              {/* People list */}
              {people.length > 0 && (
                <div className="mb-4 space-y-3">
                  {people.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      onUpdate={updatePerson}
                      onDelete={(id) => setDeletingPersonId(id)}
                      onPhotoUpload={handlePersonPhotoUpload}
                    />
                  ))}
                </div>
              )}

              {/* Add person form */}
              {isAddingPerson ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddPerson();
                      if (e.key === "Escape") setIsAddingPerson(false);
                    }}
                    placeholder="Name..."
                    autoFocus
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none"
                    )}
                  />
                  <select
                    value={newPersonRole}
                    onChange={(e) => setNewPersonRole(e.target.value as "host" | "guest")}
                    className={cn(
                      "rounded-lg px-3 py-2",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-sm text-[hsl(var(--text))]"
                    )}
                  >
                    <option value="host">Host</option>
                    <option value="guest">Guest</option>
                  </select>
                  <button
                    onClick={handleAddPerson}
                    disabled={!newPersonName.trim()}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-medium",
                      "bg-[hsl(var(--cyan))] text-white",
                      "hover:bg-[hsl(var(--cyan)/0.9)]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "transition-colors"
                    )}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingPerson(false);
                      setNewPersonName("");
                    }}
                    className="rounded-lg p-2 text-[hsl(var(--text-muted))] transition-colors hover:text-[hsl(var(--text))]"
                  >
                    <Cross2Icon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingPerson(true)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-4 py-2",
                    "bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text))]",
                    "border border-[hsl(var(--border-subtle))]",
                    "hover:bg-[hsl(var(--surface-hover))]",
                    "transition-colors"
                  )}
                >
                  <PersonIcon className="h-4 w-4" />
                  Add Person
                </button>
              )}
            </div>
          </section>

          {/* Delete person confirmation */}
          <ConfirmationDialog
            isOpen={!!deletingPersonId}
            onClose={() => setDeletingPersonId(null)}
            onConfirm={() => deletingPersonId && handleDeletePerson(deletingPersonId)}
            title="Remove Person?"
            description="This will remove this person from your podcast's recurring people list. Speaker labels in existing transcripts will be preserved."
            confirmText="Remove"
            variant="danger"
          />

          {/* Danger Zone */}
          {isOwner && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--error))] uppercase">
                <TrashIcon className="h-4 w-4" />
                Danger Zone
              </h2>
              <div className="rounded-xl border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error)/0.05)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-[hsl(var(--text))]">
                      Delete Workspace
                    </h3>
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      Permanently delete this podcast and all its episodes, clips, and data.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    className="rounded-lg bg-[hsl(var(--error))] px-4 py-2 text-sm font-medium text-white hover:bg-[hsl(var(--error)/0.9)]"
                  >
                    Delete Workspace
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteWorkspace}
        title="Delete Workspace?"
        description={`This will permanently delete "${podcast?.name}" and all its episodes, clips, and data. This cannot be undone.`}
        confirmText="Delete Forever"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};

// Inline person card component
const PersonCard: React.FC<{
  person: PodcastPerson;
  onUpdate: (id: string, updates: Partial<PodcastPerson>) => Promise<PodcastPerson | null>;
  onDelete: (id: string) => void;
  onPhotoUpload: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ person, onUpdate, onDelete, onPhotoUpload }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(person.name);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = person.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const saveName = () => {
    if (nameValue.trim() && nameValue.trim() !== person.name) {
      onUpdate(person.id, { name: nameValue.trim() });
    }
    setIsEditingName(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base)/0.5)] p-3">
      {/* Avatar */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="group relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface))]"
        title="Upload photo"
      >
        {person.photoUrl ? (
          <img
            src={getMediaUrl(person.photoUrl)}
            alt={person.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-medium text-[hsl(var(--text-muted))]">
            {initials}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <CameraIcon className="h-4 w-4 text-white" />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onPhotoUpload(person.id, e)}
          className="hidden"
        />
      </button>

      {/* Name */}
      <div className="min-w-0 flex-1">
        {isEditingName ? (
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setNameValue(person.name);
                setIsEditingName(false);
              }
            }}
            autoFocus
            className={cn(
              "w-full rounded px-2 py-1 text-sm",
              "bg-[hsl(var(--bg-base))]",
              "border border-[hsl(var(--cyan))]",
              "text-[hsl(var(--text))]",
              "focus:outline-none"
            )}
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="truncate text-sm font-medium text-[hsl(var(--text))] transition-colors hover:text-[hsl(var(--cyan))]"
          >
            {person.name}
          </button>
        )}
      </div>

      {/* Role badge */}
      <button
        onClick={() => onUpdate(person.id, { role: person.role === "host" ? "guest" : "host" })}
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
          person.role === "host"
            ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
            : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]"
        )}
        title="Click to toggle role"
      >
        {person.role === "host" ? "Host" : "Guest"}
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(person.id)}
        className="rounded p-1.5 text-[hsl(var(--text-ghost))] transition-colors hover:text-[hsl(var(--error))]"
        title="Remove person"
      >
        <Cross2Icon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default PodcastInfoPage;
