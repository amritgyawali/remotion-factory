import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Guards the font-weight contract.
 *
 * Asking a family for a weight it does not ship does not fail — the browser
 * synthesises it by smearing each glyph sideways, and on a condensed face the
 * letters collide. That shipped: Anton loads only weight 400, the templates
 * hardcoded 800, and roughly one video in seven went out with a mangled
 * headline. Nothing in the type system catches it, so it is caught here.
 */

const themeSource = readFileSync("src/theme.ts", "utf8");

/** The block of source belonging to one typeface entry. */
function entryFor(name) {
  const start = themeSource.indexOf(`name: "${name}"`);
  assert.notEqual(start, -1, `no typeface named "${name}"`);
  const end = themeSource.indexOf('name: "', start + 10);
  return themeSource.slice(start, end === -1 ? themeSource.length : end);
}

/** Every weight the entry's loadFont call actually requests. */
function loadedWeights(name) {
  const match = /weights: \[([^\]]+)\]/.exec(entryFor(name));
  assert.ok(match, `${name} has no loadFont weights array`);
  return match[1].split(",").map((w) => Number(w.trim().replace(/"/g, "")));
}

/** The role-to-weight scale the entry points at, resolved to numbers. */
function scaleFor(name) {
  const ref = /weights: (SCALE_\w+),/.exec(entryFor(name));
  assert.ok(ref, `${name} declares no weight scale`);

  const definition = new RegExp(`const ${ref[1]}: WeightScale = \\{([^}]+)\\}`).exec(themeSource);
  assert.ok(definition, `${ref[1]} is not defined`);

  return definition[1]
    .split(",")
    .map((pair) => Number(pair.split(":")[1]))
    .filter((value) => Number.isFinite(value));
}

const typefaceNames = () =>
  [...themeSource.matchAll(/name: "(\w+)",\s*\n\s*display: load/g)].map((match) => match[1]);

test("every typeface only asks for weights it actually loads", () => {
  const names = typefaceNames();
  assert.ok(names.length >= 7, `parsed ${names.length} typefaces, expected at least 7`);

  for (const name of names) {
    const loaded = loadedWeights(name);
    for (const weight of scaleFor(name)) {
      assert.ok(
        loaded.includes(weight),
        `${name} maps a role to weight ${weight} but only loads ${loaded.join(", ")} — ` +
          "the browser would synthesise it and smear the glyphs",
      );
    }
  }
});

test("Anton resolves every role to its single weight", () => {
  // The specific regression: one shipped weight, three roles needing it.
  assert.deepEqual(loadedWeights("anton"), [400]);
  assert.deepEqual(scaleFor("anton"), [400, 400, 400]);
});

test("no component hardcodes a numeric font weight", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) files.push(full);
    }
  };
  walk("src");

  for (const file of files) {
    const offenders = readFileSync(file, "utf8").match(/fontWeight: \d+/g);
    assert.equal(
      offenders,
      null,
      `${file} hardcodes ${offenders?.join(", ")} — use theme.weightHeavy/Mid/Body so a ` +
        "single-weight family cannot be asked for a weight it lacks",
    );
  }
});
