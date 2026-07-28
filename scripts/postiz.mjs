import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";
import { assertWithinEmbargo, describeSlot } from "./slots.mjs";

/**
 * The Postiz client, shared by the render batch's preflight and the publish
 * step that actually sends a video.
 *
 * It lives on its own because rendering and publishing are now separate
 * workflows: the batch renders four videos each morning and the publisher
 * sends one every six hours. Two copies of the channel-resolution rules would
 * be two chances for the publisher to disagree with the check that passed.
 */

loadEnvFile();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function postizBase() {
  const url = process.env.POSTIZ_API_URL;
  if (!url) return null;
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/public/v1") ? trimmed : `${trimmed}/public/v1`;
}

export function assertConfigured() {
  const base = postizBase();
  const key = process.env.POSTIZ_API_KEY;
  if (!base || !key) throw new Error("POSTIZ_API_KEY and POSTIZ_API_URL are required");
  return { base, key: key.trim() };
}

export async function postiz(pathname, init = {}, attempt = 1) {
  const { base, key } = assertConfigured();

  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { Authorization: key, ...(init.headers ?? {}) },
  });

  // Postiz rate-limits per minute; backing off and retrying is far better than
  // failing a run that has already spent a render.
  if (response.status === 429 && attempt <= 5) {
    const wait = attempt * 60_000;
    console.warn(`  rate limited, waiting ${wait / 1000}s then retrying`);
    await sleep(wait);
    return postiz(pathname, init, attempt + 1);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Postiz ${pathname} -> ${response.status}: ${body.slice(0, 400)}`);
  }
  return body ? JSON.parse(body) : null;
}

export async function listIntegrations() {
  return postiz("/integrations");
}

export async function uploadToPostiz(file) {
  const buffer = await readFile(file);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/mp4" }), path.basename(file));
  // Do not set Content-Type — fetch writes the multipart boundary itself.
  const uploaded = await postiz("/upload", { method: "POST", body: form });
  const media = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  if (!media?.id) {
    throw new Error(`Upload returned no id: ${JSON.stringify(uploaded).slice(0, 300)}`);
  }
  return media;
}

/**
 * Resolve the channel list for one item. IDs are the safe way to name a
 * channel: identifiers are not unique — two Instagram accounts both report
 * "instagram-standalone", and matching on that would publish to both.
 */
export function resolveChannels(item, plan, integrations) {
  const live = integrations.filter((integration) => !integration.disabled);
  const wanted = item.channels ?? plan.channels ?? [];

  if (wanted.length === 0) {
    console.warn(`  no channels specified — posting to all ${live.length} connected channels`);
    return live;
  }

  const resolved = [];
  for (const ref of wanted) {
    const byId = live.find((integration) => integration.id === ref);
    if (byId) {
      resolved.push(byId);
      continue;
    }

    const byIdentifier = live.filter((integration) => integration.identifier === ref);
    if (byIdentifier.length === 1) {
      resolved.push(byIdentifier[0]);
    } else if (byIdentifier.length > 1) {
      throw new Error(
        `"${ref}" matches ${byIdentifier.length} channels (${byIdentifier
          .map((integration) => `${integration.name} = ${integration.id}`)
          .join(", ")}). Use the integration id so the post lands on the right account.`,
      );
    } else {
      throw new Error(`"${ref}" matches no connected channel. Run: npm run channels`);
    }
  }

  // Same id listed twice would post twice.
  return [...new Map(resolved.map((integration) => [integration.id, integration])).values()];
}

export function buildPosts(item, media, integrations, plan) {
  const wanted = resolveChannels(item, plan, integrations);
  if (wanted.length === 0) throw new Error(`no live channels for ${item.id}`);

  const settingsFor = (integration) => ({
    __type: integration.identifier,
    // Keyed by id last so two accounts on the same platform can differ.
    ...(plan.channelSettings?.[integration.identifier] ?? {}),
    ...(plan.channelSettings?.[integration.id] ?? {}),
  });

  return wanted.map((integration) => ({
    integration: { id: integration.id },
    value: [{ content: item.caption, image: [{ id: media.id, path: media.path }] }],
    settings: settingsFor(integration),
  }));
}

/**
 * Hand one finished video to Postiz, to be published at `date`.
 *
 * `date` is required and has no default. It used to be `new Date()` — post on
 * receipt — and a default like that is exactly how an embargoed post escapes:
 * one caller forgets the argument and the video goes out immediately. A missing
 * date is now a failure, and the date it is given is checked against the
 * embargo before a single byte is uploaded.
 */
export async function publishVideo({ file, item, plan, integrations, date }) {
  if (date === undefined) {
    throw new Error(
      `publishVideo({ date }) is required — ${item.id} has no scheduled slot. ` +
        "See scripts/slots.mjs::nextSlot.",
    );
  }

  // Before the upload, not after. A rejected schedule should cost nothing, and
  // an upload that is never referenced by a post is litter in the media library.
  const when = assertWithinEmbargo(date, { postType: plan.postType });

  const media = await uploadToPostiz(file);
  await postiz("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: plan.postType,
      date: when.toISOString(),
      shortLink: false,
      tags: [],
      posts: buildPosts(item, media, integrations, plan),
    }),
  });
  return { mediaId: media.id, scheduledFor: when.toISOString(), readable: describeSlot(when) };
}

/** Telegram is optional and stays optional; a missing token is not an error. */
export async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
  } catch (error) {
    console.warn(`Telegram notify failed: ${error.message}`);
  }
}

/** Failures must be visible without Telegram and without log-download rights. */
export async function jobSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const { appendFile } = await import("node:fs/promises");
  await appendFile(file, `${markdown}\n`).catch(() => {});
}
