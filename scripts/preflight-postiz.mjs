/**
 * Answers one question in about a second: can this run reach Postiz, and can
 * it post to the channels the next queue item names?
 *
 * It exists because a credential problem used to surface as a two-second
 * failure inside the render step — after apt, npm, the browser download and
 * the audio pack, with the reason only in the run log, which needs repo auth
 * to read. This runs first and writes its verdict to the job summary, which
 * anyone looking at the run can see.
 *
 *   npm run preflight
 */
import { appendFile } from "node:fs/promises";
import { loadEnvFile } from "./env.mjs";
import { getArchivedQueue } from "./queue.mjs";

loadEnvFile();

const TIMEOUT_MS = Number(process.env.POSTIZ_TIMEOUT_MS ?? 20_000);

/** Everything wrong with how the two variables were entered, before any network call. */
function inspectCredentials() {
  const rawUrl = process.env.POSTIZ_API_URL;
  const rawKey = process.env.POSTIZ_API_KEY;
  const problems = [];

  if (!rawUrl) problems.push("POSTIZ_API_URL is not set");
  if (!rawKey) problems.push("POSTIZ_API_KEY is not set");
  if (problems.length) return { problems };

  // Pasting into the GitHub secrets box picks up quotes and newlines
  // surprisingly often, and the resulting 401 looks like a bad key.
  if (rawKey !== rawKey.trim()) {
    problems.push("POSTIZ_API_KEY has leading or trailing whitespace — re-paste it");
  }
  if (/^["']|["']$/.test(rawKey.trim())) {
    problems.push("POSTIZ_API_KEY is wrapped in quotes — store the bare value");
  }
  if (rawUrl !== rawUrl.trim()) {
    problems.push("POSTIZ_API_URL has leading or trailing whitespace — re-paste it");
  }

  const url = rawUrl.trim().replace(/^["']|["']$/g, "");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    problems.push(`POSTIZ_API_URL is not a URL: "${url}"`);
    return { problems };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    problems.push(`POSTIZ_API_URL must be http or https — got "${parsed.protocol}"`);
  }

  const trimmed = url.replace(/\/+$/, "");
  const base = trimmed.endsWith("/public/v1") ? trimmed : `${trimmed}/public/v1`;

  return { problems, base, key: rawKey.trim(), host: parsed.host };
}

/** Turn whatever went wrong into a sentence that names the fix. */
function describeTransportError(error, base) {
  const code = error?.cause?.code ?? error?.code;
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  })();

  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return `Postiz did not answer within ${TIMEOUT_MS / 1000}s (${host}). If this is a self-hosted instance, check it is awake.`;
  }
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `DNS cannot resolve "${host}" — POSTIZ_API_URL points at a hostname that does not exist.`;
    case "ECONNREFUSED":
      return `Nothing is listening on "${host}" — the Postiz instance is down or the port is wrong.`;
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return `TLS certificate for "${host}" is not valid (${code}).`;
    default:
      return `Could not reach ${host}: ${error.message}${code ? ` (${code})` : ""}`;
  }
}

/** Turn an HTTP error into a sentence that names the fix. */
function describeHttpError(status, body, contentType, base) {
  const snippet = body.slice(0, 300).replace(/\s+/g, " ").trim();

  if (status === 401 || status === 403) {
    return `Postiz rejected the key (${status}). POSTIZ_API_KEY is wrong, revoked, or from a different workspace. Regenerate it in Postiz under Settings > Public API.`;
  }
  if (status === 404) {
    return `${base}/integrations returned 404. POSTIZ_API_URL points somewhere that is not the Postiz API. Use the API origin — hosted Postiz is https://api.postiz.com, self-hosted is https://<your-host>/api. The script appends /public/v1 itself.`;
  }
  if (contentType.includes("text/html")) {
    return `${base}/integrations returned HTML, not JSON. POSTIZ_API_URL is pointing at the Postiz web app instead of its API.`;
  }
  if (status >= 500) {
    return `Postiz returned ${status} — the instance is erroring, not your configuration. Body: ${snippet}`;
  }
  return `Postiz /integrations returned ${status}: ${snippet}`;
}

async function writeSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    await appendFile(file, `${markdown}\n`);
  } catch (error) {
    console.warn(`Could not write job summary: ${error.message}`);
  }
}

async function fail(lines) {
  const body = Array.isArray(lines) ? lines : [lines];
  for (const line of body) console.error(line);
  await writeSummary(
    ["## Postiz preflight failed", "", ...body.map((l) => `- ${l}`)].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const { problems, base, key, host } = inspectCredentials();
  if (!base) {
    await fail([
      ...problems,
      "Set both under Settings > Secrets and variables > Actions.",
    ]);
  }
  if (problems.length) await fail(problems);

  console.log(`Postiz API   ${base}`);
  console.log(`API key      ${key.length} characters`);

  let res;
  try {
    res = await fetch(`${base}/integrations`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    await fail([describeTransportError(error, base)]);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!res.ok) await fail([describeHttpError(res.status, body, contentType, base)]);

  let integrations;
  try {
    integrations = JSON.parse(body);
  } catch {
    await fail([
      `Postiz answered 200 but the body is not JSON (content-type "${contentType}"). POSTIZ_API_URL is probably the web app, not the API.`,
    ]);
  }
  if (!Array.isArray(integrations)) {
    await fail([`Expected /integrations to return an array, got ${typeof integrations}.`]);
  }

  const live = integrations.filter((i) => !i.disabled);
  console.log(`Channels     ${live.length} live of ${integrations.length} connected`);
  if (live.length === 0) {
    await fail([
      "Postiz has no enabled channels, so a post has nowhere to go. Connect an account in Postiz first.",
    ]);
  }

  // The credentials work. Now check they can serve the item that is actually
  // next, rather than only proving the token is valid.
  const queue = await getArchivedQueue();
  if (!queue.next) {
    console.log("Queue        empty — nothing to publish");
    await writeSummary("## Postiz preflight\n\nReachable. Queue is empty.");
    return;
  }

  const item = queue.next;
  const wanted = item.channels ?? queue.nextPlan.channels ?? [];
  const byId = new Map(live.map((i) => [i.id, i]));
  const byIdentifier = new Map();
  for (const i of live) byIdentifier.set(i.identifier, (byIdentifier.get(i.identifier) ?? 0) + 1);

  const missing = wanted.filter((ref) => !byId.has(ref) && !byIdentifier.has(ref));
  if (missing.length) {
    await fail([
      `${item.id} names ${missing.length} channel(s) that are not connected or are disabled in Postiz: ${missing.join(", ")}.`,
      "Run `npm run channels` and paste the current ids into the plan.",
    ]);
  }

  const targets = wanted.length
    ? wanted.map((ref) => byId.get(ref)?.name ?? ref)
    : live.map((i) => i.name);

  console.log(`Next         ${item.id} (${queue.nextWeek.id}), ${queue.remaining} remaining`);
  console.log(`Targets      ${targets.join(", ")}`);
  console.log(`Post type    ${queue.nextPlan.postType}`);

  await writeSummary(
    [
      "## Postiz preflight",
      "",
      `- Reached \`${host}\`, ${live.length} live channel(s)`,
      `- Next item: \`${item.id}\` (${queue.nextWeek.id}), ${queue.remaining} remaining`,
      `- Will post as **${queue.nextPlan.postType}** to: ${targets.join(", ")}`,
    ].join("\n"),
  );
}

main().catch(async (error) => {
  await fail([error.message]);
});
