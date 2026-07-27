import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { archiveSpread, duplicateProblems } from "./uniqueness.mjs";

/**
 * Permanent storage for every video the factory publishes.
 *
 * The MP4s live as GitHub Release assets, not as committed files. Four videos
 * a day is roughly 1.2 GB a month; committing that would grow the repository
 * without bound and every future clone would pay for it. Release assets are
 * hosted by GitHub indefinitely, are not part of the git history, and have a
 * stable public download URL.
 *
 * What *is* committed is `archive/manifest.json`: a few hundred bytes per
 * video recording where it went and what it was. That keeps the repository
 * itself the answer to "what have we published", while the bytes stay out of
 * the object store.
 */

const API = "https://api.github.com";
const MANIFEST_PATH = "archive/manifest.json";

function releaseTag(weekId) {
  return `videos-${weekId}`;
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GitHub occasionally answers a burst with 5xx or a secondary rate limit.
 * Losing an archive upload should not lose the video, so transient failures
 * are retried with a widening gap before the caller ever sees an error.
 */
async function request(url, init = {}, attempt = 1) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (attempt > 3) throw error;
    await sleep(attempt * 2000);
    return request(url, init, attempt + 1);
  }

  if ((response.status >= 500 || response.status === 429) && attempt <= 3) {
    await sleep(attempt * 3000);
    return request(url, init, attempt + 1);
  }

  return response;
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function findRelease(repo, tag, token) {
  const response = await request(`${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: githubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed (${response.status}): ${await response.text()}`);
  }
  return readJson(response);
}

async function ensureRelease(repo, weekId, token) {
  const tag = releaseTag(weekId);
  const existing = await findRelease(repo, tag, token);
  if (existing) return existing;

  const response = await request(`${API}/repos/${repo}/releases`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: `Videos — ${weekId}`,
      body: `Rendered videos for weekly plan \`${weekId}\`. Uploaded automatically after each successful publish.`,
      draft: false,
      prerelease: false,
    }),
  });

  if (response.ok) return readJson(response);

  // A concurrent run may have created it between the lookup and the create.
  if (response.status === 422) {
    const raced = await findRelease(repo, tag, token);
    if (raced) return raced;
  }

  throw new Error(`Could not create release "${tag}" (${response.status}): ${await response.text()}`);
}

async function deleteExistingAsset(repo, release, name, token) {
  const asset = (release.assets ?? []).find((candidate) => candidate.name === name);
  if (!asset) return;

  // A retried run re-uploads the same name; GitHub rejects a duplicate.
  const response = await request(`${API}/repos/${repo}/releases/assets/${asset.id}`, {
    method: "DELETE",
    headers: githubHeaders(token),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not replace existing asset "${name}" (${response.status})`);
  }
}

async function uploadAsset(repo, release, file, name, token) {
  await deleteExistingAsset(repo, release, name, token);

  const body = await readFile(file);
  const base = release.upload_url.replace(/\{.*\}$/, "");
  const response = await request(`${base}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    // Content-Length is required by the upload API; fetch derives it from the
    // buffer, and setting it by hand risks a mismatch instead of preventing one.
    headers: { ...githubHeaders(token), "Content-Type": "video/mp4" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Asset upload failed for "${name}" (${response.status}): ${await response.text()}`);
  }
  return readJson(response);
}

export async function readManifest(manifestPath = MANIFEST_PATH) {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return Array.isArray(parsed?.videos) ? parsed : { videos: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { videos: [] };
    throw error;
  }
}

/**
 * One entry per video id. Re-archiving an id replaces its entry rather than
 * appending, so a retried run cannot produce two records of one video.
 */
export function mergeManifest(manifest, entry) {
  const videos = manifest.videos.filter((video) => video.id !== entry.id);
  videos.push(entry);
  videos.sort((a, b) => a.id.localeCompare(b.id));
  return { videos };
}

export async function writeManifest(manifest, manifestPath = MANIFEST_PATH) {
  await mkdir(path.dirname(manifestPath), { recursive: true });

  // Written via rename so a run killed mid-write cannot leave the committed
  // manifest truncated.
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporary, manifestPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function archiveVideo({
  file,
  item,
  weekId,
  verified,
  manifestPath = MANIFEST_PATH,
  repo = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
} = {}) {
  if (!repo || !token) {
    return { skipped: true, reason: "GITHUB_REPOSITORY and GITHUB_TOKEN are not both set" };
  }

  const name = `${item.id}.mp4`;

  // Uniqueness is checked before anything is uploaded or published. The plan
  // validator can only inspect the plan; this is the check that sees whether
  // the finished video is actually different from what already shipped.
  const manifest = await readManifest(manifestPath);
  const candidate = {
    id: item.id,
    visualSignature: verified?.visualSignature ?? null,
    audioSignature: verified?.audioSignature ?? null,
  };
  const duplicates = duplicateProblems(candidate, manifest.videos);
  if (duplicates.length) {
    throw new Error(`${item.id} is not unique:\n  - ${duplicates.join("\n  - ")}`);
  }

  const [release, sha256, { size }] = await Promise.all([
    ensureRelease(repo, weekId, token),
    sha256File(file),
    stat(file),
  ]);

  const asset = await uploadAsset(repo, release, file, name, token);
  const entry = {
    id: item.id,
    week: weekId,
    template: item.template,
    sourceId: item.sourceId ?? null,
    bytes: size,
    durationSeconds: verified?.duration ?? null,
    sha256,
    // Fingerprints, so every future render can be checked against this one.
    visualSignature: candidate.visualSignature,
    audioSignature: candidate.audioSignature,
    url: asset.browser_download_url,
    archivedAt: new Date().toISOString(),
  };

  await writeManifest(mergeManifest(manifest, entry), manifestPath);
  const spread = archiveSpread([...manifest.videos, entry]);
  return { skipped: false, url: entry.url, sha256, bytes: size, manifestPath, spread };
}

async function main() {
  const [file, id, weekId] = process.argv.slice(2);
  if (!file || !id || !weekId) {
    console.error("usage: node scripts/archive-video.mjs <file.mp4> <item-id> <week-id>");
    process.exit(1);
  }

  const result = await archiveVideo({ file, item: { id }, weekId });
  console.log(result.skipped ? `skipped — ${result.reason}` : `archived ${id} -> ${result.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
