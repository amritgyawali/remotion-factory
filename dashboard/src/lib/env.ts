import "server-only";

/**
 * Every secret this dashboard holds. Read through these helpers rather than
 * process.env directly, so a missing variable surfaces as one clear message on
 * the page instead of an undefined slipping into an Authorization header and
 * coming back as an opaque 401.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new EnvError(name);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export class EnvError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`${variable} is not set. Add it in Vercel under Settings > Environment Variables.`);
    this.name = "EnvError";
    this.variable = variable;
  }
}

/** owner/repo, e.g. "amritgyawali/remotion-factory". */
export function repoSlug(): string {
  const slug = required("GITHUB_REPO");
  if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) {
    throw new Error(`GITHUB_REPO must look like "owner/repo" — got "${slug}"`);
  }
  return slug;
}

export function githubToken(): string {
  return required("GITHUB_TOKEN");
}

/** The branch the factory publishes from. Writes and reads both target it. */
export function repoBranch(): string {
  return optional("GITHUB_BRANCH") ?? "main";
}

export function dashboardPassword(): string {
  return required("DASHBOARD_PASSWORD");
}

/** Signing key for the session cookie. Distinct from the password. */
export function sessionSecret(): string {
  const secret = required("DASHBOARD_SECRET");
  if (secret.length < 32) {
    throw new Error("DASHBOARD_SECRET must be at least 32 characters — generate one with `openssl rand -hex 32`");
  }
  return secret;
}

/**
 * Postiz is optional: the rest of the dashboard stays useful when it is not
 * configured, so this returns null instead of throwing.
 */
export function postizConfig(): { base: string; key: string } | null {
  const url = optional("POSTIZ_API_URL");
  const key = optional("POSTIZ_API_KEY");
  if (!url || !key) return null;

  const trimmed = url.trim().replace(/\/+$/, "");
  return {
    base: trimmed.endsWith("/public/v1") ? trimmed : `${trimmed}/public/v1`,
    key: key.trim(),
  };
}

/** Mirrors MIN_GAP_HOURS in scripts/due.mjs so the dashboard predicts the same slot. */
export function minGapHours(): number {
  const raw = optional("MIN_GAP_HOURS");
  const parsed = raw ? Number(raw) : 5;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}
