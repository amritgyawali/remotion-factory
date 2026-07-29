import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assignExhibits } from "./backfill-exhibits.mjs";
import {
  EXHIBIT_KINDS,
  exhibitProblems,
  exhibitRequired,
  repeatedWithinDay,
  voiceProblems,
} from "./exhibits.mjs";
import { bandProblems, BAND_LIMITS } from "./inspect-band.mjs";
import { propsProblems, QUIET_CEILING_DB, QUIET_FLOOR_DB } from "./verify-script.mjs";

const require = createRequire(import.meta.url);
const registry = require("../src/exhibits/registry.json");

/* -------------------------------------------------------------------------- */
/* The catalogue                                                              */
/* -------------------------------------------------------------------------- */

test("every kind names templates that exist", () => {
  const templates = new Set(Object.keys(registry.preference));
  for (const [kind, spec] of Object.entries(registry.kinds)) {
    for (const template of spec.templates) {
      assert.ok(templates.has(template), `${kind} lists unknown template "${template}"`);
    }
  }
});

test("preference order and per-kind permission agree", () => {
  // The two halves of the catalogue can disagree without anything failing at
  // runtime — a kind listed as preferred but not permitted is simply skipped,
  // silently narrowing what a template can draw. That is how SiteRoast lost the
  // browser stage the first time.
  for (const [template, preferred] of Object.entries(registry.preference)) {
    if (template.startsWith("$")) continue;
    for (const kind of preferred) {
      assert.ok(registry.kinds[kind], `${template} prefers unknown kind "${kind}"`);
      assert.ok(
        registry.kinds[kind].templates.includes(template),
        `${template} prefers "${kind}" but that kind does not permit ${template}`,
      );
    }
  }
});

test("every template can draw at least one figure", () => {
  for (const [template, preferred] of Object.entries(registry.preference)) {
    if (template.startsWith("$")) continue;
    assert.ok(preferred.length > 0, `${template} has no figures at all`);
  }
});

test("the exhibit band sits inside the frame and leaves room at both ends", () => {
  assert.ok(registry.band.top > 0.15, "the band would collide with the hook");
  assert.ok(registry.band.bottom < 0.85, "the band would collide with the payoff");
  assert.ok(registry.band.bottom > registry.band.top);
});

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

test("a missing exhibit is refused", () => {
  assert.match(exhibitProblems(undefined, "StatCard")[0], /missing/);
});

test("an unknown kind is refused and the message lists the real ones", () => {
  const [problem] = exhibitProblems({ kind: "sankey" }, "StatCard");
  assert.match(problem, /not a known figure/);
  for (const kind of EXHIBIT_KINDS.slice(0, 3)) assert.ok(problem.includes(kind));
});

test("a kind is refused on a template that cannot draw it", () => {
  const problems = exhibitProblems({ kind: "browser" }, "StatCard");
  assert.ok(problems.some((p) => /not available to StatCard/.test(p)));
});

test("a chart-family figure must carry real numbers", () => {
  // The rule this project deleted a component over: a bar whose length came
  // from the frame counter measured nothing and invited the viewer to read a
  // value that does not exist.
  const problems = exhibitProblems(
    { kind: "bars", unit: "ms", series: [{ label: "before", value: "slow" }, { label: "after", value: 40 }] },
    "CaseStudy",
  );
  assert.ok(problems.some((p) => /must be a finite number/.test(p)));
});

test("a diagram-family figure needs no numbers", () => {
  const problems = exhibitProblems(
    { kind: "pipeline", stages: ["Fetch", "Render", "Cache"] },
    "TechTip",
  );
  assert.deepEqual(problems, []);
});

test("a figure with too many entries to read on a phone is refused", () => {
  const problems = exhibitProblems(
    { kind: "checklist", steps: Array.from({ length: 9 }, () => ({ label: "x", verdict: "pass" })) },
    "TechTip",
  );
  assert.ok(problems.some((p) => /2–5 entries/.test(p)));
});

test("a board must emphasise exactly one tile", () => {
  const tiles = Array.from({ length: 4 }, (_, i) => ({ label: `t${i}`, value: i + 1 }));
  assert.deepEqual(exhibitProblems({ kind: "board", tiles, emphasis: 2 }, "Recap"), []);
  assert.ok(
    exhibitProblems({ kind: "board", tiles, emphasis: 9 }, "Recap").some((p) => /emphasis/.test(p)),
  );
});

test("the rule starts at week 33 and not before", () => {
  assert.equal(exhibitRequired({ id: "w33-d01-a" }, "2026-w33"), true);
  assert.equal(exhibitRequired({ id: "w32-d01-a" }, "2026-w32"), false);
  // Week 31's ids carry no campaign position, so the week id has to answer.
  assert.equal(exhibitRequired({ id: "d01-a" }, "2026-w31"), false);
});

test("four posts in one day may not draw the same figure", () => {
  const day = (kinds) =>
    kinds.map((kind, index) => ({ id: `w33-d01-${"abcd"[index]}`, props: { exhibit: { kind } } }));

  assert.deepEqual(repeatedWithinDay(day(["dial", "bars", "trace", "code"])), []);
  assert.equal(repeatedWithinDay(day(["dial", "bars", "dial", "code"])).length, 1);
  // Stage kinds are exempt: a week of LogoLadder is one template wrecking a
  // different page each time, and that uniqueness is checked on the pixels.
  assert.deepEqual(repeatedWithinDay(day(["sitemock", "sitemock", "sitemock", "sitemock"])), []);
});

