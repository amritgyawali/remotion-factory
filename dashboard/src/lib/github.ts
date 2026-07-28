import "server-only";
import { githubToken, repoBranch, repoSlug } from "./env";

/**
 * Thin, typed GitHub client covering exactly what the dashboard needs:
 * workflow runs and their logs, releases (where the rendered videos live),
 * the JSON files that make up the queue, and workflow_dispatch.
 *
 * Everything goes through `gh()` so one place handles auth, rate-limit
 * reporting and error shape. Nothing here is ever imported by a client
 * component — the token must not cross into the browser bundle.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  readonly status: number;
  readonly documentation?: string;

  constructor(status: number, message: string, documentation?: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.documentation = documentation;
  }
}

type GhOptions = RequestInit & {
  /** Seconds to cache. 0 means always fresh — use for anything a click changes. */
  revalidate?: number;
  /** Return the raw Response instead of parsed JSON (used for plain-text logs). */
  raw?: boolean;
};

async function gh<T>(path: string, options: GhOptions = {}): Promise<T> {
  const { revalidate = 0, raw, headers, ...init } = options;

  const response = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "remotion-factory-dashboard",
      ...headers,
    },
    // Vercel caches fetches aggressively by default; a control plane must not
    // show a run status that is thirty seconds stale after you clicked run.
    next: revalidate > 0 ? { revalidate } : undefined,
    cache: revalidate > 0 ? undefined : "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body.slice(0, 400);
    let documentation: string | undefined;
    try {
      const parsed = JSON.parse(body) as { message?: string; documentation_url?: string };
      if (parsed.message) message = parsed.message;
      documentation = parsed.documentation_url;
    } catch {
      /* keep the raw snippet */
    }

    if (response.status === 401) {
      message = "GitHub rejected the token. Check GITHUB_TOKEN has not expired.";
    } else if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0) * 1000;
      message = `GitHub rate limit reached. Resets ${new Date(reset).toISOString()}.`;
    } else if (response.status === 404) {
      message = `Not found: ${path}. Check GITHUB_REPO and that the token can see it.`;
    }

    throw new GitHubError(response.status, message, documentation);
  }

  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Workflow runs                                                              */
/* -------------------------------------------------------------------------- */

export type RunStatus = "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null;

export interface WorkflowRun {
  id: number;
  name: string;
  display_title: string;
  run_number: number;
  event: string;
  status: RunStatus;
  conclusion: RunConclusion;
  html_url: string;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
  head_sha: string;
  head_branch: string | null;
}

export interface WorkflowStep {
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
  steps?: WorkflowStep[];
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually";
  html_url: string;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const data = await gh<{ workflows: Workflow[] }>(
    `/repos/${repoSlug()}/actions/workflows`,
    { revalidate: 60 },
  );
  return data.workflows;
}

export async function listRuns(limit = 20): Promise<WorkflowRun[]> {
  const data = await gh<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${repoSlug()}/actions/runs?per_page=${limit}`,
  );
  return data.workflow_runs;
}

export async function getRun(runId: number): Promise<WorkflowRun> {
  return gh<WorkflowRun>(`/repos/${repoSlug()}/actions/runs/${runId}`);
}

export async function listJobs(runId: number): Promise<WorkflowJob[]> {
  const data = await gh<{ jobs: WorkflowJob[] }>(
    `/repos/${repoSlug()}/actions/runs/${runId}/jobs?per_page=50`,
  );
  return data.jobs;
}

/**
 * Per-job logs come back as plain text behind a redirect, which is far easier
 * to work with than the whole-run zip. Returns null when GitHub has expired
 * them (logs are kept far less long than the run record).
 */
export async function getJobLog(jobId: number): Promise<string | null> {
  const response = await gh<Response>(`/repos/${repoSlug()}/actions/jobs/${jobId}/logs`, {
    raw: true,
    redirect: "follow",
  });
  const text = await response.text();
  return text.trim() ? text : null;
}

export interface FailureReport {
  run: WorkflowRun;
  jobId: number;
  jobName: string;
  stepName: string | null;
  /** The error lines themselves, already stripped of Actions' timestamps. */
  lines: string[];
}

const ERROR_LINE =
  /##\[error\]|^\s*Error:|\bError:\s|Process completed with exit code|FAILED:|refusing to publish|is not unique|matches no connected channel/;

/**
 * Why the most recent failure failed, pulled out of the job log.
 *
 * Without Telegram configured there is no notification channel at all, so the
 * dashboard is the only place a failure can surface. Reading it here rather
 * than making the operator open GitHub, download a log archive and search it
 * is the entire reason this dashboard exists.
 */
export async function lastFailure(runs: WorkflowRun[]): Promise<FailureReport | null> {
  const failed = runs.find((run) => run.status === "completed" && run.conclusion === "failure");
  if (!failed) return null;

  const jobs = await listJobs(failed.id);
  const job = jobs.find((entry) => entry.conclusion === "failure") ?? jobs[0];
  if (!job) return null;

  const step = job.steps?.find((entry) => entry.conclusion === "failure") ?? null;

  let lines: string[] = [];
  try {
    const log = await getJobLog(job.id);
    if (log) {
      lines = log
        .split(/\r?\n/)
        .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/, ""))
        .filter((line) => ERROR_LINE.test(line))
        .map((line) => line.replace(/^##\[error\]/, "").trim())
        .filter(Boolean)
        // The exit-code line is noise once the real message is present.
        .filter((line, _index, all) =>
          all.length > 1 ? !/^Process completed with exit code/.test(line) : true,
        )
        .slice(0, 8);
    }
  } catch {
    // An expired log still leaves the run, job and step worth reporting.
  }

  return { run: failed, jobId: job.id, jobName: job.name, stepName: step?.name ?? null, lines };
}

export async function dispatchWorkflow(
  workflowFile: string,
  inputs: Record<string, string>,
): Promise<void> {
  await gh<void>(`/repos/${repoSlug()}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: repoBranch(), inputs }),
  });
}

