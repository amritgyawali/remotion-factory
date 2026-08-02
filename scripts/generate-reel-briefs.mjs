#!/usr/bin/env node
/**
 * Generate reel briefs for all 30 days × 4 videos = 120 videos.
 *
 * Reads pdf-days.json and produces brief JSON files in briefs/ directory.
 * Each PDF day's content is expanded into 4 videos (slots A, B, C, D),
 * each with a unique concept derived from the day's theme.
 *
 *   node scripts/generate-reel-briefs.mjs [--check]
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PDF_PATH = "plan-source/pdf-days.json";
const BRIEFS_DIR = "briefs";
const AUDIO_DIR = "audio";

/** The five beat windows the Reel engine uses (from src/reel/brief.ts). */
const BEAT_CUE_FRAMES = [0, 90, 240, 450, 720];

// ── Mechanisms and visual systems ──────────────────────────────────
const MECHANISMS = [
  "containment", "optics", "utility-chain", "forensics",
  "folded-claim", "assembly-line", "vault-vs-field", "feeding-web",
  "orbital-ledger", "shared-sky", "signal-rights", "training-loop",
];
const VISUAL_SYSTEMS = ["sandbox", "museum-optics", "utility-room", "paper-lab"];

function conceptForDay(dayIndex, slot) {
  const mechIdx = (dayIndex * 4 + slot) % MECHANISMS.length;
  const vsIdx = (dayIndex + slot) % VISUAL_SYSTEMS.length;
  return { mechanism: MECHANISMS[mechIdx], visualSystem: VISUAL_SYSTEMS[vsIdx] };
}

// ── Beat extraction from PDF rows ──────────────────────────────────

/** Clean on-screen text into a short copy line (≤7 words per reading rules). */
function cleanCopy(text) {
  return text
    .replace(/no text on screen/gi, "")
    .replace(/\n+/g, " ")
    .trim();
}

/**
 * A short row (a bare timestamp like "15:00" or "+47:55") gets paired with a
 * meaningful fragment from its motion column, so the beat is self-contained for
 * a viewer watching with the sound off. Pure timestamps were the script's own
 * choice for timer jokes (the climbing number IS the story), but a bare number
 * on a 1.2-second card does no work on its own.
 */
function enrichShortRow(row) {
  const text = cleanCopy(row.onScreen || "");
  if (text.length > 14) return text;

  const motion = (row.motion || "").toLowerCase();
  const context = [
    "timer hits",
    "flips to a count-up",
    "counts down",
    "digits blur",
    "stops hard",
    "freezes on the spike",
    "error count",
    "deploys",
    "tiles dim",
    "camera-off state",
    "remaining active",
    "clock graphic",
    "clock flips",
  ];
  const found = context.find((c) => motion.includes(c));
  if (found) {
    // e.g. "+02:14 — the count-up begins"
    const tail = found
      .replace("timer hits", "hits zero")
      .replace("stops hard", "and stops")
      .replace("clock flips", "the clock flips")
      .replace("tiles dim", "the tiles dim");
    return `${text} — ${tail}`;
  }
  return text;
}

/** Split a long onScreen line into multiple short copy lines, max 7 words each. */
function splitCopy(text) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    if (current.length >= 6) {
      lines.push(current.join(" "));
      current = [];
    }
  }
  if (current.length > 0) lines.push(current.join(" "));
  return lines;
}

/**
 * Extract 5 beats from a day's rows, picking the most impactful onScreen lines.
 *
 * Strategy: find the rows with the most distinctive onScreen text (not generic
 * labels, not "no text"), then select 5 at roughly even intervals.
 */
