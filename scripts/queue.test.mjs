import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acceptWeek } from "./accept-week.mjs";
import { getArchivedQueue, markArchivedPosted } from "./queue.mjs";
import { frozenItemChanges, weeklyPlanErrors } from "./weekly-plan.mjs";

const slots = ["a", "b", "c", "d"];

function makePlan(weekId = "2026-w31", order = 202631) {
  const compactWeek = weekId.replace("-", "");
  const items = Array.from({ length: 28 }, (_, index) => {
    const day = Math.floor(index / 4) + 1;
    const slot = slots[index % 4];
    const number = index + 1;
    const common = {
      id: `mb-${compactWeek}-d${String(day).padStart(2, "0")}-${slot}`,
      sourceId: `source-${compactWeek}-${String(number).padStart(2, "0")}`,
      caption:
        `Week ${weekId} lesson ${number} explains principle ${number} clearly.\n\n` +
        "#meritbyte #learning #careers",
    };

    // Two figures per template, chosen on parity. Templates repeat every three
    // items, so the only way one can appear twice inside a four-item day is at
    // i and i+3 — which differ in parity and therefore never draw the same
    // figure. See repeatedWithinDay.
    const alternate = index % 2 === 0;

    // Three formats, not two. A 28-item week may give at most a third of itself
    // to one template — see templateConcentrationErrors — so an alternating
    // fixture of 14 and 14 is not an acceptable week and cannot stand in for one.
    if (index % 3 === 0) {
      return {
        ...common,
        template: "StatCard",
        props: {
          eyebrow: "MeritByte",
          day,
          durationInSeconds: 8,
          // Carries the week, because StatCard has no hook and leads on its
          // figure — so the figure is what hookKey compares across weeks.
          value: `${number}.${compactWeek.slice(-2)}x`,
          label: `Result ${compactWeek} number ${number}`,
          context: [
            `Principle ${number} changes ${compactWeek}`,
            `Apply lesson ${number} in ${compactWeek}`,
          ],
          kicker: "SAVE THIS",
          exhibit: alternate
            ? { kind: "dial", value: number, unit: "x", caption: `Result ${number}` }
            : {
                kind: "bars",
                unit: "x",
                series: [
                  { label: "before", value: 1 },
                  { label: "after", value: number },
                ],
              },
        },
      };
    }

    if (index % 3 === 1) {
      return {
        ...common,
        template: "ListReveal",
        props: {
          eyebrow: "MeritByte",
          day,
          durationInSeconds: 10,
          headline: `Four ${compactWeek} moves for principle ${number}`,
          items: [
            `Start ${compactWeek} lesson ${number}`,
            `Measure ${compactWeek} result ${number}`,
            `Review ${compactWeek} signal ${number}`,
            `Repeat ${compactWeek} practice ${number}`,
          ],
          kicker: "TRY THIS",
          exhibit: alternate
            ? {
                kind: "checklist",
                steps: [
                  { label: `Start ${compactWeek} lesson ${number}`, verdict: "pass" },
                  { label: `Measure ${compactWeek} result ${number}`, verdict: "warn" },
                ],
              }
            : {
                kind: "meters",
                unit: "count",
                rows: [
                  { label: `Signal ${number}`, value: number },
                  { label: `Practice ${number}`, value: number + 1 },
                ],
              },
        },
      };
    }

    return {
      ...common,
      template: "TechTip",
      props: {
        eyebrow: "MeritByte",
        day,
        durationInSeconds: 20,
        hook: `Check ${compactWeek} step ${number}`,
        steps: [
          `Open ${compactWeek} panel ${number}`,
          `Compare ${compactWeek} reading ${number}`,
          `Record ${compactWeek} outcome ${number}`,
        ],
        result: `Step ${number} settles ${compactWeek} in one pass.`,
        variant: "devtools",
        kicker: "SAVE THIS",
        exhibit: alternate
          ? {
              kind: "pipeline",
              stages: [`Open panel ${number}`, `Compare reading ${number}`, `Record ${number}`],
            }
          : {
              kind: "code",
              filename: `step-${number}.sh`,
              lines: [`# open panel ${number}`, `# record outcome ${number}`],
              highlight: 1,
            },
      },
    };
  });

  return {
    series: "MeritByte",
    mode: "queue",
    postType: "draft",
    channels: [],
    channelSettings: {},
    week: { id: weekId, order },
    items,
  };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "remotion-weekly-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planPath = path.join(root, "plan.json");
  const plansDir = path.join(root, "plans");
  const statePath = path.join(root, "state.json");
  await writeJson(statePath, { posted: [] });
  return { root, planPath, plansDir, statePath };
}

