import { authFetch, getApiBase, parseApiError } from "../../lib/api";
import type { BackgroundConfig, SubtitleConfig, CaptionStyle, Track } from "../../lib/types";
import { useSettingsStore } from "../../stores/settingsStore";

export interface RenderClipResult {
  renderedClipUrl: string;
  sizeBytes?: number;
  format: string;
  reused: boolean;
}

export interface RenderClipStatus {
  id?: string;
  jobId?: string;
  clipId?: string;
  format?: string;
  status: "pending" | "rendering" | "completed" | "failed";
  progress: number;
  renderedClipUrl?: string;
  sizeBytes?: number;
  errorMessage?: string;
}

export interface RenderClipOptions {
  onProgress?: (status: RenderClipStatus) => void;
  pollIntervalMs?: number;
  force?: boolean;
  overrides?: RenderClipOverrides;
}

export interface RenderClipOverrides {
  background?: BackgroundConfig;
  subtitle?: SubtitleConfig;
  captionStyle?: CaptionStyle;
  tracks?: Track[];
  startTime?: number;
  endTime?: number;
  words?: Array<{ text: string; start: number; end: number; confidence: number }>;
  renderScale?: number;
}

function getAuthHeaders(): HeadersInit {
  const accessCode = useSettingsStore.getState().settings.accessCode;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessCode) {
    headers["x-access-code"] = accessCode;
  }
  return headers;
}

async function getRenderStatus(jobId: string): Promise<RenderClipStatus> {
  const res = await authFetch(`${getApiBase()}/api/render/clip/${jobId}/status`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  return res.json();
}

function buildResult(status: RenderClipStatus, fallbackFormat: string): RenderClipResult {
  if (!status.renderedClipUrl) {
    throw new Error("Render completed but no output URL was returned");
  }

  return {
    renderedClipUrl: status.renderedClipUrl,
    sizeBytes: status.sizeBytes,
    format: status.format || fallbackFormat,
    reused: false,
  };
}

async function pollRenderJob(
  jobId: string,
  format: string,
  options?: RenderClipOptions
): Promise<RenderClipResult> {
  const pollInterval = options?.pollIntervalMs ?? 1000;

  while (true) {
    const status = await getRenderStatus(jobId);
    options?.onProgress?.(status);

    if (status.status === "completed") {
      return buildResult(status, format);
    }

    if (status.status === "failed") {
      throw new Error(status.errorMessage || "Render failed");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

export async function ensureRenderedClip(
  clipId: string,
  format: string,
  options?: RenderClipOptions
): Promise<RenderClipResult> {
  const overrides = options?.overrides;
  const hasOverrides = Boolean(
    overrides &&
    (overrides.background ||
      overrides.subtitle ||
      overrides.captionStyle ||
      overrides.tracks ||
      typeof overrides.startTime === "number" ||
      typeof overrides.endTime === "number" ||
      (Array.isArray(overrides.words) && overrides.words.length > 0) ||
      (typeof overrides.renderScale === "number" && overrides.renderScale !== 1))
  );
  const force = options?.force ?? hasOverrides;

  const res = await authFetch(`${getApiBase()}/api/render/clip`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      clipId,
      format,
      force,
      overrides: hasOverrides ? overrides : undefined,
    }),
  });

  if (!res.ok) {
    const error = await parseApiError(res);
    throw new Error(error.message);
  }

  const payload = (await res.json()) as RenderClipStatus & {
    jobId?: string;
    reused?: boolean;
  };

  options?.onProgress?.(payload);

  if (payload.status === "completed") {
    if (!payload.renderedClipUrl) {
      throw new Error("Render completed but no output URL was returned");
    }

    return {
      renderedClipUrl: payload.renderedClipUrl,
      sizeBytes: payload.sizeBytes,
      format: payload.format || format,
      reused: Boolean(payload.reused),
    };
  }

  if (!payload.jobId) {
    throw new Error("Render job was not created");
  }

  return pollRenderJob(payload.jobId, format, options);
}
