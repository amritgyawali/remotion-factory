import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
import { RETIRED_TEMPLATES, templateConcentrationErrors } from "./validate-plan.mjs";
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

test("the rule starts at week 32, except for the two self-staged templates", () => {
  assert.equal(exhibitRequired({ id: "w33-d01-a" }, "2026-w33"), true);
  assert.equal(exhibitRequired({ id: "w32-d01-c" }, "2026-w32"), true);
  // Week 31's ids carry no campaign position, so the week id has to answer.
  assert.equal(exhibitRequired({ id: "d01-a" }, "2026-w31"), false);

  // Both spend their whole runtime wrecking a rendered page, which is the
  // figure, and both have already posted — so they are exempt by template
  // rather than by week, whatever week they turn up in.
  for (const template of ["LogoLadder", "WorksOnMyMachine"]) {
    assert.equal(exhibitRequired({ id: "w32-d01-b", template }, "2026-w32"), false);
    assert.equal(exhibitRequired({ id: "w33-d05-a", template }, "2026-w33"), false);
  }
});

test("four posts in one day may not draw the same figure", () => {
  const day = (kinds) =>
    kinds.map((kind, index) => ({ id: `w33-d01-${"abcd"[index]}`, props: { exhibit: { kind } } }));

  assert.deepEqual(repeatedWithinDay(day(["dial", "bars", "trace", "code"])), []);
  assert.equal(repeatedWithinDay(day(["dial", "bars", "dial", "code"])).length, 1);
  // Stage kinds are exempt: a browser, a terminal and a chat thread are settings
  // rather than figures. Concentration of one template is refused separately,
  // by validate-plan.mjs, which is what this exemption used to be leaned on for.
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

/* -------------------------------------------------------------------------- */
/* The worked examples                                                        */
/* -------------------------------------------------------------------------- */

test("every kind has a worked example, and every example still validates", () => {
  // Five kinds are not used by any current script, because the copy as written
  // carries neither the measurements nor the short labels they need. The
  // examples file is what keeps them reachable instead of dead — so it has to
  // stay correct, and it has to stay complete.
  const examples = require("../docs/exhibit-examples.json");

  for (const kind of EXHIBIT_KINDS) {
    const example = examples[kind];
    assert.ok(example, `no worked example for "${kind}" in docs/exhibit-examples.json`);
    assert.equal(example.exhibit.kind, kind, `${kind}'s example declares a different kind`);
    assert.deepEqual(
      exhibitProblems(example.exhibit, example.template),
      [],
      `the worked example for "${kind}" no longer validates on ${example.template}`,
    );
  }
});

test("the cartogram example names only real region codes", () => {
  // An unknown code is drawn as an absent cell, so a typo would silently drop a
  // region from the map rather than fail.
  const examples = require("../docs/exhibit-examples.json");
  const codes = new Set(
    readFileSync(new URL("../src/exhibits/charts.tsx", import.meta.url), "utf8")
      .match(/code: "([A-Z]{2,3})"/g)
      ?.map((match) => match.slice(7, -1)) ?? [],
  );

  assert.ok(codes.size >= 12, "could not read the tile grid out of charts.tsx");
  for (const region of examples.cartogram.exhibit.regions) {
    assert.ok(codes.has(region.label), `"${region.label}" is not a tile on the world grid`);
  }
});

/* -------------------------------------------------------------------------- */
/* The wiring — these gates are only worth having if they cannot be removed    */
/* -------------------------------------------------------------------------- */

/**
 * Source read as text, which is the pattern uniqueness-matrix.mjs already
 * establishes for the same reason: the thing worth asserting is a fact about
 * the pipeline, and there is no way to observe it without running a render.
 * A render costs eight minutes and, on a full disk, does not run at all.
 */
const readSource = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

test("every template puts a figure in the band", () => {
  // The headline rule, enforced at the one place it can be: a template that
  // stopped drawing an exhibit would produce words on a colour field, and
  // every other check in this repository would pass it.
  const native = new Set(["LogoLadder.tsx", "WorksOnMyMachine.tsx"]);
  const dir = new URL("../src/templates/", import.meta.url);

  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    const source = readFileSync(new URL(name, dir), "utf8");

    if (native.has(name)) {
      // These two are built entirely around their own stage and take no panel.
      assert.match(source, /SiteMock|Machine/, `${name} lost its native stage`);
      continue;
    }
    assert.match(source, /<Exhibit\b/, `${name} does not draw an exhibit`);
    assert.match(source, /resolveExhibit\(/, `${name} does not resolve one`);
  }
});

test("the render pipeline checks a finished file against its script", () => {
  const source = readSource("./render-all.mjs");
  assert.match(source, /assertMatchesScript/, "render-all no longer verifies against the script");
  // The two arguments that make it a real check rather than a formality: the
  // week decides whether the exhibit gate applies, and the props file is the
  // evidence that this render was of this script.
  assert.match(source, /assertMatchesScript\([\s\S]{0,200}weekId/, "weekId is not passed");
  assert.match(source, /assertMatchesScript\([\s\S]{0,200}propsFile/, "propsFile is not passed");
});

test("the plan validator runs the exhibit gate", () => {
  const source = readSource("./validate-plan.mjs");
  assert.match(source, /exhibitProblems/);
  assert.match(source, /repeatedWithinDay/);
  assert.match(source, /voiceProblems/);
});

test("the quiet band brackets a real mastered render", () => {
  // A mastered video measured -29.4 dB mean. The ceiling is what catches an
  // unmastered mix going out at full level; the floor catches silence behind a
  // valid AAC stream.
  assert.ok(QUIET_FLOOR_DB < -29.4 && -29.4 < QUIET_CEILING_DB);
});

test("a week may not be built out of one composition", () => {
  const week = (templates) => templates.map((template, index) => ({ id: `w40-d0${index}`, template }));

  // The shape week 32 was accepted in: one composition, twenty-seven re-skins.
  const oneJoke = templateConcentrationErrors(week(Array(28).fill("DevJoke")));
  assert.equal(oneJoke.length, 1);
  assert.match(oneJoke[0], /28 of 28 items use the "DevJoke" template — at most 10 may/);

  // Retired templates are exempt, and have to be: week 32 holds four published
  // logo ladders for good, and a rule that fails on history is a rule that gets
  // switched off. Nothing new can reach them anyway — RETIRED_TEMPLATES does that.
  assert.deepEqual(templateConcentrationErrors(week(Array(28).fill("LogoLadder"))), []);

  // A third is allowed, so a strand may still dominate a week.
  const mixed = [
    ...Array(10).fill("DevJoke"),
    ...Array(9).fill("TechTip"),
    ...Array(9).fill("CaseStudy"),
  ];
  assert.deepEqual(templateConcentrationErrors(week(mixed)), []);

  // Short weeks get a floor of three rather than a third of eight, which would
  // make a partial week stricter than a full one for no reason.
  assert.deepEqual(templateConcentrationErrors(week(Array(3).fill("DevJoke"))), []);
  assert.equal(templateConcentrationErrors(week(Array(4).fill("DevJoke"))).length, 1);
});

test("the two hard-coded compositions are retired to their published items", () => {
  // Each names the ids already public on it. Anything else reaching them is the
  // same video with new words, which is what they were used for twenty-eight
  // times and what five of them actually posted as.
  assert.deepEqual(Object.keys(RETIRED_TEMPLATES).sort(), ["LogoLadder", "WorksOnMyMachine"]);
  for (const allowed of Object.values(RETIRED_TEMPLATES)) {
    assert.ok(Array.isArray(allowed) && allowed.length > 0, "a retirement must name its items");
  }

  const source = readSource("./validate-plan.mjs");
  assert.match(source, /RETIRED_TEMPLATES\[item\.template\]/, "the retirement is not enforced");
  assert.match(source, /templateConcentrationErrors\(plan\.items\)/, "concentration is not enforced");
});