test("weekly shape requires 28 ordered items across seven four-slot days", () => {
  const short = makePlan();
  short.items.pop();
  assert.match(weeklyPlanErrors(short).join("\n"), /exactly 28 items/);

  const wrongDay = makePlan();
  wrongDay.items[4].props.day = 1;
  wrongDay.items[4].id = wrongDay.items[4].id.replace("-d02-a", "-d01-a");
  const errors = weeklyPlanErrors(wrongDay).join("\n");
  assert.match(errors, /id must end with "d02-a"/);
  assert.match(errors, /props\.day must be 2/);
});

test("accepts a new week and treats the identical plan as a no-op", async (t) => {
  const paths = await fixture(t);
  const plan = makePlan();
  await writeJson(paths.planPath, plan);

  const created = await acceptWeek(paths);
  assert.equal(created.action, "created");
  assert.equal(created.changed, true);

  const unchanged = await acceptWeek(paths);
  assert.equal(unchanged.action, "unchanged");
  assert.equal(unchanged.changed, false);
  assert.deepEqual(JSON.parse(await readFile(created.archivePath, "utf8")), plan);
});

test("locks the items that have posted and leaves the rest of the week editable", async (t) => {
  const paths = await fixture(t);
  const plan = makePlan();
  await writeJson(paths.planPath, plan);
  await acceptWeek(paths);

  const edited = structuredClone(plan);
  edited.items[0].caption =
    "An edited first lesson remains unique before publishing.\n\n#meritbyte #learning #careers";
  edited.items[0].props.context[0] = "Edited principle changes the outcome";
  await writeJson(paths.planPath, edited);

  const updated = await acceptWeek(paths);
  assert.equal(updated.action, "updated");

  await writeJson(paths.statePath, { posted: [plan.items[0].id] });

  // Still queued, so still a plan: a week found to be full of near-identical
  // scripts has to be repairable without republishing what already went out.
  const repaired = structuredClone(edited);
  repaired.items[1].caption =
    "A queued lesson is rewritten during a repair.\n\n#meritbyte #learning #careers";
  repaired.items[1].props.headline = "A changed headline before publishing";
  await writeJson(paths.planPath, repaired);
  assert.equal((await acceptWeek(paths)).action, "updated");

  // Already public, so frozen under its own id.
  const rewritesPosted = structuredClone(repaired);
  rewritesPosted.items[0].props.context[0] = "A second edit after publishing";
  await writeJson(paths.planPath, rewritesPosted);
  await assert.rejects(() => acceptWeek(paths), /has already posted and would be rewritten/);
});

test("a posted item may not be rewritten or dropped, an unposted one may be", () => {
  const existing = makePlan();
  const posted = [existing.items[0].id];

  assert.deepEqual(frozenItemChanges(existing, structuredClone(existing), posted), []);

  const editsQueued = structuredClone(existing);
  editsQueued.items[1].props.headline = "Rewritten while still in the queue";
  assert.deepEqual(frozenItemChanges(existing, editsQueued, posted), []);

  const editsPosted = structuredClone(existing);
  editsPosted.items[0].props.value = "99x";
  assert.deepEqual(frozenItemChanges(existing, editsPosted, posted), [
    `${existing.items[0].id} has already posted and would be rewritten`,
  ]);

  // Removal is checked here rather than through acceptWeek, because a week one
  // item short fails the 28-item rule first and never reaches this.
  const dropsPosted = structuredClone(existing);
  dropsPosted.items.shift();
  assert.deepEqual(frozenItemChanges(existing, dropsPosted, posted), [
    `${existing.items[0].id} has already posted and would be removed`,
  ]);
});

