import React, { useState, useRef, useEffect, useCallback } from "react";
import { PersonIcon } from "@radix-ui/react-icons";
import { Button, Input } from "../ui";
import { cn } from "../../lib/utils";
import { getMediaUrl } from "../../lib/api";
import type { PodcastPerson } from "../../lib/types";

interface SpeakerInfo {
  label: string;
  speakerId?: string;
}

interface SpeakerLineupProps {
  speakers: SpeakerInfo[];
  podcastPeople: PodcastPerson[];
  onSpeakerRename: (oldLabel: string, newLabel: string, personId?: string) => void;
  onCreatePerson: (data: { name: string; role: "host" | "guest" }) => Promise<PodcastPerson | null>;
}

const SPEAKER_COLORS = [
  "hsl(185 60% 50%)",
  "hsl(280 60% 65%)",
  "hsl(35 80% 55%)",
  "hsl(150 50% 50%)",
  "hsl(350 60% 60%)",
  "hsl(210 60% 60%)",
];

export const SpeakerLineup: React.FC<SpeakerLineupProps> = ({
  speakers,
  podcastPeople,
  onSpeakerRename,
  onCreatePerson,
}) => {
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createRole, setCreateRole] = useState<"host" | "guest">("guest");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (editingLabel === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingLabel(null);
        setShowCreateForm(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingLabel]);

  const handleSave = useCallback(() => {
    if (editingLabel && nameInput.trim() && nameInput.trim() !== editingLabel) {
      onSpeakerRename(editingLabel, nameInput.trim());
    }
    setEditingLabel(null);
    setShowCreateForm(false);
  }, [editingLabel, nameInput, onSpeakerRename]);

  const handleLinkPerson = useCallback(
    (person: PodcastPerson) => {
      if (editingLabel) {
        onSpeakerRename(editingLabel, person.name, person.id);
      }
      setEditingLabel(null);
      setShowCreateForm(false);
    },
    [editingLabel, onSpeakerRename]
  );

  const handleCreateAndLink = useCallback(async () => {
    if (!nameInput.trim()) return;
    const person = await onCreatePerson({ name: nameInput.trim(), role: createRole });
    if (person && editingLabel) {
      onSpeakerRename(editingLabel, person.name, person.id);
    }
    setEditingLabel(null);
    setShowCreateForm(false);
  }, [nameInput, createRole, editingLabel, onCreatePerson, onSpeakerRename]);

  const getInitials = (label: string) =>
    label
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
        Speakers
      </span>
      {speakers.map((speaker, idx) => {
        const person = speaker.speakerId
          ? podcastPeople.find((p) => p.id === speaker.speakerId)
          : undefined;
        const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
        const isEditing = editingLabel === speaker.label;

        return (
          <div key={speaker.label} className="relative" ref={isEditing ? popoverRef : undefined}>
            <button
              onClick={() => {
                if (isEditing) {
                  setEditingLabel(null);
                  setShowCreateForm(false);
                } else {
                  setEditingLabel(speaker.label);
                  setNameInput(speaker.label);
                  setShowCreateForm(false);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                "border",
                isEditing
                  ? "border-[hsl(var(--cyan)/0.4)] bg-[hsl(var(--cyan)/0.1)]"
                  : "border-[hsl(var(--glass-border))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--raised))]"
              )}
            >
              {/* Avatar */}
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{
                  backgroundColor: person?.photoUrl ? undefined : `${color}20`,
                  borderColor: color,
                }}
              >
                {person?.photoUrl ? (
                  <img
                    src={getMediaUrl(person.photoUrl)}
                    alt={person.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[8px] font-bold" style={{ color }}>
                    {getInitials(speaker.label)}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-[hsl(var(--text))]">{speaker.label}</span>
              {person && <PersonIcon className="h-3 w-3 text-[hsl(var(--text-muted))]" />}
            </button>

            {/* Edit popover */}
            {isEditing && (
              <div
                className={cn(
                  "absolute top-full left-0 z-30 mt-1.5 w-64",
                  "rounded-lg border border-[hsl(var(--glass-border))]",
                  "bg-[hsl(var(--raised))] p-3 shadow-xl"
                )}
              >
                {!showCreateForm ? (
                  <>
                    {/* Name input */}
                    <Input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") {
                          setEditingLabel(null);
                          setShowCreateForm(false);
                        }
                      }}
                      placeholder="Speaker name"
                      className="mb-2 h-8 text-sm"
                      autoFocus
                    />

                    {/* Rename button */}
                    {nameInput.trim() && nameInput.trim() !== editingLabel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSave}
                        className="mb-2 w-full justify-start text-xs"
                      >
                        Rename to &quot;{nameInput.trim()}&quot;
                      </Button>
                    )}

                    {/* Recurring people list */}
                    {podcastPeople.length > 0 && (
                      <>
                        <div className="mb-2 border-t border-[hsl(var(--glass-border))] pt-2">
                          <p className="text-[10px] font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                            Link to Person
                          </p>
                        </div>
                        <div className="max-h-32 space-y-1 overflow-y-auto">
                          {podcastPeople.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => handleLinkPerson(p)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors",
                                "hover:bg-[hsl(var(--surface))]",
                                speaker.speakerId === p.id && "bg-[hsl(185_50%_15%/0.3)]"
                              )}
                            >
                              <div
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                  "bg-[hsl(var(--surface))]"
                                )}
                              >
                                {p.photoUrl ? (
                                  <img
                                    src={getMediaUrl(p.photoUrl)}
                                    alt={p.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[8px] font-semibold text-[hsl(var(--text-muted))]">
                                    {p.name[0]?.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[hsl(var(--text))]">
                                  {p.name}
                                </p>
                                <p className="text-[10px] text-[hsl(var(--text-muted))] capitalize">
                                  {p.role}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Create new person link */}
                    <div className="mt-2 border-t border-[hsl(var(--glass-border))] pt-2">
                      <button
                        onClick={() => setShowCreateForm(true)}
                        className="w-full rounded-md p-1.5 text-left text-xs font-medium text-[hsl(var(--cyan))] transition-colors hover:bg-[hsl(var(--surface))]"
                      >
                        + Create new person
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Create person form */}
                    <p className="mb-2 text-[10px] font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                      New Person
                    </p>
                    <Input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateAndLink();
                        if (e.key === "Escape") setShowCreateForm(false);
                      }}
                      placeholder="Name"
                      className="mb-2 h-8 text-sm"
                      autoFocus
                    />
                    <div className="mb-3 flex gap-2">
                      {(["host", "guest"] as const).map((role) => (
                        <button
                          key={role}
                          onClick={() => setCreateRole(role)}
                          className={cn(
                            "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                            createRole === role
                              ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
                              : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))]"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCreateForm(false)}
                        className="flex-1 text-xs"
                      >
                        Back
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCreateAndLink}
                        disabled={!nameInput.trim()}
                        className="flex-1 text-xs"
                      >
                        Create & Link
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
