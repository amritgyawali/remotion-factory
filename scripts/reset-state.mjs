#!/usr/bin/env node
/**
 * Reset the render/publish state to the initial phase of a fresh campaign.
 *
 * state.json is the single source of truth for what has posted, what is
 * rendered and waiting, and what slots have been promised to Postiz. It drifts
 * out of agreement with the accepted weeks when a campaign is re-scripted under
 * its own feet: ids that no accepted week contains linger in `posted` (w32-d03-*),
 * and every queue read fails with "state.json references ids that no accepted
 * week contains" until a human resolves it.
 *
 * This script is that resolution. It backs the current file up to out/ and
 * writes a clean initial phase: nothing posted, nothing rendered, no scheduled
 * slots. The embargo clock starts on the first real post because there is no
 * lastPostedAt to inherit.
 *
 *   node scripts/reset-state.mjs [--yes] [--dry-run]
 *
 * Destructive, so it refuses to run without --yes. A --dry-run prints what it
 * would do and touches nothing.
 */

import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATE_PATH = "state.json";
const BACKUP_DIR = "out";
const INITIAL_STATE = {
  posted: [],
  rendered: [],
  scheduled: [],
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const yes = process.argv.includes("--yes");

  if (!yes) {
    console.error(
      "Refusing to reset state.json without --yes. This permanently drops the record\n" +
        "of what has posted and what slots Postiz has been promised.",
    );
    process.exit(1);
  }

  let existing;
  try {
    existing = JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`${STATE_PATH} does not exist — writing a fresh initial state.`);
      existing = null;
    } else {
      throw new Error(`${STATE_PATH} is not valid JSON: ${error.message}`);
    }
  }

  if (existing !== null) {
    const backup = path.join(BACKUP_DIR, `state-${Date.now()}.json`);
    if (!dryRun) {
      await copyFile(STATE_PATH, backup);
      console.log(`backed up the previous state to ${backup}`);
    } else {
      console.log(`DRY RUN — would back up the previous state to ${backup}`);
    }

    const hadPosted = (existing.posted ?? []).length;
    const hadRendered = (existing.rendered ?? []).length;
    const hadScheduled = (existing.scheduled ?? []).length;
    console.log(
      `current state: ${hadPosted} posted, ${hadRendered} rendered, ${hadScheduled} scheduled`,
    );
  }

  const json = `${JSON.stringify(INITIAL_STATE, null, 2)}\n`;
  if (dryRun) {
    console.log("DRY RUN — would write the initial state:");
    console.log(json);
    return;
  }

  await writeFile(STATE_PATH, json);
  console.log(`reset ${STATE_PATH} to the initial phase.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
