# Uniqueness ledger

One row per finished video. Read this before designing the next one.

A new video may not repeat any previous entry on **any** of the five axes. If
the brief pushes toward a repeat — two days arguing the same point, say — the
video is differentiated on the remaining axes and the report says so explicitly.

The axes, and what counts as a repeat:

| Axis | A repeat means |
| --- | --- |
| **Metaphor system** | The same visual argument. A ladder and a staircase are one metaphor. |
| **Typeface pair** | The same display + mono pairing, in either role. |
| **Palette** | The same named ground. Retinting one accent is not a new palette. |
| **Motion vocabulary** | The same entrance/exit grammar — what moves, from where, on what curve. |
| **Audio signature** | The same root, tempo and cue family. |

The five are checked by hand at design time and, for palette/typeface/motion,
mechanically by the campaign walk in `src/variation.ts`. Post-render, the
finished files are compared as perceptual fingerprints by
`scripts/uniqueness.mjs` — that is the check that catches two videos that
differ on paper and look identical on a phone.

## Videos

_Nothing rendered against this ledger yet. The first row lands when video 1
passes verification._

| ID | Metaphor system | Typeface pair | Palette | Motion vocabulary | Audio signature |
| --- | --- | --- | --- | --- | --- |

## Retired

Two compositions are closed to new work. They were used 28 times for what
should have been 28 different videos, and five of those posted.

| Template | Why | Locked to |
| --- | --- | --- |
| `LogoLadder` | One escalation joke, re-skinned per client | `w32-d01-b`, `w32-d01-c`, `w32-d01-d`, `w32-d02-b` |
| `WorksOnMyMachine` | Same, and it is its own stage | `w32-d01-a` |

Enforced in `scripts/validate-plan.mjs` via `RETIRED_TEMPLATES`, so nothing new
can reach them by accident.