test("postType stays changeable after a week has started, posted content does not", async (t) => {
  const paths = await fixture(t);
  const plan = makePlan();
  plan.postType = "draft";
  await writeJson(paths.planPath, plan);
  await acceptWeek(paths);
  await writeJson(paths.statePath, { posted: [plan.items[0].id] });

  // Releasing a running week live is an owner decision, not a content edit.
  const released = structuredClone(plan);
  released.postType = "now";
  await writeJson(paths.planPath, released);

  const updated = await acceptWeek(paths);
  assert.equal(updated.action, "updated");
  assert.equal(JSON.parse(await readFile(updated.archivePath, "utf8")).postType, "now");

  // Riding along on a postType change must not smuggle an edit to a video that
  // is already public.
  const smuggled = structuredClone(released);
  smuggled.postType = "draft";
  smuggled.items[0].caption =
    "A caption edit hidden behind a postType change.\n\n#meritbyte #learning #careers";
  await writeJson(paths.planPath, smuggled);

  await assert.rejects(() => acceptWeek(paths), /has already posted and would be rewritten/);
});

test("rejects duplicate ids, source ids, captions, and visible copy across weeks", async (t) => {
  const paths = await fixture(t);
  const first = makePlan();
  await writeJson(paths.planPath, first);
  await acceptWeek(paths);

  const second = makePlan("2026-w32", 202632);
  second.items[0].id = first.items[0].id;
  second.items[1].sourceId = first.items[1].sourceId;
  second.items[2].caption = first.items[2].caption;
  // Index 4 rather than 3: the fixture cycles three templates, and this case
  // needs the one with a headline and a list to copy.
  second.items[4].props.headline = first.items[4].props.headline;
  second.items[4].props.items = [...first.items[4].props.items];
  // The figure's labels are visible copy too, so they have to match as well for
  // this to be the same video rather than merely a similar one.
  second.items[4].props.exhibit = structuredClone(first.items[4].props.exhibit);
  await writeJson(paths.planPath, second);

  await assert.rejects(
    () => acceptWeek(paths),
    (error) =>
      /duplicate item id/.test(error.message) &&
      /duplicate sourceId/.test(error.message) &&
      /duplicate caption/.test(error.message) &&
      /duplicate visible copy/.test(error.message),
  );
});

test("a new week must be ordered after every accepted week", async (t) => {
  const paths = await fixture(t);
  await writeJson(paths.planPath, makePlan("2026-w31", 202631));
  await acceptWeek(paths);
  await writeJson(paths.planPath, makePlan("2026-w30", 202630));

  await assert.rejects(
    () => acceptWeek(paths),
    /new week order 202630 must be greater than accepted order 202631/,
  );
});

test("queue finishes an older week before rolling to the next accepted week", async (t) => {
  const paths = await fixture(t);
  const first = makePlan();
  const second = makePlan("2026-w32", 202632);
  await writeJson(paths.planPath, first);
  await acceptWeek(paths);
  await writeJson(paths.planPath, second);
  await acceptWeek(paths);

  await writeJson(paths.statePath, { posted: first.items.slice(0, 27).map((item) => item.id) });
  const before = await getArchivedQueue(paths);
  assert.equal(before.next.id, first.items[27].id);
  assert.equal(before.nextWeek.id, "2026-w31");
  assert.equal(before.remaining, 29);

  const after = await markArchivedPosted(first.items[27].id, paths);
  assert.equal(after.next.id, second.items[0].id);
  assert.equal(after.nextWeek.id, "2026-w32");
  assert.equal(after.remaining, 28);
});

test("queue refuses posted ids whose accepted archive is missing", async (t) => {
  const paths = await fixture(t);
  await writeJson(paths.statePath, { posted: ["missing-week-d01-a"] });
  await assert.rejects(() => getArchivedQueue(paths), /ids no longer in the accepted weekly plans/);
});
