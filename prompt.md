# Queue script prompt

Paste this into Claude or Gemini, fill the blanks, and append the returned objects
to the `items` array in `plan.json`. Keep `mode`, `postType`, `channels`, and
`channelSettings` unchanged.

You can do this entirely from your phone in the GitHub web editor. Append new
items; do not replace items whose ids already appear in `state.json`.

---

You are writing content for a vertical short-form video series.
The videos are motion graphics only — no voiceover, footage, or music cues.
All meaning has to survive on screen, silently, on a phone.

**Series topic:** `<TOPIC>`
**Audience:** `<WHO>`
**Unique id prefix:** `<SHORT_PREFIX>`
**How many videos:** `<N>` (4 per day × 30 days = 120 for a full run)

Return **only** a JSON array, with no prose or markdown fences. Do not include
`publishAt`. Array order is queue order, and every id must be unique across all
items already present in `plan.json` and `state.json`.

Ids are portable lowercase slugs: 1–80 letters, digits, `_`, or `-`; begin and
end with a letter or digit. Do not use Windows reserved names such as `con`,
`prn`, `aux`, `nul`, `com1`–`com9`, or `lpt1`–`lpt9`.

```json
[
  {
    "id": "eye-d01-a",
    "template": "StatCard",
    "caption": "string, ends with 3 hashtags, under 280 characters",
    "props": {}
  }
]
```

For a 30-day run, ids advance through four slots per day:
`<prefix>-d01-a`, `-d01-b`, `-d01-c`, `-d01-d`, then day 2. The `props.day`
value stays between 1 and 30 because it drives the shared ledger rule.

Two templates are available. Alternate them so each four-video day contains two
of each template, ideally `StatCard`, `ListReveal`, `StatCard`, `ListReveal`.

**StatCard** — one number that stops the scroll. Props:

- `eyebrow`: the series name, identical on every video, under 26 characters
- `day`: 1–30
- `durationInSeconds`: 7–9
- `value`: the number as it should read, under 12 characters, for example `"43%"`, `"1 in 6"`, `"20-20-20"`
- `label`: what the number is, under 46 characters, no full stop
- `context`: exactly two lines, each under 48 characters, that pay the number off
- `kicker`: 2–3 words in caps, for example `"SAVE THIS"`

**ListReveal** — a short list that earns a rewatch. Props:

- `eyebrow`, `day` as above
- `durationInSeconds`: 9–12
- `headline`: under 60 characters
- `items`: exactly 4 strings, each under 52 characters, with parallel grammar
- `kicker`: 2–3 words in caps

Rules:

- **These may publish automatically with no human review.** Every claim must be
  one a careful professional would defend in front of a colleague. If you are
  not confident in a statistic, choose a different angle rather than inventing
  or softening a number.
- No diagnosis, dosing, or "you have". Describe patterns, name the threshold at
  which someone should see a professional, and stop there.
- No hedging language on screen. Put necessary nuance in the caption.
- Each video stands alone. Someone landing on day 19 should get full value.
- The four videos in one day must use four distinct angles.
- Vary the opening word across the run. If eight start with "Why", redo them.
- Captions carry the nuance the on-screen text cannot: one or two sentences,
  followed by exactly three hashtags. Keep each caption under 280 characters.
