import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadQueueState } from "./queue.mjs";

/**
 * Fold every shard's render buffer back into one state.json.
 *
 * Twenty parallel jobs cannot each commit their own state.json. They would
 * race, and `git pull --rebase` does not merge two different appends to the
 * same JSON array — the first push wins, the rest rebase onto it and either
 * conflict or quietly drop entries, which means paying for a render and then
 * losing the pointer to it. The masters would sit in the Release with nothing
 * on main knowing they existed.
 *
 * So the shards upload their state.json as an artifact and this merges them
 * afterwards, in one job, into one commit.
 *
 * The merge is a union keyed by id. Each shard started from the same main, so
 * every copy shares a common ancestor and differs only by the entries that
 * shard added; taking the union of `rendered` by id reconstructs exactly the
 * set of videos the whole run produced. `posted` and `scheduled` are unioned
 * the same way for safety, though a render run does not write them.
 *
 *   node scripts/merge-shards.mjs --from shards [--state state.json]
 */

function argValue(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

/** Every state.json under the downloaded artifact tree, one per shard. */
async function shardStateFiles(root) {
  const found = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === "state.json") found.push(full);
    }
  }

  await walk(root);
  return found.sort();
}

/**
 * Union of buffer entries by id, newest render winning.
 *
 * A duplicate id across two shards should not happen — shard-plan.mjs deals
 * each id to exactly one shard — but if it ever does, the later render is the
 * one whose master is actually in the Release, so it is the one to keep.
 */
export function mergeRendered(base, incoming) {
  const byId = new Map();

  for (const entry of [...base, ...incoming]) {
    if (!entry?.id) continue;
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }
    const existingAt = Date.parse(existing.renderedAt ?? 0) || 0;
    const candidateAt = Date.parse(entry.renderedAt ?? 0) || 0;
    if (candidateAt >= existingAt) byId.set(entry.id, entry);
  }

  return [...byId.values()].sort((a, b) =>
    String(a.renderedAt ?? "").localeCompare(String(b.renderedAt ?? "")),
  );
}

const unionById = (base, incoming) => {
  const byId = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of incoming) if (entry?.id) byId.set(entry.id, entry);
  return [...byId.values()];
};

export async function mergeShards({ from = "shards", statePath = "state.json" } = {}) {
  // The checked-out main, not any shard's copy: it is the only version that is
  // guaranteed not to be mid-run, and it is what the commit will be based on.
  const state = await loadQueueState(statePath);
  const files = await shardStateFiles(from);

  let rendered = state.rendered ?? [];
  let scheduled = state.scheduled ?? [];
  const posted = new Set(state.posted ?? []);
  const merged = [];

  for (const file of files) {
    let shard;
    try {
      shard = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      // A shard that failed before writing leaves a truncated file. Skipping is
      // right — its videos simply were not rendered — but it must be reported,
      // because silently dropping a shard looks identical to a shard that had
      // nothing to do.
      console.warn(`  skipping unreadable ${file}: ${error.message}`);
      continue;
    }

    const before = rendered.length;
    rendered = mergeRendered(rendered, shard.rendered ?? []);
    scheduled = unionById(scheduled, shard.scheduled ?? []);
    for (const id of shard.posted ?? []) posted.add(id);

    merged.push({ file, added: rendered.length - before });
  }

  const next = {
    ...state,
    posted: [...posted],
    rendered,
    ...(scheduled.length ? { scheduled } : {}),
  };

  await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`);
  return { merged, buffered: rendered.length };
}

async function main() {
  const from = argValue("--from", "shards");
  const statePath = argValue("--state", "state.json");

  const { merged, buffered } = await mergeShards({ from, statePath });

  if (merged.length === 0) {
    console.log(`No shard state found under ${from} — nothing to merge.`);
    return;
  }

  for (const entry of merged) {
    console.log(`  ${entry.file}: +${entry.added} buffered`);
  }
  console.log(`\n${merged.length} shard(s) merged. ${buffered} video(s) now waiting to post.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
