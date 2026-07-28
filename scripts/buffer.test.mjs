import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approvalOf,
  buffered,
  discardRendered,
  loadQueueState,
  markRendered,
  pendingRender,
  publishable,
  setApproval,
} from "./queue.mjs";

/**
 * The handover between the two workflows.
 *
 * Rendering and publishing run on different clocks now — a batch each morning,
 * a post every six hours — and `state.rendered` is the only thing connecting
 * them. If it can hold a duplicate, lose an entry, or hand the publisher an id
 * that no accepted week contains, the two halves drift apart unattended.
 */

async function withState(contents, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "factory-buffer-"));
  const statePath = path.join(dir, "state.json");
  await writeFile(statePath, `${JSON.stringify(contents, null, 2)}\n`);
  try {
    return await run(statePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const entry = (id, extra = {}) => ({
  id,
  url: `https://example.com/${id}.mp4`,
  sha256: "a".repeat(64),
  week: "2026-w31",
  template: "TechTip",
  ...extra,
});

test("buffered returns rendered videos that have not posted, oldest first", () => {
  const state = {
    posted: ["d01-a"],
    rendered: [entry("d01-a"), entry("d01-b"), entry("d01-c")],
  };
  assert.deepEqual(
    buffered(state).map((item) => item.id),
    ["d01-b", "d01-c"],
  );
});

test("buffered is empty when everything rendered has posted", () => {
  assert.deepEqual(buffered({ posted: ["d01-a"], rendered: [entry("d01-a")] }), []);
  assert.deepEqual(buffered({ posted: [] }), []);
});

test("pendingRender skips what is posted and what is already buffered", () => {
  const queue = {
    pendingEntries: [
      { item: { id: "d01-b" } },
      { item: { id: "d01-c" } },
      { item: { id: "d01-d" } },
      { item: { id: "d02-a" } },
    ],
  };
  const state = { posted: ["d01-a"], rendered: [entry("d01-b")] };

  // d01-b is already rendered and waiting, so a second batch must not redo it.
  assert.deepEqual(
    pendingRender(queue, state, 2).map((e) => e.item.id),
    ["d01-c", "d01-d"],
  );
});

test("pendingRender honours the batch size", () => {
  const queue = { pendingEntries: [{ item: { id: "a1" } }, { item: { id: "b2" } }] };
  assert.equal(pendingRender(queue, { posted: [] }, 1).length, 1);
  assert.equal(pendingRender(queue, { posted: [] }, 9).length, 2);
});

test("re-rendering an id replaces its entry instead of duplicating it", async () => {
  await withState({ posted: [], rendered: [entry("d01-c", { bytes: 1 })] }, async (statePath) => {
    await markRendered(entry("d01-c", { bytes: 2 }), { statePath });
    const state = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(state.rendered.length, 1, "a retried render duplicated the buffer entry");
    assert.equal(state.rendered[0].bytes, 2);
    assert.ok(state.rendered[0].renderedAt, "renderedAt was not stamped");
  });
});

test("a buffer entry with no downloadable url is rejected on load", async () => {
  await withState({ posted: [], rendered: [{ id: "d01-c" }] }, async (statePath) => {
    await assert.rejects(() => loadQueueState(statePath), /no downloadable url/);
  });
});

test("a duplicate buffer entry is rejected on load", async () => {
  await withState({ posted: [], rendered: [entry("d01-c"), entry("d01-c")] }, async (statePath) => {
    await assert.rejects(() => loadQueueState(statePath), /duplicate rendered ids/);
  });
});

test("state with no rendered key still loads, for weeks recorded before the split", async () => {
  await withState({ posted: ["d01-a"] }, async (statePath) => {
    const state = await loadQueueState(statePath);
    assert.deepEqual(state.posted, ["d01-a"]);
    assert.deepEqual(publishable(state), []);
  });
});

test("approval gates what the publisher may send", () => {
  const state = {
    posted: [],
    rendered: [
      { ...entry('d01-b'), approval: 'pending' },
      { ...entry('d01-c'), approval: 'approved' },
      { ...entry('d01-d'), approval: 'rejected' },
    ],
  };

  // With review on, only the approved one goes out.
  assert.deepEqual(
    publishable(state, { approvalRequired: true }).map((e) => e.id),
    ['d01-c'],
  );

  // With review off, pending publishes too -- but rejected never does.
  assert.deepEqual(
    publishable(state, { approvalRequired: false }).map((e) => e.id),
    ['d01-b', 'd01-c'],
  );
});

test("an entry written before review existed counts as pending", () => {
  const state = { posted: [], rendered: [entry('d01-b')] };
  assert.equal(approvalOf(state.rendered[0]), 'pending');
  assert.deepEqual(publishable(state, { approvalRequired: true }), []);
});

test("setApproval records the decision and the time", async () => {
  await withState({ posted: [], rendered: [entry('d01-c')] }, async (statePath) => {
    await setApproval('d01-c', 'approved', { statePath });
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(state.rendered[0].approval, 'approved');
    assert.ok(state.rendered[0].reviewedAt);
  });
});

test("setApproval refuses an id that is not buffered, and a bogus state", async () => {
  await withState({ posted: [], rendered: [entry('d01-c')] }, async (statePath) => {
    await assert.rejects(() => setApproval('nope', 'approved', { statePath }), /not in the render buffer/);
    await assert.rejects(() => setApproval('d01-c', 'maybe', { statePath }), /approval must be one of/);
  });
});

test("discarding frees the id for the next batch to render again", async () => {
  await withState({ posted: [], rendered: [entry('d01-c'), entry('d01-d')] }, async (statePath) => {
    await discardRendered('d01-c', { statePath });
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.deepEqual(state.rendered.map((e) => e.id), ['d01-d']);

    const queue = { pendingEntries: [{ item: { id: 'd01-c' } }, { item: { id: 'd01-d' } }] };
    assert.deepEqual(pendingRender(queue, state, 4).map((e) => e.item.id), ['d01-c']);
  });
});

test("an invalid approval value is rejected on load", async () => {
  await withState({ posted: [], rendered: [{ ...entry('d01-c'), approval: 'sure' }] }, async (statePath) => {
    await assert.rejects(() => loadQueueState(statePath), /must be one of/);
  });
});
