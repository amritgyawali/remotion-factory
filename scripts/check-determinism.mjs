import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Refuse to fan out a composition that cannot be split safely.
 *
 * Fan-out renders frame ranges on different machines and concatenates the
 * results. That is only sound if every pixel is a pure function of
 * useCurrentFrame(). If a component reads the wall clock, draws an unseeded
 * random number, or fetches anything, two runners produce different pictures
 * for the same frame index and the finished video seams at every boundary —
 * while every frame count still checks out, so nothing downstream notices.
 *
 * A static check, so it is honest about what it is: it reads the source rather
 * than the rendered frames. It catches the patterns that have actually caused
 * this, and it cannot catch a determinism bug hidden behind indirection. The
 * measured check is comparing two independent renders of the same frame — see
 * the QA still pass in the per-video loop.
 *
 *   node scripts/check-determinism.mjs [--id Day01A] [--dir src]
 */

/**
 * `pattern` must match only the hazard. Every rule here has fired on real code
 * at least once, and the `allow` note says what the safe alternative is.
 */
const RULES = [
  {
    name: "wall clock",
    pattern: /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/,
    why: "reads the wall clock, so two runners disagree",
    allow: "derive time from useCurrentFrame()",
  },
  {
    name: "unseeded randomness",
    // Remotion's own random(seed) is fine and is deliberately not matched.
    pattern: /\bMath\.random\s*\(/,
    why: "unseeded, so every render differs",
    allow: 'import { random } from "remotion" and pass a seed',
  },
  {
    name: "timers",
    pattern: /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/,
    why: "fires on real time, which a frame render does not have",
    allow: "drive the animation from useCurrentFrame()",
  },
  {
    name: "network access",
    pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b/,
    why: "the render must work with no network",
    allow: "put the asset in public/ and use staticFile()",
  },
  {
    name: "remote asset",
    pattern: /(?:src|href)\s*=\s*["'`]https?:\/\//,
    why: "a remote asset can 404 or change between chunks",
    allow: "put the asset in public/ and use staticFile()",
  },
];

/**
 * Interpolations must clamp at both ends.
 *
 * Unclamped, `interpolate` extrapolates past its input range — a value meant to
 * ease from 0 to 1 keeps going to 3 by the end of the composition. Inside an
 * SVG width or radius that becomes negative and the shape vanishes, which reads
 * as a missing element rather than a maths error.
 */
function interpolationProblems(source, file) {
  const problems = [];
  // Brace-matched rather than regexed to the closing paren: interpolate calls
  // routinely contain nested calls and array literals.
  let index = source.indexOf("interpolate(");
  while (index !== -1) {
    let depth = 0;
    let end = index;
    for (; end < source.length; end += 1) {
      if (source[end] === "(") depth += 1;
      else if (source[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const call = source.slice(index, end + 1);
    const line = source.slice(0, index).split("\n").length;

    if (!call.includes("extrapolateLeft") || !call.includes("extrapolateRight")) {
      problems.push({
        file,
        line,
        rule: "unclamped interpolate",
        why: "extrapolates past its range and can go negative",
        allow: 'add extrapolateLeft: "clamp", extrapolateRight: "clamp"',
      });
    }
    index = source.indexOf("interpolate(", end);
  }
  return problems;
}

/** Strip comments so a rule name in prose is not reported as a violation. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + " ".repeat(match.length - lead.length));
}

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) found.push(full);
  }
  return found;
}

export async function checkDeterminism({ dir = "src" } = {}) {
  const files = await sourceFiles(dir);
  const problems = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const source = stripComments(raw);

    for (const rule of RULES) {
      const lines = source.split("\n");
      lines.forEach((text, index) => {
        if (rule.pattern.test(text)) {
          problems.push({
            file,
            line: index + 1,
            rule: rule.name,
            why: rule.why,
            allow: rule.allow,
            code: text.trim().slice(0, 100),
          });
        }
      });
    }

    problems.push(...interpolationProblems(source, file));
  }

  return { files: files.length, problems };
}

async function main() {
  const dirIndex = process.argv.indexOf("--dir");
  const dir = dirIndex === -1 ? "src" : process.argv[dirIndex + 1];

  const { files, problems } = await checkDeterminism({ dir });

  if (problems.length === 0) {
    console.log(`determinism: ${files} file(s) checked, no hazards found`);
    return;
  }

  console.error(`determinism: ${problems.length} hazard(s) in ${files} file(s)\n`);
  for (const problem of problems) {
    console.error(`  ${problem.file}:${problem.line}  ${problem.rule}`);
    console.error(`    ${problem.why}`);
    console.error(`    fix: ${problem.allow}`);
    if (problem.code) console.error(`    ${problem.code}`);
    console.error("");
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
