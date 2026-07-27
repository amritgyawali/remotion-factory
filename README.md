# remotion-factory

Keep a JSON queue full. GitHub renders one video every six hours and hands it to
Postiz. Four runs a day, with no laptop or local renderer left online.

```text
plan.json → GitHub Actions → Remotion → Postiz → six social accounts
                    ↓
                state.json
```

The Oracle box only runs Postiz and its database. It never renders video, so the
GitHub-hosted runner does the expensive work and then disappears.

> **This is its own repository.** Do not put it inside the `postiz-app` clone.
> That clone is upstream source and read-only. The deployment clone should hold
> only its `docker-compose.yaml`, `Caddyfile`, and `.env`.

## Queue behavior

`plan.json` is an ordered queue:

```json
{
  "mode": "queue",
  "postType": "draft",
  "items": [
    { "id": "d01-a", "template": "StatCard", "caption": "...", "props": {} }
  ]
}
```

The `Publish next video` workflow runs at 00:17, 06:17, 12:17, and 18:17 in
`Asia/Kathmandu`. Each run:

1. Validates the whole plan and `state.json`.
2. Selects the first item whose id is not in `state.json.posted`.
3. Renders exactly that one item with Remotion.
4. Sends it to every configured Postiz integration.
5. Adds the id to `state.json` only after Postiz accepts the request.
6. Commits only `state.json` back to `main`.

A dry run renders the same next item but never contacts Postiz and never advances
the queue. An exhausted queue—where every plan id is in `state.json`—exits
without installing Chrome or rendering.

GitHub cron is best-effort and may start late during heavy load. It never performs
a catch-up burst: one workflow run can process at most one queue item.

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

Changing `postType` is an owner decision:

- `"draft"` creates four drafts per day for review.
- `"now"` publishes four items per day immediately after each render.
- `"schedule"` is rejected in queue mode; the GitHub cron is already the clock.

## Local commands

```bash
npm run studio       # live Remotion preview
npm run channels     # list Postiz integrations and ids
npm run validate     # validate the plan and queue state
npm run queue        # show posted, remaining, and next id
npm run render:dry   # render the whole plan locally without Postiz
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

To top up from a phone:

1. Open `prompt.md` and generate the next content batch.
2. Copy the returned JSON objects.
3. Open `plan.json` on GitHub and append them to `items`.
4. Commit the edit.

Append; do not replace. `state.json` tracks posted work by id, so ids must remain
unique forever. Ids must also be portable lowercase slugs containing only
letters, digits, `_`, and `-`; the validator rejects path characters and
Windows-reserved filenames. Editing `plan.json` does not trigger the manual
batch renderer. The next cron run simply sees the longer queue.

A full 30-day run is 120 items: four slots per day, `a` through `d`.
`SERIES_LENGTH` remains 30 because it measures days in the ledger rule, not the
number of videos.

## Failure behavior

If validation, rendering, upload, or Postiz fails, the id is not intentionally
added to `state.json`; a later run retries the same front item. The workflow uses
one shared concurrency group, so queue and manual batch renders cannot overlap.

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

This separation is deliberate: appending 500 items must not publish 500 items.

## Capacity and cost

| Piece | Typical free allowance | Role |
|---|---|---|
| GitHub Actions | Account allowance for private repos; standard runners are unlimited for public repos | Remotion rendering |
| Oracle free VPS | Always-free allocation, if eligible | Postiz and Postgres |
| DuckDNS | Free | DNS for the Oracle public IP |
| Caddy | Free | TLS and reverse proxy |
| Postiz storage | Your server disk | Published media |
| Cloudflare R2 | Optional free allowance | Cold archive |

At four videos per day, a 30-day queue contains 120 videos. Budget roughly
700–1,200 GitHub Actions minutes per month when each render takes 4–8 minutes and
each single-video run also pays setup time. A private repository must stay within
its Actions allowance; a public repository avoids that minutes limit but exposes
the source and plan.

At about 10 MB per MP4, 120 videos add roughly 1.2 GB per month. If R2 is enabled,
use a 90-day lifecycle rule so the archive does not grow forever.

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
future Vercel project would be a small editor that validates and appends
`plan.json`; actual rendering remains on GitHub.

Pexels B-roll is intentionally absent because this is motion graphics only. If
footage is added later, cache it instead of fetching during a long render.
Voiceover is also intentionally absent; adding narration requires a real audio,
timing, and caption pipeline rather than a small template change.

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
Changing a run from 30 days requires changing `SERIES_LENGTH` in `src/theme.ts`,
or the bar will fill at the wrong point.

Remotion is free for individuals and companies under four people; larger
companies require its commercial licence. Rendering remains on GitHub-hosted
runners, not Vercel or the Oracle Postiz box.
