import "server-only";
import { postizConfig } from "./env";

/**
 * Postiz client, plus the same reachability diagnosis that
 * scripts/preflight-postiz.mjs performs in CI. Keeping the two in step matters:
 * if the dashboard says Postiz is fine, the next workflow run must agree.
 */

export interface Integration {
  id: string;
  name: string;
  identifier: string;
  picture?: string | null;
  disabled?: boolean;
  profile?: string | null;
  customer?: { id: string; name: string } | null;
}

export interface PostizPost {
  id: string;
  content: string;
  publishDate: string;
  state: string;
  releaseURL?: string | null;
  integration?: { id: string; name: string; identifier: string } | null;
}

export type PostizHealth =
  | { ok: true; integrations: Integration[]; live: number; host: string }
  | { ok: false; reason: string; host: string | null; configured: boolean };

const TIMEOUT_MS = 15_000;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = postizConfig();
  if (!config) throw new Error("Postiz is not configured");

  const response = await fetch(`${config.base}${path}`, {
    ...init,
    headers: { Authorization: config.key, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Postiz ${path} -> ${response.status}: ${body.slice(0, 300)}`);
  }
  return (body ? JSON.parse(body) : null) as T;
}

/**
 * Never throws. The dashboard renders a Postiz outage as a state on the page,
 * not as a crashed route, so the GitHub half stays usable.
 */
export async function checkPostiz(): Promise<PostizHealth> {
  const config = postizConfig();
  if (!config) {
    return {
      ok: false,
      configured: false,
      host: null,
      reason: "POSTIZ_API_URL and POSTIZ_API_KEY are not set on this deployment.",
    };
  }

  const host = safeHost(config.base);

  try {
    const response = await fetch(`${config.base}/integrations`, {
      headers: { Authorization: config.key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();

    if (!response.ok) {
      return { ok: false, configured: true, host, reason: describeHttp(response.status, body, contentType, config.base) };
    }

    let integrations: unknown;
    try {
      integrations = JSON.parse(body);
    } catch {
      return {
        ok: false,
        configured: true,
        host,
        reason: `Postiz answered 200 but the body is not JSON (content-type "${contentType}"). POSTIZ_API_URL is probably the web app, not the API.`,
      };
    }

    if (!Array.isArray(integrations)) {
      return { ok: false, configured: true, host, reason: "Expected /integrations to return an array." };
    }

    const list = integrations as Integration[];
    return { ok: true, integrations: list, live: list.filter((i) => !i.disabled).length, host };
  } catch (error) {
    return { ok: false, configured: true, host, reason: describeTransport(error, host) };
  }
}

export async function listIntegrations(): Promise<Integration[]> {
  return call<Integration[]>("/integrations");
}

/**
 * Postiz's post listing takes a display window. The shape it returns has moved
 * between versions, so anything unexpected degrades to "no posts to show"
 * rather than breaking the page.
 */
export async function listPosts(weekOffsetDays = 14): Promise<{ posts: PostizPost[]; note?: string }> {
  const now = new Date();
  const from = new Date(now.getTime() - weekOffsetDays * 86_400_000);
  const query = new URLSearchParams({
    display: "month",
    day: String(now.getDate()),
    week: String(isoWeek(now)),
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    customer: "",
  });

  try {
    const result = await call<unknown>(`/posts?${query.toString()}`);
    const raw = Array.isArray(result)
      ? result
      : Array.isArray((result as { posts?: unknown })?.posts)
        ? (result as { posts: unknown[] }).posts
        : null;

    if (!raw) return { posts: [], note: "Postiz returned an unrecognised shape for /posts." };

    const posts = (raw as PostizPost[])
      .filter((post) => !post.publishDate || new Date(post.publishDate) >= from)
      .sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

    return { posts };
  } catch (error) {
    return { posts: [], note: error instanceof Error ? error.message : "Could not list posts." };
  }
}

function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function safeHost(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

function describeHttp(status: number, body: string, contentType: string, base: string): string {
  const snippet = body.slice(0, 240).replace(/\s+/g, " ").trim();
  if (status === 401 || status === 403) {
    return `Postiz rejected the key (${status}). POSTIZ_API_KEY is wrong, revoked, or from another workspace.`;
  }
  if (status === 404) {
    return `${base}/integrations returned 404. POSTIZ_API_URL is not the Postiz API origin — hosted is https://api.postiz.com, self-hosted is https://<host>/api.`;
  }
  if (contentType.includes("text/html")) {
    return `${base}/integrations returned HTML, not JSON. POSTIZ_API_URL points at the web app.`;
  }
  if (status >= 500) return `Postiz returned ${status} — the instance is erroring. ${snippet}`;
  return `Postiz /integrations returned ${status}: ${snippet}`;
}

function describeTransport(error: unknown, host: string): string {
  const err = error as { name?: string; message?: string; cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return `Postiz did not answer within ${TIMEOUT_MS / 1000}s (${host}).`;
  }
  switch (err?.cause?.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `DNS cannot resolve "${host}" — POSTIZ_API_URL points at a hostname that does not exist.`;
    case "ECONNREFUSED":
      return `Nothing is listening on "${host}" — the instance is down or the port is wrong.`;
    default:
      return `Could not reach ${host}: ${err?.message ?? "unknown error"}`;
  }
}
