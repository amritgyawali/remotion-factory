/**
 * Deterministic per-video variation.
 *
 * "Every video must be unique" is not something a template can promise on its
 * own: the same component fed different strings still paints the same picture
 * and plays the same music. So each video derives a seed from its plan id and
 * uses it to pick a palette, a typeface pairing and a musical key.
 *
 * Deriving from the id rather than randomising matters. Renders happen
 * unattended and are sometimes retried, so the same video must look and sound
 * identical every time it is built — a retry that produced different music
 * would defeat the duplicate detection that compares fingerprints.
 */

/** FNV-1a. Small, well-distributed, and identical in Node and the browser. */
export function seedFrom(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a compact PRNG with good distribution for picking variants. */
export function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one entry, spreading choices evenly across the list. */
export function pick<T>(list: readonly T[], seed: number, salt = 0): T {
  return list[(seed + salt * 2654435761) % list.length];
}

/**
 * A set of independent choices from one id, so two videos differing only in
 * id still differ in palette, type and key rather than varying together.
 */
export type Variation = {
  seed: number;
  paletteIndex: number;
  typeIndex: number;
  musicIndex: number;
};

export function variationFor(id: string, counts: {
  palettes: number;
  typefaces: number;
  keys: number;
}): Variation {
  const seed = seedFrom(id);
  const random = randomFrom(seed);

  return {
    seed,
    paletteIndex: Math.floor(random() * counts.palettes),
    typeIndex: Math.floor(random() * counts.typefaces),
    musicIndex: Math.floor(random() * counts.keys),
  };
}
