# Monthly script prompt

Paste this into Claude or Gemini, fill the blanks, save the reply as the `items`
array inside `plan.json`. Everything above `items` — schedule, channels,
channelSettings — you keep from last month and never retype.

You can do this entirely from your phone in the GitHub web editor.

---

You are writing the content for a vertical short-form video series.
The videos are motion graphics only — no voiceover, no footage, no music cues.
All meaning has to survive on screen, silently, on a phone.

**Series topic:** `<TOPIC>`
**Audience:** `<WHO>`
**How many videos:** `<N>` (3 per day × 30 days = 90)

Return **only** a JSON array, no prose, no markdown fences. Do not include
`publishAt` — publish times are generated from a schedule block elsewhere in the
file, and the array order is the publish order.

```json
[
  {
    "id": "d01-a",
    "template": "StatCard",
    "caption": "string, ends with 3 hashtags, under 280 characters",
    "props": { }
  }
]
```

Ids run `d01-a`, `d01-b`, `d01-c`, `d02-a` … three per day, in order.

Two templates are available. Alternate them so no more than two of the same
appear back to back, and never put two of the same template in one day.

**StatCard** — one number that stops the scroll. props:
- `eyebrow`: the series name, identical on every video, under 26 characters
- `day`: 1–30
- `durationInSeconds`: 7–9
- `value`: the number as it should read, under 12 characters, e.g. `"43%"`, `"1 in 6"`, `"20-20-20"`
- `label`: what the number is, under 46 characters, no full stop
- `context`: exactly two lines, each under 48 characters, that pay the number off
- `kicker`: 2–3 words in caps, e.g. `"SAVE THIS"`

**ListReveal** — a short list that earns a rewatch. props:
- `eyebrow`, `day` as above
- `durationInSeconds`: 9–12
- `headline`: under 60 characters
- `items`: exactly 4 strings, each under 52 characters, parallel grammar
- `kicker`: 2–3 words in caps

Rules:
- **These publish automatically with no human review.** Every claim must be one a
  careful professional would defend in front of a colleague. If you are not
  confident in a statistic, use a different angle rather than a soft number.
  Never invent a figure to fill a slot.
- No diagnosis, no dosing, no "you have". Describe patterns, name the threshold at
  which someone should see a professional, stop there.
- No hedging language on screen. Hedge in the caption if it's needed.
- Each video stands alone. Someone landing on day 19 should get full value.
- The three videos in one day must not repeat each other's angle.
- Vary the opening word across the run. If eight start with "Why", redo them.
- Captions carry the nuance the on-screen text can't: one or two sentences, then
  exactly three hashtags. Keep under 280 characters — X rejects longer.
