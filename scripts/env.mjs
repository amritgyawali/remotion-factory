/**
 * Loads a local .env into process.env so the same scripts the workflow runs
 * can be run by hand without exporting six variables first.
 *
 * Anything already set in the environment always wins, so this can never
 * shadow a GitHub secret: CI has no .env file, and if one ever appeared the
 * real secrets would still take precedence. .env is gitignored.
 */
import { readFileSync } from "node:fs";

export function loadEnvFile(file = ".env") {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const loaded = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();

    // Strip one layer of matching quotes. Values are not comment-stripped:
    // a "#" is legal inside an API key and guessing would corrupt it.
    const quoted =
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);

    if (key in process.env) continue;
    process.env[key] = value;
    loaded.push(key);
  }

  return loaded;
}