test("nothing in a script may put a voice on the track", () => {
  assert.ok(voiceProblems({ voiceover: "read this" }).length === 1);
  assert.ok(voiceProblems({ narration: "x" }).length === 1);
  assert.deepEqual(voiceProblems({ score: { cues: [{ frame: 0, sfx: "blip" }] } }), []);
  assert.ok(
    voiceProblems({ score: { cues: [{ frame: 0, sfx: "vo/take-3.mp3" }] } }).some((p) =>
      /file path/.test(p),
    ),
  );
});

/* -------------------------------------------------------------------------- */
/* Assignment                                                                 */
/* -------------------------------------------------------------------------- */

test("a day of four scripts is assigned four different figures", () => {
  const items = [
    { id: "w33-d01-a", template: "TechTip", props: { steps: ["One", "Two", "Three"] } },
    { id: "w33-d01-b", template: "CaseStudy", props: { actions: ["Alpha", "Beta", "Gamma"] } },
    { id: "w33-d01-c", template: "StatCard", props: { value: "32%", label: "leave", context: ["a", "b"] } },
    { id: "w33-d01-d", template: "ListReveal", props: { items: ["Red", "Green", "Blue", "Amber"] } },
  ];

  const assigned = assignExhibits(items, "2026-w33");
  assert.equal(assigned.filter(Boolean).length, 4);
  assert.equal(new Set(assigned.map((exhibit) => exhibit.kind)).size, 4);

  // And each one has to survive the gate it will be checked by.
  assigned.forEach((exhibit, index) => {
    assert.deepEqual(exhibitProblems(exhibit, items[index].template), [], items[index].id);
  });
});

test("assignment is deterministic", () => {
  const build = () => [
    { id: "w34-d02-a", template: "TechTip", props: { steps: ["One", "Two", "Three"] } },
    { id: "w34-d02-b", template: "TechTip", props: { steps: ["Four", "Five", "Six"] } },
  ];
  assert.equal(
    JSON.stringify(assignExhibits(build(), "2026-w34")),
    JSON.stringify(assignExhibits(build(), "2026-w34")),
  );
});

test("a script that already names a figure is left alone", () => {
  const items = [
    {
      id: "w33-d01-a",
      template: "TechTip",
      props: { steps: ["One", "Two", "Three"], exhibit: { kind: "radar", label: "x", targets: ["a", "b"] } },
    },
  ];
  assert.deepEqual(assignExhibits(items, "2026-w33"), [null]);
});

/* -------------------------------------------------------------------------- */
/* The finished file against its script                                       */
/* -------------------------------------------------------------------------- */

test("props matching the script pass, and any difference is named", () => {
  const item = { id: "w33-d01-a", props: { hook: "A", steps: ["one"] } };

  assert.deepEqual(propsProblems({ hook: "A", steps: ["one"], videoId: "w33-d01-a" }, item), []);

  const [problem] = propsProblems({ hook: "B", steps: ["one"], videoId: "w33-d01-a" }, item);
  assert.match(problem, /hook/);
});

test("a render seeded with the wrong id is refused", () => {
  // The id seeds palette, typeface, motion and musical key, so a mismatch
  // means the file is a different video however similar the words are.
  const [problem] = propsProblems({ hook: "A", videoId: "w33-d02-a" }, {
    id: "w33-d01-a",
    props: { hook: "A" },
  });
  assert.match(problem, /videoId/);
});

test("key order in a props file cannot fail a matching script", () => {
  const item = { id: "x", props: { a: 1, b: { c: 2, d: 3 } } };
  assert.deepEqual(propsProblems({ b: { d: 3, c: 2 }, a: 1, videoId: "x" }, item), []);
});

test("an empty, frozen or flashing band is refused", () => {
  const good = {
    settledInk: 0.13,
    motionFrames: 29,
    presenceFraction: 0.89,
  };
  assert.deepEqual(bandProblems(good), []);

  assert.ok(bandProblems({ ...good, settledInk: 0.001 }).some((p) => /empty/.test(p)));
  assert.ok(bandProblems({ ...good, motionFrames: 0 }).some((p) => /still image/.test(p)));
  assert.ok(bandProblems({ ...good, presenceFraction: 0.1 }).some((p) => /flashes/.test(p)));
});

test("the band floors sit under every real render measured", () => {
  // Seven renders across every template: ink 7.1%–21.9%, motion 26–89 frames,
  // presence 74%–100%. A floor that crept above the worst real measurement
  // would start failing good videos unattended.
  assert.ok(BAND_LIMITS.minSettledInk < 0.071);
  assert.ok(BAND_LIMITS.minMotionFrames < 26);
  assert.ok(BAND_LIMITS.minPresenceFraction < 0.74);
});

test("the quiet band brackets a real mastered render", () => {
  // A mastered video measured -29.4 dB mean. The ceiling is what catches an
  // unmastered mix going out at full level; the floor catches silence behind a
  // valid AAC stream.
  assert.ok(QUIET_FLOOR_DB < -29.4 && -29.4 < QUIET_CEILING_DB);
});
