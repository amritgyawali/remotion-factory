# remotion-factory

Prepare one seven-day JSON plan. GitHub accepts it into an immutable queue,
renders one video every six hours, and hands four videos a day to Postiz. The
laptop and local Studio can stay off for the rest of the week.

```text
plan.json weekly inbox → plans/<week>.json → Remotion → Postiz
                                  ↑              ↓
                         four daily cron runs  state.json
```

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
  "postType": "draft",
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

The `Publish next video` workflow runs at 00:17, 06:17, 12:17, and 18:17 in
`Asia/Kathmandu`. Each run:

1. Validates every accepted week and `state.json`.
2. Selects the first item whose id is not in `state.json.posted`.
3. Renders exactly that one item with Remotion, using every core on the runner.
4. Verifies the MP4 before anything else may touch it (see *Render verification*).
5. Uploads the MP4 to the week's GitHub Release (see *Where the videos are kept*).
6. Sends it to every configured Postiz integration.
7. Adds the id to `state.json` only after Postiz accepts the request.
8. Commits `state.json` and `archive/manifest.json` back to `main`.

A dry run renders the same next item but never contacts Postiz and never advances
the queue. An exhausted queue—where every accepted id is in `state.json`—exits
without installing Chrome or rendering.

GitHub cron is best-effort and may start late during heavy load. It never performs
a catch-up burst: one workflow run can process at most one queue item.

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
`instagram-standalone`. `resolveChannels` deliberately refuses an ambiguous
identifier so a post cannot land on the wrong account.

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
With `"postType": "draft"`, the item is stored in Postiz drafts and is then marked
done in the queue.

Changing `postType` is an owner decision, and can be made mid-week:

- `"draft"` creates four drafts per day for review.
- `"now"` publishes four items per day immediately after each render.
- `"schedule"` is rejected in queue mode; the GitHub cron is already the clock.

Edit it in `plan.json` and push; **Accept weekly plan** updates the archive even
while the week is running. Under `"now"` there is no review step — four posts a
day reach every configured account until the queue empties.

## Local commands

```bash
npm run studio       # live Remotion preview
npm run channels     # list Postiz integrations and ids
npm run validate     # validate inbox, accepted weeks, and queue state
npm test             # exercise acceptance, rollover, verification, archiving
npm run queue        # show posted, remaining, and next id
npm run render:dry   # render the whole plan locally without Postiz
npm run verify -- out/d01-a.mp4 17   # probe one rendered file
```

Before any commit or push:

```bash
npm run validate
DRY_RUN=1 ONLY=d01-a npm run render
```

Watch `out/d01-a.mp4` before committing. Never use a non-dry workflow as a test.

PowerShell uses the equivalent environment syntax:

```powershell
$env:DRY_RUN = "1"
$env:ONLY = "d01-a"
npm run render
Remove-Item Env:DRY_RUN, Env:ONLY
```

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

`Render and schedule` is manual-only. Its chunked matrix is retained because a
large dry render cannot fit inside one six-hour GitHub job. In queue mode, a
non-dry batch is rejected in `scripts/render-all.mjs`; only `Publish next video`
may send a queue item to Postiz.

This separation is deliberate: accepting a new week must not publish 28 items.

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
stay small. If R2 is also enabled, use a 90-day lifecycle rule so the second
copy does not grow forever.

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

- The chunked matrix in `.github/workflows/render.yml`; large batches exceed one
  job's six-hour limit.
- `resolveChannels` in `scripts/render-all.mjs`; integration identifiers are not
  necessarily unique.
- The past-publish-date error in `scripts/validate-plan.mjs`; legacy calendar
  plans with stale dates could otherwise release a whole backlog.
- The queue non-dry batch guard; one run must never drain the whole queue.
- The `publishBlockers` check in `scripts/render-all.mjs`; it is the last gate
  between an unresolved channel list and a real audience. Rendering may proceed
  with blockers, publishing may not.
- The bitrate floor in `scripts/verify-video.mjs`; without it a blank render is
  indistinguishable from a good one and posts anyway.
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