function extractBeats(rows) {
  if (!rows || rows.length === 0) return null;

  // Score each row by distinctiveness
  const scored = rows.map((row, i) => {
    const text = enrichShortRow(row);
    let score = 0;
    // Longer text is usually more meaningful
    score += Math.min(text.length, 40);
    // Penalise empty or noise
    if (!text || text === "no text on screen") score = -1;
    // Penalise pure punctuation/labels
    if (/^[A-Z ]+$/.test(text) && text.length < 15) score -= 5;
    // Bonus for concrete statements
    if (text.includes(".")) score += 5;
    if (/\d/.test(text)) score += 3;
    if (text.includes("→") || text.includes("->")) score += 3;
    return { text, score, index: i };
  });

  // Filter out noise, sort by score, take top candidates
  const valid = scored
    .filter((s) => s.score > 0 && s.text.length > 0)
    .sort((a, b) => b.score - a.score);

  if (valid.length < 5) {
    // Fall back to first N non-empty rows
    const fallback = rows
      .map((r) => cleanCopy(r.onScreen || ""))
      .filter((t) => t && t !== "no text on screen")
      .slice(0, 5);
    return fallback.map((text) => ({ copy: text }));
  }

  // Select 5 evenly from top candidates, preserving original order
  const top5 = valid.slice(0, 12).sort((a, b) => a.index - b.index);

  // Pick 5: first, last, and 3 evenly spaced in between
  const indices = [0];
  if (top5.length > 2) {
    const step = (top5.length - 1) / 4;
    for (let i = 1; i <= 4; i++) {
      indices.push(Math.round(i * step));
    }
  }
  const selected = [...new Set(indices)].map((i) => top5[Math.min(i, top5.length - 1)]);
  // Ensure exactly 5
  while (selected.length < 5 && top5.length > selected.length) {
    const next = top5.find((t) => !selected.includes(t));
    if (next) selected.push(next);
    else break;
  }

  return selected.map((s) => ({ copy: s.text }));
}

// ── Slot-specific beat generation ──────────────────────────────────

/**
 * Slot A: The main hook — the most attention-grabbing angle.
 * Uses the PDF's primary rows (the setup and escalation).
 */
function slotABeats(day) {
  const beats = extractBeats(day.rows);
  if (beats) return beats;

  // Fallback for days without rows (day 1, 5) — derive beats from hooks and title
  const hooks = day.hooks;
  if (hooks) {
    return [
      { copy: hooks.a },
      { copy: hooks.b },
      { copy: hooks.c },
      { copy: day.title },
      { copy: day.cta || day.caption?.split("\n")[0] || day.title },
    ];
  }

  // Days with no rows AND no hooks (retired pages): synthesise beats from
  // title and emotion. The title alone is one beat; the remaining four
  // come from the emotion template's typical arc.
  const title = day.title;
  const emotion = day.emotion;
  switch (emotion) {
    case "COMEDY":
      return [
        { copy: title },
        { copy: "Round one" },
        { copy: "Round two" },
        { copy: "Round three" },
        { copy: "The punchline" },
      ];
    case "INTERESTING":
      return [
        { copy: title },
        { copy: "The problem" },
        { copy: "The evidence" },
        { copy: "The fix" },
        { copy: "Test it yourself" },
      ];
    case "MOTIVATION":
      return [
        { copy: title },
        { copy: "The early days" },
        { copy: "The turning point" },
        { copy: "The lesson" },
        { copy: "Day one repeats" },
      ];
    default:
      return [
        { copy: title },
        { copy: "The context" },
        { copy: "The detail" },
        { copy: "The result" },
        { copy: title },
      ];
  }
}

/**
 * Slot B: The technical angle — focus on the "how" and the mechanism.
 * Shifts emphasis toward the middle rows (the demonstration).
 */
function slotBBeats(day) {
  const rows = day.rows || [];
  if (rows.length === 0) return slotABeats(day);

  // Take the second half of rows (the demonstration/technical part)
  const secondHalf = rows.slice(Math.floor(rows.length / 3));
  const beats = extractBeats(secondHalf);
  if (beats && beats.length >= 3) {
    // Prepend a hook from the original
    return [{ copy: day.hooks?.b || day.title }, ...beats].slice(0, 5);
  }
  return slotABeats(day);
}

