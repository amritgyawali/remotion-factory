import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Cold archive on Cloudinary, storing the original file at full quality.
 *
 * This exists alongside the R2 archive rather than replacing it: R2 needs to be
 * enabled on the Cloudflare account before its endpoint will even complete a
 * TLS handshake, and until that happens Cloudinary is the cold copy that
 * actually works. Both are optional and independent — either one being absent
 * or failing must never stop a good video from publishing, because the GitHub
 * Release is the permanent archive.
 *
 * Nothing here applies a transformation. Cloudinary will happily re-encode on
 * delivery, and the whole point of this copy is to keep the master exactly as
 * Remotion and the loudness pass produced it.
 */

const API = "https://api.cloudinary.com/v1_1";

/**
 * The free plan is 25 monthly credits, where a credit is 1 GB of storage, or
 * 1 GB of viewing bandwidth, or 1000 transformations. Capping storage at 8 GB
 * leaves the rest of the allowance for delivery, which is the part that grows
 * when a video actually gets watched.
 */
export const BUDGET_BYTES = 8 * 1024 ** 3;

/** Cloudinary's free plan rejects a video above this. */
export const MAX_VIDEO_BYTES = 100 * 1024 ** 2;

export function configFromEnv(env = process.env) {
  // CLOUDINARY_URL is the documented single-variable form:
  // cloudinary://<api_key>:<api_secret>@<cloud_name>
  const url = env.CLOUDINARY_URL;
  if (url) {
    const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
    if (match) {
      return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
    }
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/**
 * Cloudinary signs the sorted parameter string with the API secret appended.
 * `file`, `api_key`, `resource_type` and `cloud_name` are excluded by the spec.
 */
export function signParams(params, apiSecret) {
  const signable = Object.entries(params)
    .filter(([key]) => !["file", "api_key", "resource_type", "cloud_name"].includes(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${signable}${apiSecret}`).digest("hex");
}

const authHeader = (config) =>
  `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`;

async function adminRequest(config, pathname, init = {}) {
  const response = await fetch(`${API}/${config.cloudName}${pathname}`, {
    ...init,
    headers: { Authorization: authHeader(config), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Cloudinary ${pathname} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Every archived video, following pagination. */
export async function listVideos(config, prefix = "") {
  const resources = [];
  let cursor;

  do {
    const query = new URLSearchParams({ resource_type: "video", max_results: "500" });
    if (prefix) query.set("prefix", prefix);
    if (cursor) query.set("next_cursor", cursor);

    const page = await adminRequest(config, `/resources/video/upload?${query}`);
    for (const resource of page.resources ?? []) {
      resources.push({
        publicId: resource.public_id,
        bytes: resource.bytes ?? 0,
        createdAt: resource.created_at ?? null,
        url: resource.secure_url ?? null,
      });
    }
    cursor = page.next_cursor;
  } while (cursor);

  return resources;
}

export async function deleteVideo(config, publicId) {
  const query = new URLSearchParams({ "public_ids[]": publicId });
  return adminRequest(config, `/resources/video/upload?${query}`, { method: "DELETE" });
}

/** Oldest first, only as many as needed to fit `incoming` inside the budget. */
export function selectForEviction(resources, incomingBytes, budget = BUDGET_BYTES) {
  const used = resources.reduce((total, resource) => total + resource.bytes, 0);
  let over = used + incomingBytes - budget;
  if (over <= 0) return [];

  const oldest = [...resources].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
  );

  const evict = [];
  for (const resource of oldest) {
    if (over <= 0) break;
    evict.push(resource);
    over -= resource.bytes;
  }
  return evict;
}

export async function archiveToCloudinary({
  file,
  item,
  weekId,
  env = process.env,
  budget = BUDGET_BYTES,
  folder = "meritbyte",
} = {}) {
  const config = configFromEnv(env);
  if (!config) {
    return { skipped: true, reason: "Cloudinary is not configured" };
  }

  const { size } = await stat(file);
  if (size > MAX_VIDEO_BYTES) {
    throw new Error(
      `${path.basename(file)} is ${(size / 1024 ** 2).toFixed(1)} MB, over Cloudinary's ` +
        `${MAX_VIDEO_BYTES / 1024 ** 2} MB per-video limit`,
    );
  }

  const publicId = `${folder}/${weekId}/${item.id}`;
  const existing = await listVideos(config, `${folder}/`);
  const others = existing.filter((resource) => resource.publicId !== publicId);

  const evicted = [];
  for (const resource of selectForEviction(others, size, budget)) {
    await deleteVideo(config, resource.publicId);
    evicted.push(resource.publicId);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp: String(timestamp),
    public_id: publicId,
    // Replace in place, so a retried render does not create a second copy.
    overwrite: "true",
    invalidate: "true",
  };

  const form = new FormData();
  const body = await readFile(file);
  form.append("file", new Blob([body], { type: "video/mp4" }), path.basename(file));
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append("api_key", config.apiKey);
  form.append("signature", signParams(params, config.apiSecret));

  const response = await fetch(`${API}/${config.cloudName}/video/upload`, {
    method: "POST",
    body: form,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Cloudinary upload failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const uploaded = JSON.parse(text);

  const usedAfter =
    others
      .filter((resource) => !evicted.includes(resource.publicId))
      .reduce((total, resource) => total + resource.bytes, 0) + size;

  return {
    skipped: false,
    publicId: uploaded.public_id,
    url: uploaded.secure_url,
    bytes: uploaded.bytes ?? size,
    evicted,
    usedBytes: usedAfter,
    budgetBytes: budget,
  };
}

/**
 * Account-level usage, for reporting only.
 *
 * Deliberately NOT what the budget is enforced against: Cloudinary aggregates
 * this periodically, and it still read zero objects immediately after an upload
 * that was already downloadable. Eviction works off the resource listing, which
 * is real-time — a budget driven by a lagging figure would happily overshoot.
 */
export async function cloudinaryUsage(env = process.env) {
  const config = configFromEnv(env);
  if (!config) return null;

  const usage = await adminRequest(config, "/usage");
  return {
    plan: usage.plan,
    credits: usage.credits ?? null,
    storageBytes: usage.storage?.usage ?? 0,
    objects: usage.objects?.usage ?? 0,
    bandwidthBytes: usage.bandwidth?.usage ?? 0,
  };
}

const mb = (bytes) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

async function main() {
  const usage = await cloudinaryUsage();
  if (!usage) {
    console.log("Cloudinary is not configured — set CLOUDINARY_URL");
    return;
  }
  console.log(
    `${usage.plan} plan — ${usage.objects} object(s), ${mb(usage.storageBytes)} stored, ` +
      `${mb(usage.bandwidthBytes)} delivered` +
      (usage.credits ? `, credits ${usage.credits.usage}/${usage.credits.limit}` : ""),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
