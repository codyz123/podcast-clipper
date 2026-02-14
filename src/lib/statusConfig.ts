/**
 * Centralized configuration for stage and sub-step status tracking.
 * Single source of truth for status types, colors, and stage/sub-step definitions.
 */

// ============ Status Types ============

export type StageStatus = "not-started" | "in-progress" | "complete";

export interface StatusEntry {
  status: StageStatus;
  updatedAt?: string;
}

// ============ Status Styling ============

export interface StatusStyleConfig {
  color: string;
  glow: string;
  label: string;
}

export const STATUS_CONFIG: Record<StageStatus, StatusStyleConfig> = {
  "not-started": {
    color: "bg-[hsl(var(--text-ghost)/0.3)]",
    glow: "",
    label: "Not Started",
  },
  "in-progress": {
    color: "bg-amber-400",
    glow: "shadow-[0_0_6px_rgba(251,191,36,0.5)]",
    label: "In Progress",
  },
  complete: {
    color: "bg-emerald-400",
    glow: "shadow-[0_0_6px_rgba(52,211,153,0.4)]",
    label: "Complete",
  },
};

// ============ Status Utilities ============

/**
 * Cycle through status values: not-started -> in-progress -> complete -> not-started
 */
export const cycleStatus = (current: StageStatus): StageStatus => {
  const cycle: Record<StageStatus, StageStatus> = {
    "not-started": "in-progress",
    "in-progress": "complete",
    complete: "not-started",
  };
  return cycle[current];
};

/**
 * Get status from a potentially undefined status entry
 */
export const getStatus = (entry?: StatusEntry): StageStatus => {
  return entry?.status || "not-started";
};

// ============ Stage Definitions ============

export type StageId = "planning" | "production" | "post-production" | "distribution" | "marketing";

export interface StageDefinition {
  id: StageId;
  label: string;
  shortLabel: string;
}

export const STAGES: StageDefinition[] = [
  { id: "planning", label: "Planning", shortLabel: "Plan" },
  { id: "production", label: "Production", shortLabel: "Prod" },
  { id: "post-production", label: "Post-Production", shortLabel: "Post" },
  { id: "distribution", label: "Distribution", shortLabel: "Dist" },
  { id: "marketing", label: "Marketing", shortLabel: "Mkt" },
];

export const STAGE_LABELS: Record<StageId, string> = {
  planning: "Planning",
  production: "Production",
  "post-production": "Post-Production",
  distribution: "Distribution",
  marketing: "Marketing",
};

// ============ Sub-Step Definitions ============

export type SubStepId =
  // Planning
  | "guest"
  | "topic"
  | "logistics"
  // Production
  | "recording"
  // Post-production
  | "mixing"
  | "editing"
  | "transcription"
  // Distribution
  | "rss"
  | "youtube-dist"
  // Marketing
  | "clips"
  | "x"
  | "instagram-reel"
  | "instagram-post"
  | "youtube-short"
  | "tiktok";

export const STAGE_SUB_STEPS: Record<StageId, SubStepId[]> = {
  planning: ["guest", "topic", "logistics"],
  production: [],
  "post-production": ["recording", "mixing", "editing", "transcription"],
  distribution: ["rss", "youtube-dist"],
  marketing: ["clips", "x", "instagram-reel", "instagram-post", "youtube-short", "tiktok"],
};

export const SUB_STEP_LABELS: Record<SubStepId, string> = {
  // Planning
  guest: "Guest",
  topic: "Topic",
  logistics: "Logistics",
  // Production
  recording: "Recording",
  // Post-production
  mixing: "Mixing",
  editing: "Editing",
  transcription: "Transcription",
  // Distribution
  rss: "RSS",
  "youtube-dist": "YouTube",
  // Marketing
  clips: "Clips",
  x: "X",
  "instagram-reel": "Instagram Reel",
  "instagram-post": "Instagram Post",
  "youtube-short": "YouTube Short",
  tiktok: "TikTok",
};

/**
 * Reverse lookup: sub-step ID to parent stage ID
 */
export const SUB_STEP_TO_STAGE: Record<SubStepId, StageId> = {
  guest: "planning",
  topic: "planning",
  logistics: "planning",
  recording: "post-production",
  mixing: "post-production",
  editing: "post-production",
  transcription: "post-production",
  rss: "distribution",
  "youtube-dist": "distribution",
  clips: "marketing",
  x: "marketing",
  "instagram-reel": "marketing",
  "instagram-post": "marketing",
  "youtube-short": "marketing",
  tiktok: "marketing",
};

/**
 * Valid sub-step IDs for API validation
 */
export const VALID_SUB_STEPS: SubStepId[] = [
  "guest",
  "topic",
  "logistics",
  "recording",
  "mixing",
  "editing",
  "transcription",
  "rss",
  "youtube-dist",
  "clips",
  "x",
  "instagram-reel",
  "instagram-post",
  "youtube-short",
  "tiktok",
];

// ============ Route to Sub-Step Mapping ============

/**
 * Maps navigation route segments to sub-step IDs for status indicators
 */
export const ROUTE_TO_SUB_STEP: Record<string, SubStepId> = {
  guests: "guest",
  topics: "topic",
  notes: "logistics",
  record: "recording",
  transcript: "transcription",
  editor: "clips",
};

// ============ Combined Status Types ============

export interface StageStatusWithSubSteps {
  planning?: StatusEntry;
  production?: StatusEntry;
  "post-production"?: StatusEntry;
  distribution?: StatusEntry;
  marketing?: StatusEntry;
  subSteps?: Partial<Record<SubStepId, StatusEntry>>;
}