export async function rerunFailedJobs(runId: number): Promise<void> {
  await gh<void>(`/repos/${repoSlug()}/actions/runs/${runId}/rerun-failed-jobs`, {
    method: "POST",
  });
}

export async function cancelRun(runId: number): Promise<void> {
  await gh<void>(`/repos/${repoSlug()}/actions/runs/${runId}/cancel`, { method: "POST" });
}

/* -------------------------------------------------------------------------- */
/* Repository contents                                                        */
/* -------------------------------------------------------------------------- */

const utf8 = { encoder: new TextEncoder(), decoder: new TextDecoder() };

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\n/g, ""));
  return utf8.decoder.decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encodeBase64(value: string): string {
  const bytes = utf8.encoder.encode(value);
  let binary = "";
  // Chunked so a large plan cannot blow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export interface RepoFile<T> {
  path: string;
  sha: string;
  data: T;
}

export async function readJsonFile<T>(path: string): Promise<RepoFile<T> | null> {
  try {
    const file = await gh<{ content: string; sha: string; encoding: string }>(
      `/repos/${repoSlug()}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repoBranch())}`,
    );
    if (file.encoding !== "base64") {
      throw new Error(`${path} came back as "${file.encoding}", expected base64`);
    }
    return { path, sha: file.sha, data: JSON.parse(decodeBase64(file.content)) as T };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export async function listDirectory(path: string): Promise<{ name: string; path: string }[]> {
  try {
    const entries = await gh<{ name: string; path: string; type: string }[]>(
      `/repos/${repoSlug()}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repoBranch())}`,
    );
    return entries.filter((entry) => entry.type === "file");
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return [];
    throw error;
  }
}

/**
 * Writes a JSON file back to the branch. The `sha` is the optimistic lock: if
 * a workflow committed state.json since the editor loaded, GitHub rejects the
 * write with a 409 rather than silently discarding the newer commit.
 */
export async function writeJsonFile(
  path: string,
  data: unknown,
  sha: string,
  message: string,
): Promise<{ commit: string }> {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const result = await gh<{ commit: { sha: string } }>(
    `/repos/${repoSlug()}/contents/${encodeURI(path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: encodeBase64(body),
        sha,
        branch: repoBranch(),
      }),
    },
  );
  return { commit: result.commit.sha };
}

/* -------------------------------------------------------------------------- */
/* Releases — where the rendered masters are kept                             */
/* -------------------------------------------------------------------------- */

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  created_at: string;
  download_count: number;
}

export interface Release {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  created_at: string;
  assets: ReleaseAsset[];
}

export async function listReleases(): Promise<Release[]> {
  return gh<Release[]>(`/repos/${repoSlug()}/releases?per_page=30`, { revalidate: 30 });
}

/* -------------------------------------------------------------------------- */
/* Repository metadata                                                        */
/* -------------------------------------------------------------------------- */

export interface RepoInfo {
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  pushed_at: string;
}

export async function getRepo(): Promise<RepoInfo> {
  return gh<RepoInfo>(`/repos/${repoSlug()}`, { revalidate: 300 });
}
