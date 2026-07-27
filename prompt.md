# Weekly plan prompt

Use this prompt to replace the `week` and `items` values in `plan.json` once a
week. Keep `mode`, `postType`, `channels`, and `channelSettings` exactly as they
are. The **Accept weekly plan** workflow validates and archives the new week;
never edit files under `plans/` yourself.

---

You are writing one unattended week of vertical, silent motion-graphics videos
for MeritByte. Return only a JSON object with `week` and `items`; no prose and no
Markdown fence.

**Topic:** `<TOPIC>`
**Audience:** `<AUDIENCE>`
**ISO week:** `<YYYY-wNN>`
**Week order:** `<YYYYNN>`
**Unique id prefix:** `<PREFIX-YYYYwNN>`
**Already-used source ids:** `<PASTE FROM plans/>`

Required shape:

```json
{
  "week": { "id": "2026-w32", "order": 202632 },
  "items": [
    {
      "id": "mb-2026w32-d01-a",
      "sourceId": "topic-2026w32-01",
      "template": "DevJoke",
      "caption": "One or two useful sentences.\n\n#TagOne #TagTwo #TagThree",
      "props": {}
    }
  ]
}
```

Generate exactly 28 items in this order: Day 1 slots `a`, `b`, `c`, `d`, then
Day 2, through Day 7. `props.day` must match the id. Every id and `sourceId` must
be a new portable lowercase slug containing only letters, digits, `_`, and `-`.

The validator compares the new week with every accepted archive. Do not repeat
an id, source, normalized caption, hook, or full visible-copy idea. Changing
punctuation, case, or hashtags does not make a duplicate new.

All templates share:

- `eyebrow`: `"MeritByte — Build Better"` (under 26 characters)
- `day`: integer 1–7
- `durationInSeconds`: total duration including the final two-second end card
- `kicker`: concise uppercase label, under 20 characters

Available templates:

**DevJoke**

- `hook`: at most 7 words and 52 characters
- `beats`: 3–5 short strings, each under 46 characters
- `punchline`: under 58 characters
- `variant`: one of `logo`, `terminal`, `qa`, `timer`, `scope`, `deploy`,
  `comments`, `cache`
- recommended duration: 15–18 seconds

**TechTip**

- `hook`: at most 7 words and 52 characters
- `steps`: exactly 3 strings, each under 52 characters
- `result`: under 62 characters
- `variant`: one of `security`, `devtools`, `tool-audit`, `vitals`,
  `index-check`, `design-code`
- recommended duration: 18–22 seconds

**SiteRoast**

- `hook`: at most 7 words and 52 characters
- `episode`: short label such as `"EP 04"`
- `problems`: exactly 3 strings, each under 52 characters
- `fix`: under 62 characters
- `verdict`: under 44 characters
- recommended duration: 20–24 seconds

**CaseStudy**

- `hook`: at most 7 words and 52 characters
- `before` and `after`: each under 54 characters
- `actions`: exactly 3 strings, each under 50 characters
- `lesson`: under 62 characters
- recommended duration: 20–24 seconds

**FounderStory**

- `hook`: at most 7 words and 52 characters
- `moments`: exactly 3 strings, each under 50 characters
- `turn`: under 58 characters
- `lesson`: under 62 characters
- recommended duration: 18–22 seconds

Content rules:

- These videos may run for a week without human content review. Never invent a
  client result, testimonial, revenue number, security incident, or founder
  anecdote. If evidence is missing, teach a defensible principle instead.
- Security clues are not proof of compromise. Tell viewers to confirm with the
  relevant logs, tools, or professional review.
- Do not present Core Web Vitals as the entire ranking system.
- Every video must stand alone and deliver a different useful idea.
- Within each day, use at least three template families and four distinct angles.
- Do not place the same template in adjacent queue positions when another
  suitable family exists.
- Hooks are readable immediately, use active language, and contain no more than
  seven words.
- Captions contain one or two plain-language sentences, exactly three hashtags,
  no URL, and stay under 280 characters.
- No voiceover, footage, screen recording, photographs, music instructions, or
  sound-effect instructions. The templates carry the story visually.