/**
 * Slot C: The impact angle — focus on results, data, consequences.
 * Emphasises rows with numbers, percentages, or outcome statements.
 */
function slotCBeats(day) {
  const rows = day.rows || [];
  if (rows.length === 0) return slotABeats(day);

  // Filter for rows with data/impact
  const impactRows = rows.filter((r) => {
    const text = (r.onScreen || "").toLowerCase();
    return /\d|%|\$|→|->|fix|result|score|drop|rise|cut|save|lost|won/.test(text);
  });

  if (impactRows.length >= 3) {
    const beats = extractBeats(impactRows);
    if (beats) return beats;
  }

  // Fallback: use the third quarter of rows
  const thirdQ = rows.slice(Math.floor(rows.length * 0.4), Math.floor(rows.length * 0.8));
  const beats = extractBeats(thirdQ);
  if (beats && beats.length >= 3) {
    return [{ copy: day.hooks?.c || day.title }, ...beats].slice(0, 5);
  }
  return slotABeats(day);
}

/**
 * Slot D: The action angle — focus on what to do, the CTA.
 * Emphasises the final rows (the fix, the takeaway).
 */
function slotDBeats(day) {
  const rows = day.rows || [];
  if (rows.length === 0) return slotABeats(day);

  // Take the last third (the fix/CTA)
  const lastThird = rows.slice(Math.floor(rows.length * 0.6));
  const beats = extractBeats(lastThird);
  if (beats && beats.length >= 3) {
    return [...beats, { copy: day.cta || "Follow for more." }].slice(0, 5);
  }
  return slotABeats(day);
}

// ── Caption and hashtags ───────────────────────────────────────────

function captionForSlot(day, slot) {
  const baseCaption = day.caption || day.title;
  const slotCaptions = {
    0: baseCaption,
    1: `${baseCaption.split("\n")[0]}\n\n#MeritByte #TechInsight #WebDev`,
    2: `${baseCaption.split("\n")[0]}\n\n#MeritByte #CaseStudy #Results`,
    3: `${day.cta || baseCaption.split("\n")[0]}\n\n#MeritByte #BuildBetter #Actionable`,
  };
  return slotCaptions[slot] || baseCaption;
}

function hashtagsForDay(day, slot) {
  const base = ["#MeritByte", "#BuildBetter"];
  switch (day.emotion) {
    case "COMEDY": base.push("#DevHumor", "#TechComedy", "#DevLife"); break;
    case "INTERESTING": base.push("#TechInsight", "#WebDev", "#SoftwareEngineering"); break;
    case "MOTIVATION": base.push("#FounderStory", "#StartupLife", "#Motivation"); break;
    default: base.push("#Tech", "#Innovation");
  }
  return base.slice(0, 5);
}

// ── Title generation ───────────────────────────────────────────────

function titleForSlot(day, slot) {
  const hooks = day.hooks || {};
  switch (slot) {
    case 0: return hooks.a || day.title;
    case 1: return hooks.b || `${day.title}: How`;
    case 2: return hooks.c || `${day.title}: Why`;
    case 3: return `${day.title}: What To Do`;
    default: return day.title;
  }
}

// ── Brief generation ───────────────────────────────────────────────

function generateBrief(day, slot, slotIndex) {
  const concept = conceptForDay(day.day - 1, slot);
  const slotLetter = String.fromCharCode(65 + slot);
  const beatFns = [slotABeats, slotBBeats, slotCBeats, slotDBeats];
  const beats = beatFns[slot](day);

  // Pad to exactly 5 beats if needed
  while (beats.length < 5) {
    beats.push({ copy: beats[beats.length - 1]?.copy || day.title });
  }

  return {
    id: `Day${String(day.day).padStart(2, "0")}${slotLetter}`,
    visualSystem: concept.visualSystem,
    title: titleForSlot(day, slot),
    mechanism: concept.mechanism,
    day: day.day,
    slot: slotLetter,
    caption: captionForSlot(day, slot),
    beats: beats.slice(0, 5),
    hashtags: hashtagsForDay(day, slot),
    slotIndex,
  };
}

