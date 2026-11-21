import { apiFetch } from "./api-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface RunArtifactDetail {
  id: string;
  type: string;
  s3_key: string;
  mime_type?: string | null;
  metadata?: Record<string, unknown> | null;
  url?: string | null;
}

export interface RunStepDetail {
  id: string;
  node_id: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  locator_strategy?: string | null;
  locator_value?: string | null;
  duration_ms?: number | null;
  output?: unknown;
  screenshot_path?: string | null;
  screenshot_url?: string | null;
  error_message?: string | null;
}

export interface RunSummary {
  id: string;
  recipe_id?: string | null;
  recipe_version?: number | null;
  is_draft?: boolean;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "paused"
    | "completed"
    | "failed"
    | "stopped";
  trigger: string;
  parameters?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  steps_count?: number;
  logs_count?: number;
  preview_url?: string | null;
}

export interface RunDetail extends RunSummary {
  steps?: RunStepDetail[];
  artifacts?: RunArtifactDetail[];
}

export interface RunLogEntry {
  id: number | string;
  level: "info" | "warn" | "error" | "success";
  source?: "runner" | "browser" | "network" | "live";
  node_id?: string | null;
  message: string;
  context?: Record<string, unknown> | null;
  logged_at?: string | null;
}

export function resolveArtifactUrl(urlOrPath?: string | null): string | null {
  if (!urlOrPath || typeof urlOrPath !== "string") {
    return null;
  }

  const trimmed = urlOrPath.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/api/")) {
    return `${API_BASE_URL.replace(/\/+$/, "")}${trimmed}`;
  }

  const s3Base = (
    process.env.NEXT_PUBLIC_S3_URL || "http://localhost:9000/rpa-artifacts"
  ).replace(/\/+$/, "");

  return `${s3Base}/${trimmed.replace(/^\/+/, "")}`;
}

export async function fetchRecipeRuns(
  recipeId: string,
  params?: { trigger?: string; status?: string; limit?: number }
): Promise<RunSummary[]> {
  if (!recipeId || recipeId === "new") {
    return [];
  }

  const query = new URLSearchParams();
  if (params?.trigger && params.trigger !== "all") {
    query.set("trigger", params.trigger);
  }
  if (params?.status && params.status !== "all") {
    query.set("status", params.status);
  }
  if (params?.limit !== undefined) {
    query.set("limit", String(params.limit));
  }

  const qs = query.toString();
  const res = await apiFetch<{ data?: RunSummary[] }>(
    `/api/v1/recipes/${recipeId}/runs${qs ? `?${qs}` : ""}`
  );
  return Array.isArray(res?.data) ? res.data : [];
}

export async function fetchRunDetail(runId: string): Promise<RunDetail | null> {
  if (!runId || runId.startsWith("run_mock_")) {
    return null;
  }

  const res = await apiFetch<{ data?: RunDetail }>(`/api/v1/runs/${runId}`);
  return res?.data ?? null;
}

export async function fetchRunLogs(
  runId: string,
  limit = 500
): Promise<RunLogEntry[]> {
  if (!runId || runId.startsWith("run_mock_")) {
    return [];
  }

  const res = await apiFetch<{ data?: RunLogEntry[] }>(
    `/api/v1/runs/${runId}/logs?limit=${limit}`
  );
  return Array.isArray(res?.data) ? res.data : [];
}
