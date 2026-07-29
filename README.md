# remotion-factory

Prepare one seven-day JSON plan. GitHub accepts it into an immutable queue,
renders one video every six hours, and hands four videos a day to Postiz. The
laptop and local Studio can stay off for the rest of the week.

```text
plan.json weekly inbox → plans/<week>.json → Remotion → Postiz
                                  ↑              ↓
                         four posts a day      state.json
```

Videos are handed to Postiz with a scheduled date, not published on handover.
The grid starts at an embargo date and steps every six hours, so nothing appears
before it however early it was rendered — see
[When each video goes live](#when-each-video-goes-live).

The Oracle box only runs Postiz and its database. It never renders video, so the
GitHub-hosted runner does the expensive work and then disappears.

> **This is its own repository.** Do not put it inside the `postiz-app` clone.
> That clone is upstream source and read-only. The deployment clone should hold
> only its `docker-compose.yaml`, `Caddyfile`, and `.env`.

## Queue behavior

`plan.json` is a replaceable weekly inbox:

```json
{
  "mode": "queue",
  "week": { "id": "2026-w31", "order": 202631 },
  "postType": "schedule",
  "items": [
    {
      "id": "d01-a",
      "sourceId": "meritbyte-pdf-01",
      "template": "DevJoke",
      "caption": "...",
      "props": { "day": 1 }
    }
  ]
}
```

Pushing a changed `plan.json` runs **Accept weekly plan**. It validates exactly
seven days × four ordered slots, checks all accepted weeks for duplicate ids,
sources, captions, and visible copy, then writes `plans/<week-id>.json`.
Accepted weeks are the real queue; do not edit or delete them. A newer week waits
behind any unfinished older week, so an early weekly edit cannot lose a delayed
video. An accepted week's **content** becomes immutable as soon as its first item
posts.

`postType` is the one field exempt from that freeze. It is not content — it is
the owner's standing decision about how anything is delivered, and freezing it to
whatever happened to be set when the first item posted would mean a running week
could never be paused to drafts or released live. Content and `postType` are
compared separately, so a `postType` edit cannot smuggle a caption change past
the freeze.

The `Publish next video` workflow is attempted every two hours and publishes four
times a day, landing near 00:17, 06:17, 12:17, and 18:17 in `Asia/Kathmandu`.
Each run:

1. Asks `scripts/due.mjs` whether the minimum gap since the last post has passed.
   If not, the run stops here, having installed nothing.
2. Validates every accepted week and `state.json`.
3. Checks Postiz credentials and channel wiring before apt, npm and the browser
   download, so a misconfiguration costs seconds rather than a whole runner.
4. Selects the first item whose id is not in `state.json.posted`.
5. Rebuilds the audio pack for the template in play, then renders exactly that
   one item with Remotion, using every core on the runner.
6. Masters the audio to −23 LUFS, delivering ≈ −0.85 dBTP (see *Mastering*).
7. Verifies the MP4 before anything else may touch it (see *Render verification*).
8. Uploads the MP4 to the week's GitHub Release (see *Where the videos are kept*).
9. Sends it to every configured Postiz integration.
10. Adds the id to `state.json`, with a `lastPostedAt` stamp, only after Postiz
    accepts the request.
11. Commits `state.json` and `archive/manifest.json` back to `main`.

A dry run renders the same next item but never contacts Postiz and never advances
the queue. An exhausted queue—where every accepted id is in `state.json`—exits
without installing Chrome or rendering.

### Why every two hours, for four posts

GitHub's scheduled runs are best effort. On this repo one fired 90 minutes late
and the next was dropped outright, which is ordinary for a free public repo and
not something a cron expression can correct. Asking for exactly four runs a day
therefore yields fewer than four.

The workflow instead attempts twelve times a day and lets `MIN_GAP_HOURS`
(default 5) decide. A post at 00:00 permits the next at 05:00, which the 06:00
attempt takes; if GitHub drops that one, 08:00 catches it. The rate stays at four
a day and the cadence self-corrects back onto the grid rather than drifting.

One run still processes at most one queue item, so a delayed run never becomes a
catch-up burst. A manual run can tick `force` to ignore the gap.

## One video per run, at full power

Each run renders exactly one video, so that video gets the whole machine.
`remotion.config.ts` sets concurrency to the runner's full core count, JPEG
frames at quality 100, CRF 18, and the `slow` x264 preset. Social platforms
re-encode whatever they receive, so the master handed to them is what survives
that second pass.

Override the core count only to debug: `REMOTION_CONCURRENCY=1 npm run render`.
The publish workflow deliberately leaves it unset.

Rendering four videos in one job would be cheaper in setup time but would give
each of them a quarter of the machine and put all four behind a single point of
failure. Four separate runs is the trade this repository makes.

## Rendering happens on GitHub, never locally

`scripts/render-guard.mjs` refuses to render outside CI, and both renderers call
it before doing anything. This is enforced rather than documented because the
reasons are not stylistic:

- **A local master is a different file.** `remotion.config.ts` pins the software
  GL path and takes concurrency from the core count so every render is
  reproducible. A laptop has a different core count, GPU, font stack and ffmpeg.
- **Rendering writes the archive.** A non-dry run uploads to a Release, writes
  `state.json` and appends to `archive/manifest.json`. Doing that locally races
  the scheduled workflow, and the loser's work is discarded on the next rebase.
- **The duplicate detector compares fingerprints.** A file built somewhere else
  is a fingerprint nothing in the archive can be meaningfully compared against.

To preview, use `npm run studio`. To render, dispatch a workflow. The escape
hatch for debugging one composition is `ALLOW_LOCAL_RENDER=1` together with
`--dry-run`, and it prints a warning so its output is never mistaken for a
master.

## Rendering a 30-day campaign in parallel

The scheduled workflow renders one video per run, four times a day. That is the
right shape for a steady drip and the wrong shape for filling an empty buffer: a
30-day campaign is 120 videos, and at four a day the last one lands a month
after the first.

`.github/workflows/render-campaign.yml` is the other shape. It splits the
pending queue into shards and runs them as a parallel matrix:

```bash
gh workflow run render-campaign.yml -f shards=20
npm run shards          # preview the split first, locally
```

The same Actions minutes are spent either way — the work is identical. What
changes is that they are spent concurrently, so wall clock becomes roughly the
slowest shard rather than the sum of all 120 renders. Twenty concurrent standard
runners is the free-plan ceiling; asking for more just queues the extra shards.

Three things make a shard faster than N separate `npx remotion render` calls,
all of them work the CLI repeats on every invocation:

| | `npx remotion render` | `scripts/render-shard.mjs` |
|---|---|---|
| webpack bundle | once per video | once per shard |
| Chrome launch | once per video | once per shard |
| audio synthesis | one child process per video | one pass per shard |

Bundling once is what per-video bed paths bought. Every video's bed is a
different piece of music, so while beds shared the name
`bed-<template>-<layer>.wav` the public folder had to be rewritten — and the
project re-bundled — between every render. Beds now live at
`audio/beds/<video-id>/<layer>.wav`, so a shard writes all of its audio once and
renders every video against one serve URL.

Frames still render at full concurrency and videos still run one at a time
inside a shard: two at once would halve each other's cores and double peak
memory for no gain.

Shards do **not** commit `state.json`. Twenty jobs racing to push the same file
is nineteen lost races, and a lost race means a finished master sitting in a
Release with nothing on `main` pointing at it. Each shard uploads its state as
an artifact and the `collect` job merges them into one commit —
`scripts/merge-shards.mjs`, unioned by id.

## Sound

The source PDF is a **silent motion system**, not a silent one: no voice, but
"every second scored with music and sound effects". With nothing spoken, the
audio track is the performance.

The whole soundtrack is **synthesised in code**, not licensed. That is a
deliberate answer to the PDF's own warning: instrumental libraries are "full of
tracks with faint vocal pads, breaths and chanting", and those count as voice.
Oscillators and filtered noise cannot produce a voice, so the hardest rule holds
by construction rather than by listening to every bed and hoping.

```text
scripts/audio/synth.mjs   oscillators, noise, envelopes, filters, WAV encoding
scripts/audio/sfx.mjs     the cue catalogue, named after cues in the scripts
scripts/audio/beds.mjs    one bed per template, rendered as separate layers
scripts/build-audio.mjs   writes the pack to public/audio/
src/audio/Score.tsx       places cues on exact frames, ducks the bed
```

Build it with `npm run audio`. It is a **build artifact, not committed
binaries** — generation is deterministic, so CI rebuilds it before every render
and `public/audio/` stays gitignored.

Beds render as **independent layers** rather than one mixed file. That is what
makes the PDF's bed behaviour expressible: DevJoke "adds a layer per beat",
SiteRoast "drops out entirely for the rebuild, returns bigger", FounderStory has
"no music at all for the first three seconds, ever". Mixed down, none of that is
possible without re-rendering audio per video.

A video's cue list lives on its plan item as `props.score`:

```json
"score": {
  "bed": [
    { "frame": 0, "layers": ["pluck"] },
    { "frame": 30, "layers": ["pluck", "kick"] },
    { "frame": 330, "layers": [] }
  ],
  "cues": [
    { "frame": 0, "sfx": "snap", "major": true },
    { "frame": 30, "sfx": "snap-p2", "major": true },
    { "frame": 60, "sfx": "snap-p4", "major": true }
  ]
}
```

`frame`, never seconds — the PDF: "Every SFX lands on the first frame of its
motion. Audio three frames late reads as an amateur edit, and in a silent video
there is nothing to hide behind." An empty `layers` array is hard silence, which
the scripts use as a punchline device on nearly all thirty.

`major: true` ducks the bed 3 dB across 10 frames, ramped in over two and back
out across the rest. Ticks and blips are texture and should be left alone, or
the bed audibly pumps. The PDF's 4 dB hard step over 6 frames was inaudible
under a loud close mix and obvious under a quiet distant one.

### Distance

The bed is atmosphere, not performance, and it is mixed to sound like it is
coming from a long way off — see *Mastering* for why the first draft was not.

Distance is not volume. Turning a close-mic'd bed down produces a quiet close
bed: still all transient and top end, still sitting on the viewer. `distant()`
in `scripts/audio/synth.mjs` does the three things that actually read as far
away — a two-pole low-pass at 1.5 kHz for air absorption, six irregularly
spaced decaying taps for diffusion, and a duller filter again on the
reflections. Tap spacing is irregular on purpose: even spacing comb-filters
into a metallic ring.

It is applied **after** each layer's RMS normalisation, not before. Normalising
afterwards would undo the physics — the hat layer is noise high-passed at
8 kHz, so almost nothing survives the low-pass, and RMS-matching that residue
back up to the other layers turns a hi-hat into amplified hiss. Attenuating
each layer by how much of it survives the air is the whole point. Measured on
the TechTip bed, the hat lands at −55 dB and the pad at −35 dB. A hi-hat a mile
away is inaudible, and it should be.

Pitch escalation — "repeat one SFX a semitone higher each beat to imply rising
absurdity, as on days 1, 8 and 16" — is the `-p2`, `-p4`, `-p6` suffixes.

A day without a transcribed `score` still gets sound: `src/audio/defaultScore.ts`
generates the template's documented bed behaviour so nothing ships silent by
accident. A transcribed day always wins.

### Mastering

**The delivery target is −23 LUFS, not the PDF's −14.** This is the one place
the mix table is deliberately overridden, and the reason is worth keeping.

−14 LUFS is the streaming norm, and it is correct for content where speech
carries the loudness: dialogue peaks pull the integrated measurement up while
the music sits underneath. These videos have no voice at all. Normalising
wall-to-wall instrumental to −14 puts every second at full loudness with
nothing dynamic beneath it. The first draft published to Postiz was rejected
for exactly that.

Worse, it was silently defeating the mix. The pre-master measurement was −26
LUFS, so the old target applied **+12 dB** of gain — no level decision made
upstream survived it. At −23 the correction is about 3 dB and the mix arrives
roughly as it was balanced.

Loudness and peak still have to be solved together — a scored motion-graphics
track is extremely peaky, sparse hits over near-silence — and every video must
land at the same loudness. Remotion mixes the score but has no master bus, so
`scripts/master-audio.mjs` runs a two-pass `loudnorm` after each render.

Two passes, not one: single-pass loudnorm works from a running estimate and
audibly pumps on material this dynamic. Measuring first and applying the
measured values is a linear, transparent correction. Video is stream-copied, so
this costs no image quality and a few seconds.

The filter is told **−2 dBTP, not −1**, and that is deliberate. loudnorm limits
the signal it sees; the AAC encoder then overshoots it. Mastering to −1 produced
a delivered file measuring **+0.71 dBTP** — above full scale. Overshoot is about
1.2 dB and barely moves with bitrate (192k, 256k and 320k all landed within
0.1 dB of each other), so the fix is headroom in the target, not a fatter audio
stream. At −2 the delivered file measures about **−0.85 dBTP**, which is what
the spec actually asks for.

Do not "correct" that back to −1 without re-measuring the delivered MP4. The
number that matters is the one in the file, not the one in the filter.

Both this and the loudness probe pass `-vn`. Remotion ships an ffmpeg built
with `--disable-encoders` and a short allow-list, so leaving a video stream
attached to a null output fails with "Encoder not found" before any analysis
runs. `volumedetect` is unavailable in that build for the same reason, which is
why loudness is measured by decoding to PCM rather than by parsing filter output.

## Render verification

Nobody watches these renders. A run that fails halfway — a font that never
loaded, a blank page, a truncated encode — still writes a playable MP4, and
unattended that mistake repeats four times a day for a week.

Before a file may be archived or published, `scripts/verify-video.mjs` probes it
and fails the run on any of:

- fewer or more than one video stream, or a codec other than h264
- a frame that is not 1080×1920
- a duration more than 0.5s from the plan's `durationInSeconds`
- a file under 100 kB, or a bitrate under 250 kbps
- **no audio stream, or a mean programme volume under −60 dB**
- **frames that never change, a blank composition, or a missing end card**

The audio check decodes the track and measures the PCM. A muted track still
encodes as a perfectly valid AAC stream, so the stream existing proves nothing.
Deliberately quiet mixes pass — the scripts use hard silence as an instrument —
but digital black does not.

### Looking at the pixels

`scripts/inspect-frames.mjs` decodes **every frame** at thumbnail size in one
ffmpeg pass and measures what the video actually shows. Container metadata only
proves a file is well-formed: a render where the fonts never loaded or the
composition froze after two seconds still produces a healthy 1080×1920 stream at
a plausible bitrate.

Calibrated against a real DevJoke render — peak variance 2301, max frame delta
1.11, 21 motion frames, motion spanning 0–73% of the body, end card luma 26.2:

| Check | Limit | Measured |
|---|---|---|
| blank composition | peak variance ≥ 12 | 2301 |
| still image | max delta ≥ 0.3 | 1.11 |
| nothing animating | ≥ 3 motion frames | 21 |
| froze mid-render | motion reaches ≥ 25% in | 73% |
| end card present | last 2s luma ≤ 90 | 26.2 |

**Mean frame-to-frame change is deliberately not a limit.** It measured 0.048 on
a perfectly good video, because these scripts hold still on purpose — *"All
motion freezes ... for a full second"*. Judging a video on its average would
fail the ones following the brief most closely. What separates a freeze from a
held beat is whether motion ever resumes.

```bash
npm run inspect -- out/d01-a.mp4 30
```

## Every video is unique

Three layers, because "unique" fails in three different ways.

**Concept** — the weekly validator already refuses repeated ids, sources,
captions, hooks and visible copy.

**Look and sound** — every video's appearance and music are derived from its
plan id, never randomised, so a retried render is identical to the first attempt
— which matters because the duplicate detector compares fingerprints.

How that derivation works changed when the series grew past a week, because the
original scheme provably cannot cover a month.

*The old scheme, still used by weeks 31 and 32.* Hash the id, then draw a
palette and a typeface independently from **8 × 7 = 56** combinations. Drawing
independently collides: measured across week 31 it gives 23 distinct looks with
5 repeats, which is what the birthday problem predicts. Over 120 videos it is
worse than untidy — 56 combinations cannot hold 120 videos at all, so by the
pigeonhole principle at least 64 of them would be wearing a look another video
already has.

*The campaign scheme, from week 33 on* (`src/variation.ts`). Two changes:

1. **The space grew past the campaign.** A **motion signature** joins palette and
   typeface — 8 × 7 × 6 = **336** combinations. Motion is a real axis, not a
   tiebreak: a signature changes the direction type arrives from, the stagger
   between words, the spring character, and the backdrop grid's cell size and
   skew. Two videos on one palette and one typeface still do not produce
   matching frames.
2. **Assignment became a walk, not a draw.** Every video's position in the
   campaign is a dense ordinal — week, day and slot are all in the id — and its
   look is `ordinal × 149 mod 336`. Because 149 is coprime to 336 that map is a
   bijection over any 336 consecutive ordinals, so a campaign's 120 videos are
   distinct **by construction** rather than by luck.

Music works identically (`scripts/variation.mjs`): key, mode, phrase offset and
tempo walk a space of 8 × 3 × 7 × 7 = **1176** with a coprime stride, so no two
videos in a campaign share a piece of music. Tempo stays within ±6 BPM of the
rate the PDF gives each template, so a bed varies without leaving its brief.

Weeks 31 and 32 deliberately keep the old scheme. They are rendered and
fingerprinted, and rewriting their looks would mean a re-render no longer
matches the fingerprint already recorded for that id — the exact alarm the
duplicate detector exists to raise.

**Before rendering** — `npm run campaign:check` proves the claim against the
plan in about a second, with no browser and no render:

```
Look space: 8 palettes x 7 typefaces x 6 motion signatures = 336 combinations, stride 149.
Planned: 176 video(s) — 120 on the campaign walk, 56 legacy.
  distinct looks   120/120
  distinct music   120/120
```

This matters because the fingerprint check below runs *after* a render — over
120 videos, discovering a collision that way costs eight minutes of runner time
per duplicate, and the file has already been uploaded to a Release.

**The finished file** — `scripts/uniqueness.mjs` fingerprints every published
video and compares each new render against the whole archive:

- a **visual signature**: perceptual hashes of 8 evenly spaced frames, 512 bits
- an **audio signature**: a 32-bucket loudness envelope

A video is only rejected when **both** match an existing one. Two DevJoke videos
legitimately share a bed, and a series legitimately shares a visual language —
it is the combination being identical that means nothing new was made. Both
signatures are stored in `archive/manifest.json`, so the check strengthens with
every video published.

This is the layer that catches what the plan validator cannot: a template
ignoring half its props, or a score falling back to the same default every time.

The bitrate floor is the load-bearing one. A blank or frozen frame costs almost
nothing to compress, so a broken render collapses to a tiny bitrate while
remaining a perfectly valid MP4. Real renders from these templates sit in the
millions of bits per second, an order of magnitude clear of the floor.

Check any file by hand:

```bash
npm run verify -- out/d01-a.mp4 17
```

## Where the videos are kept

Finished MP4s are uploaded to a **GitHub Release**, one release per week, tagged
`videos-<week-id>`. Each asset is named after its item id, so
`videos-2026-w31` holds `d01-a.mp4` through `d07-d.mp4` with permanent download
URLs.

They are not committed. Four videos a day is roughly 1.2 GB a month; committing
that would grow the repository without bound and every future clone would pay
for it. Release assets are hosted indefinitely and stay out of the git history.

What *is* committed is `archive/manifest.json` — a few hundred bytes per video:

```json
{
  "videos": [
    {
      "id": "d01-a",
      "week": "2026-w31",
      "template": "DevJoke",
      "sourceId": "meritbyte-pdf-01",
      "bytes": 8523104,
      "durationSeconds": 17.0,
      "sha256": "…",
      "url": "https://github.com/<owner>/<repo>/releases/download/videos-2026-w31/d01-a.mp4",
      "archivedAt": "2026-07-28T00:32:11.004Z"
    }
  ]
}
```

That keeps the repository itself the answer to "what have we published" while
the bytes stay in release storage. The `sha256` makes a re-download verifiable.

Archiving needs no new secret: the workflow's built-in `GITHUB_TOKEN` already
holds `contents: write`. Uploads happen **before** the Postiz call, so a video
is safely stored even if Postiz is down, and a retry replaces the asset in place
rather than duplicating it.

The 7-day artifact and the optional R2 sync are unchanged and still run.

## Setup

### 1. Rotate the Postiz API key

If a key has appeared in chat, a screen-shared terminal, or a commit, treat it as
public and regenerate it in Postiz. Put the replacement in GitHub Actions secrets,
never in `plan.json`, a committed file, or `.env` in this repository.

For an internet-facing self-hosted instance, set
`DISABLE_REGISTRATION: "true"` in its deployment configuration and restart it.

### 2. Get integration IDs

```bash
export POSTIZ_API_URL=https://postiz.pachey.duckdns.org/api
export POSTIZ_API_KEY=your-rotated-key
npm install
npm run channels
```

Paste the returned `"channels"` array into `plan.json`.

The shipped placeholder blocks **publishing**, not rendering. `npm run validate`
reports it under `PUBLISHING IS BLOCKED`, every non-dry run refuses to contact
Postiz while it is present, and dry runs render normally — so a video can be
previewed before any account is connected. Before the first post, the acceptance
workflow safely updates the first-week archive.

**Use integration ids, not identifiers.** Two Instagram accounts can both report
`instagram-standalone`. `resolveChannels` in `scripts/postiz.mjs` deliberately
refuses an ambiguous identifier so a post cannot land on the wrong account.

### 3. Configure GitHub secrets

Repository Settings → Secrets and variables → Actions:

| Secret | Required | Purpose |
|---|---:|---|
| `POSTIZ_API_URL` | yes | Self-hosted Postiz API base |
| `POSTIZ_API_KEY` | yes | Rotated Postiz API key |
| `TELEGRAM_BOT_TOKEN` | no | Completion/failure/low-queue notices |
| `TELEGRAM_CHAT_ID` | no | Telegram destination |
| `R2_ACCESS_KEY_ID` | no | Optional cold archive |
| `R2_SECRET_ACCESS_KEY` | no | Optional cold archive |
| `R2_ENDPOINT` | no | Optional cold archive |
| `R2_BUCKET` | no | Optional cold archive |
| `CLOUDINARY_URL` | no | Optional cold archive, `cloudinary://key:secret@cloud` |

The queue workflow grants its built-in `GITHUB_TOKEN` `contents: write` so it can
commit `state.json`. Branch protection or repository policy must allow that bot
commit to `main`.

### 4. Raise the Postiz API limit

Set `API_LIMIT=500` in the Postiz environment and restart. The workflow makes one
create-post request per video, but retries on HTTP 429 are deliberately slow.

### 5. Verify the first item

Actions → **Publish next video** → Run workflow. Leave `dry_run` checked.

Download the artifact and watch it on a phone. Text that is comfortable at desk
size can disappear in a social feed.

When the visual and channel setup are verified, run it manually without dry-run.
With `"postType": "schedule"`, the item is handed to Postiz with a future date
and is then marked done in the queue.

Changing `postType` is an owner decision, and can be made mid-week:

- `"schedule"` hands each video to Postiz with its assigned slot; Postiz owns
  the clock from there. This is the default.
- `"draft"` creates drafts for review, published by hand.
- `"now"` publishes immediately on receipt, ignoring the slot — refused by
  `scripts/slots.mjs` while an embargo is in force.

Edit it in `plan.json` and push; **Accept weekly plan** updates the archive even
while the week is running.

### When each video goes live

Publishing and *appearing* are separate. The publisher does not post a video; it
hands Postiz the video plus the date to post it on, taken from a fixed grid in
`scripts/slots.mjs`:

```text
slot 0   2026-08-25 09:00 +0545      <- the embargo: nothing appears before this
slot 1   2026-08-25 15:00
slot 2   2026-08-25 21:00
slot 3   2026-08-26 03:00            ... four a day, six hours apart
```

Each publish takes the next free slot and records it in `state.json` under
`scheduled`, so a run that failed after Postiz accepted the post cannot hand the
same slot out twice on the retry. An idle spell snaps forward to the next
*future* slot, still aligned to the grid, rather than dumping a backlog of
overdue posts into Postiz at once.

This matters because GitHub's scheduler is best effort — on this repository one
run fired ninety minutes late and the next was dropped outright. Under the old
`date: new Date()` model that moved the post. Now it moves only the handover;
the video still appears on its slot.

Two independent guards enforce the embargo, because arithmetic can be wrong:
`nextSlot()` never returns a slot before it, and `assertWithinEmbargo()`
re-checks whatever is actually about to be sent, before a byte is uploaded. It
also refuses `postType: "now"`, which would make Postiz ignore the date.

Override for a later campaign with `POSTIZ_FIRST_SLOT` (ISO 8601, with offset)
and `POSTIZ_SLOT_GAP_HOURS`.

## Local commands

```bash
npm run studio       # live Remotion preview
npm run channels     # list Postiz integrations and ids
npm run validate     # validate inbox, accepted weeks, and queue state
npm test             # exercise acceptance, rollover, verification, archiving
npm run queue        # show posted, remaining, and next id
npm run due          # show whether the next post is due yet, and why
npm run preflight    # prove Postiz is reachable and the next item's channels resolve
npm run campaign     # rebuild plans/ from the campaign scripts
npm run campaign:check   # prove no two planned videos share a look or music
npm run shards       # preview how a parallel render would be split
npm run verify -- out/d01-a.mp4 17   # probe one rendered file
```

None of these render. Rendering is a GitHub job — see *Rendering happens on
GitHub, never locally* above for why, and for the debugging escape hatch.

Before any commit or push:

```bash
npm run validate     # inbox, accepted weeks, queue state, campaign, uniqueness
npm test
npx tsc --noEmit
```

To see a change in motion, use `npm run studio` and scrub the composition. To
produce a real file, dispatch a dry run and download the artifact:

```bash
gh workflow run render-campaign.yml -f shards=1 -f limit=1 -f dry_run=true
```

A dry run renders and verifies but archives nothing and leaves `state.json`
alone, so it is safe to use as a test. Never use a non-dry workflow as one.

## The 30-day campaign

A month of content, planned up front rather than a week at a time. 30 days × 4
posts = **120 videos**, held in `plan-source/campaign/`:

```
plan-source/campaign/w33.json    days 1-7     28 items
plan-source/campaign/w34.json    days 8-14    28 items
plan-source/campaign/w35.json    days 15-21   28 items
plan-source/campaign/w36.json    days 22-28   28 items
plan-source/campaign/w37.json    days 29-30    8 items   ← partial
```

Those files carry only what a person writes: the template, the copy, the caption
and a provenance slug. `npm run campaign` derives everything mechanical — item
ids, day numbers, eyebrows, runtimes, week metadata and the channel block — and
writes `plans/2026-w33.json` through `w37.json`.

That split exists because the derived fields are the ones the validators check
hardest and a human is worst at: `props.day` must equal the item's day within
its week, the id must end in `dNN-x` matching its queue position, `week.order`
must be the year and week number concatenated, and the filename must match
`week.id`. The build is deterministic, so regenerating produces no diff, and
`npm run validate` fails if `plans/` has drifted from its source.

**The short week is deliberate.** 30 days is four weeks and a two-day remainder,
so `w37` holds 8 items and declares `week.partial: true`. Without that flag the
28-item rule reads it as an under-filled week — which is the failure that rule
exists to catch, since a week quietly one item short starves the queue a month
later with nothing in the logs to explain why. A partial week must still be a
whole number of days, because day and slot positions are derived from an item's
index and a half-day would misnumber everything after it.

Each day is built to a fixed rhythm: slot **A** carries that day's anchor from
the PDF's 30-day emotion sequence, **B** is the quick win, **C** is the
evidence, **D** is the release.

## Keeping the queue full

`npm run queue` shows the current position. Telegram warns at 12 remaining items,
which is at most three days of runway at four per day.

Once a week, from a phone or laptop:

1. Open `prompt.md` and generate one complete 28-item week.
2. Give it a new ISO week id and increasing order.
3. Replace the `week` and `items` values in `plan.json`; leave `mode`,
   `postType`, `channels`, and `channelSettings` unchanged.
4. Commit the edit and check that **Accept weekly plan** succeeds.

The acceptance workflow creates the archive for you; never hand-edit `plans/`.
Ids and `sourceId` values must be globally unique. Ids are portable lowercase
slugs containing only letters, digits, `_`, and `-`; future weeks should include
the week id, for example `mb-2026w32-d01-a`. The validator rejects duplicate
ideas even when punctuation, case, or hashtags differ.

One accepted week is exactly 28 items: four slots per day, `a` through `d`.
`SERIES_LENGTH` is 7 because it measures days in the ledger rule, not videos.

## Failure behavior

If validation, rendering, upload, or Postiz fails, the id is not intentionally
added to `state.json`; a later run retries the same front item. The workflow uses
one shared concurrency group, so weekly acceptance, queue publishing, and manual
batch renders cannot overlap.

Postiz and Git cannot form one atomic transaction. If Postiz accepts a post and
the runner dies before the state commit reaches GitHub, the next run can retry and
duplicate that item. Serial execution, three bounded push attempts, and rebasing
onto current `main` narrow that window but cannot eliminate it without a Postiz
idempotency key.

GitHub can disable scheduled workflows in an inactive public repository after 60
days. Successful queue runs commit `state.json`, which normally keeps the
repository active. If the queue stays exhausted for that long, re-enable the
workflow from the Actions tab after adding content.

## Manual batch renderer

`scripts/render-all.mjs` survives as a local tool — `npm run render:dry` renders
a whole plan for preview. The `Render and schedule` workflow that wrapped it is
gone. It rendered the plan across four parallel runners and handed each finished
video to Postiz on receipt, which contradicts both the one-at-a-time rule and
the embargo, and it sat one click away in the Actions tab.

In queue mode a non-dry batch is rejected outright; only `Publish next video`
may send a queue item to Postiz. This separation is deliberate: accepting a new
week must not publish 28 items.

## Capacity and cost

| Piece | Typical free allowance | Role |
|---|---|---|
| GitHub Actions | Account allowance for private repos; standard runners are unlimited for public repos | Remotion rendering |
| Oracle free VPS | Always-free allocation, if eligible | Postiz and Postgres |
| DuckDNS | Free | DNS for the Oracle public IP |
| Caddy | Free | TLS and reverse proxy |
| Postiz storage | Your server disk | Published media |
| Cloudflare R2 | Optional free allowance | Cold archive |

At four videos per day, each week contains 28 videos and a 30-day month is about
120 videos.

A 17-second video measures about 3.5 minutes of render on 8 cores. GitHub's
standard runners have 2 or 4, and each single-video run also pays checkout,
`npm install`, and browser setup, so budget roughly 8–12 minutes per run and
1,000–1,400 Actions minutes per month. A private repository must stay within its
Actions allowance — that is close enough to the 2,000-minute free tier to be
worth watching. A public repository avoids the minutes limit entirely but
exposes the source and plan.

Longer videos cost proportionally more: render time scales with frame count, so
a 24-second `SiteRoast` costs about 40% more than a 17-second `DevJoke`.

Rendered MP4s are 2–4 MB each, so 120 videos add roughly 300–500 MB per month of
GitHub Release storage. That is release storage, not repository size — clones
stay small. R2 is a second copy with a hard **8 GB budget** (`scripts/archive-r2.mjs`).
The free tier allows 10 GB-month and bills on peak usage during the month, not
the figure at the end, so the cap sits below the allowance. Before each upload
the bucket is listed and the **oldest objects are evicted** until the new file
fits, making it a rolling window rather than an unbounded archive. Nothing is
lost that matters: the GitHub Release is the permanent copy.

The client is ~200 lines of SigV4 in `scripts/r2.mjs` rather than the AWS SDK,
which would add tens of megabytes to a repository whose only other dependencies
are React and Remotion. Signing is verified against **AWS's published SigV4 test
vector**, because a wrong signature surfaces only as an unexplained 403.

### Cloudinary

A second cold copy, and the one that works today — R2 needs enabling on the
Cloudflare account before its endpoint will complete a TLS handshake.

`scripts/archive-cloudinary.mjs` uploads the **original file with no
transformation**. Cloudinary will happily re-encode on delivery, and the point
of this copy is to keep the master exactly as Remotion and the loudness pass
produced it. Verified by downloading an archived video back and comparing: the
round trip is **MD5-identical**, and the downloaded file passes the full
verification suite on its own.

The free plan is 25 monthly credits, where a credit is 1 GB of storage, or 1 GB
of viewing bandwidth, or 1000 transformations. Storage is capped at 8 GB, which
leaves the rest of the allowance for delivery — the part that grows when a video
actually gets watched. Same rolling-window eviction as R2.

Note the free plan's **100 MB per-video ceiling**; these renders are ~2 MB, and
an oversized file fails with that stated rather than a generic upload error.

```bash
npm run cloudinary   # plan, objects, storage, bandwidth, credits
```

Social-platform API pricing is separate from GitHub and Postiz. In particular,
verify current X API pricing before enabling `"now"`; links in captions can also
change platform-side cost or reach.

## Deployment path

```text
DuckDNS → Oracle public IP → port 443 → Caddy → Postiz
```

There is no tunnel. Confirm in OCI that the public IP is reserved, not ephemeral.
A DuckDNS updater running on the same stopped server cannot repair DNS while that
server is offline.

Vercel is not part of the render path: free-tier functions are unsuitable for a
1080×1920 Remotion/FFmpeg render and provide no persistent render disk. A useful
future Vercel project would be a small editor that validates and writes the next
weekly `plan.json`; actual rendering remains on GitHub.

Pexels B-roll is intentionally absent because this is motion graphics only. If
footage is added later, cache it instead of fetching during a long render.
Voiceover is also intentionally absent; adding narration requires a real audio,
timing, and caption pipeline rather than a small template change.
The source PDF also proposes licensed music and sound effects. They are not
invented or downloaded by this repository; the current deliverable is the
PDF's silent, motion-graphics version.

## Channel settings

`channelSettings` carries the per-platform fields Postiz requires. An integration
id overrides an identifier-level default.

```json
{
  "instagram-standalone": {
    "__type": "instagram-standalone",
    "post_type": "post"
  },
  "x": {
    "__type": "x",
    "who_can_reply_post": "everyone"
  },
  "threads": {
    "__type": "threads"
  },
  "facebook": {
    "__type": "facebook",
    "post_type": "post"
  },
  "linkedin": {
    "__type": "linkedin"
  }
}
```

Instagram Reels are produced by attaching one MP4 with `post_type: "post"`.
There is no `"reel"` value. Captions for X must stay under 280 characters.

## Load-bearing safety decisions

Do not remove or work around these:

- `publishVideo` in `scripts/postiz.mjs` being the *only* thing that can create
  a post. `scripts/render-all.mjs` once carried a second, complete Postiz client
  with its own `date: new Date()`, so the embargo below simply did not apply to
  it. A test asserts no other module reaches `POST /posts`.
- `assertWithinEmbargo` in `scripts/slots.mjs`; the last check before a video is
  sent, holding the 25 August date even if the slot arithmetic is wrong. It also
  refuses `postType: "now"`, which makes Postiz ignore the date entirely.
- `weekIdOf` in `scripts/week-id.mjs`; every storage identifier is normalised
  there. Passing the week *object* produced the release tag
  `videos-[object Object]` and lost a rendered batch to a 422.
- `resolveChannels` in `scripts/postiz.mjs`; integration identifiers are not
  necessarily unique.
- The past-publish-date error in `scripts/validate-plan.mjs`; legacy calendar
  plans with stale dates could otherwise release a whole backlog.
- The queue non-dry batch guard; one run must never drain the whole queue.
- The `publishBlockers` check in `scripts/render-all.mjs`; it is the last gate
  between an unresolved channel list and a real audience. Rendering may proceed
  with blockers, publishing may not.
- The bitrate floor in `scripts/verify-video.mjs`; without it a blank render is
  indistinguishable from a good one and posts anyway.
- The audio-stream and loudness checks in `scripts/verify-video.mjs`; every one
  of the thirty scripts is scored, so a silent render is a failure.
- Synthesised audio rather than a music library. The PDF's hardest rule is that
  nothing may read as a human voice, and it warns that instrumental libraries
  routinely contain vocal pads and breaths. Swapping in licensed tracks moves
  that rule from guaranteed to hoped-for.
- Bed layers rendered separately rather than pre-mixed; the PDF's bed behaviour
  needs layers to appear and drop out mid-video.
- The staged-path allowlist in the publish workflow's commit step; video bytes
  belong in a Release, never in git.
- `postType` changes belong to the repository owner.

Never commit secrets or `.env`. Never trigger a non-dry workflow for testing.

## Adding a template

All four steps are required:

1. Add the component in `src/templates/` and wrap it in `<Frame>`.
2. Register it in `src/Root.tsx` with `calculateMetadata={durationFrom}`. The
   composition id must exactly match the `template` value in `plan.json`.
3. Add required props and character limits to `TEMPLATES` in
   `scripts/validate-plan.mjs`.
4. Add the prop contract to `prompt.md`.

Skipping validation metadata can waste a full render run.

## Design notes

The visual identity is an aubergine ground, warm paper type, and amber signal.
Bricolage Grotesque is the display face; JetBrains Mono handles labels and
numerals.

The ledger rule at the bottom fills in proportion to `day / SERIES_LENGTH`.
Changing the weekly run length requires changing `SERIES_LENGTH` in `src/theme.ts`,
or the bar will fill at the wrong point.

The grain in `src/components/Frame.tsx` is a repeating 256px data-URI tile, not
a full-frame SVG filter. It looks the same — the tile uses identical
`feTurbulence` parameters, and a flat region of the finished frame carries the
same noise density either way — but it is rasterised once instead of on every
frame. Measured on this project, the full-frame version accounted for most of
total render time: the same 17-second video took 553s with it and 217s with the
tile, producing an all-but-identical file (1134 vs 1133 kbps). Do not convert it
back to a per-frame filter.

Remotion is free for individuals and companies under four people; larger
companies require its commercial licence. Rendering remains on GitHub-hosted
runners, not Vercel or the Oracle Postiz box.