// ── Audio spec generation ──────────────────────────────────────────

/** Deterministic seed from a string id (mirrors scripts/render-audio.mjs). */
export function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random in [0,1) from a seed. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive rootHz and bpm from the id so each video's bed is distinct. */
function audioBed(id) {
  const random = seeded(hashSeed(id));
  const rootHz = 96 + Math.round(random() * 40); // 96-136 Hz
  const bpm = 74 + Math.round(random() * 46); // 74-120 BPM
  return { rootHz, bpm };
}

/**
 * One cue per beat window. The kind and pitch vary by beat so the bed
 * marks the retention arc: promise, curiosity, progress, payoff, re-hook.
 */
function cuesFor(id) {
  const random = seeded(hashSeed(id) ^ 0x9e3779b9);
  const kinds = ["tone", "tone", "sweep", "tone", "noise"];
  return BEAT_CUE_FRAMES.map((frame, index) => {
    const base = 220 + random() * 220;
    const cue = {
      frame,
      kind: kinds[index],
      seconds: Number((0.08 + random() * 0.1).toFixed(2)),
      gain: Number((0.3 + random() * 0.2).toFixed(2)),
      hz: Math.round(base),
    };
    if (cue.kind === "sweep") cue.sweep = Number((1.5 + random() * 1.5).toFixed(2));
    return cue;
  });
}

function generateAudioSpec(brief) {
  const { rootHz, bpm } = audioBed(brief.id);
  return {
    id: brief.id,
    durationInFrames: 900,
    fps: 30,
    rootHz,
    bpm,
    peak: 0.09,
    cues: cuesFor(brief.id),
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const check = process.argv.includes("--check");
  const pdfData = JSON.parse(await readFile(PDF_PATH, "utf8"));
  const days = pdfData.days;

  console.log(`Processing ${days.length} days × 4 slots = ${days.length * 4} briefs\n`);

  const generated = [];
  let slotIndex = 0;

  for (const day of days) {
    for (let slot = 0; slot < 4; slot++) {
      const brief = generateBrief(day, slot, slotIndex);
      const filename = `${brief.id}.json`;
      const filepath = path.join(BRIEFS_DIR, filename);

      generated.push({
        filename,
        filepath,
        json: JSON.stringify(brief, null, 2) + "\n",
        brief,
      });
      slotIndex++;
    }
  }

  let written = 0;
  let errors = 0;

  for (const file of generated) {
    try {
      if (check) {
        JSON.parse(file.json);
        const beats = file.brief.beats.length;
        const copyLen = file.brief.beats.reduce((n, b) => n + b.copy.split(/\s+/).length, 0);
        const ok = beats === 5 && copyLen >= 10 ? "ok" : `warn (${beats} beats, ${copyLen} words)`;
        console.log(`  ${file.filename}  ${ok}`);
      } else {
        await writeFile(file.filepath, file.json);
        // Audio spec, one per video, consumed by render-batch.yml's
        // render-audio step. Root and tempo are seeded from the id so a
        // re-render is byte-identical (the determinism contract).
        const audio = generateAudioSpec(file.brief);
        await writeFile(path.join(AUDIO_DIR, file.filename), JSON.stringify(audio, null, 2) + "\n");
        written++;
      }
    } catch (error) {
      console.error(`  ${file.filename}: ${error.message}`);
      errors++;
    }
  }

  if (!check) console.log(`Generated ${written} briefs + audio specs in ${BRIEFS_DIR}/ and ${AUDIO_DIR}/`);
  if (errors > 0) { console.error(`\n${errors} errors`); process.exit(1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
