# remotion-factory

Drop a JSON file in. Get 30 scheduled videos out. GitHub does the rendering.

```
plan.json  →  git commit  →  GitHub Actions  →  Remotion  →  Postiz  →  posted
```

Your Oracle box only runs Postiz and its database. It never renders anything, so it
never runs out of RAM.

> **This is its own repository.** Do not put it inside your `postiz-app` clone — that
> clone is Postiz's upstream source and you only have read access to it. Your clone
> should hold nothing but your `docker-compose.yaml`, `Caddyfile` and `.env`.

---

## Setup

### 1. Rotate your Postiz API key first

If a key has been pasted into a chat window, a terminal you screen-shared, or a
commit, treat it as public. Postiz UI → Settings → regenerate. The new one goes into
a GitHub secret and nowhere else — never into `plan.json`, never into a file you commit.

While you're in the deployment config, set `DISABLE_REGISTRATION: 'true'` in
`docker-compose.yaml` and restart. Your instance is reachable on the open internet
through DuckDNS, so the signup form is reachable too.

### 2. Get your channel IDs

```bash
export POSTIZ_API_URL=https://postiz.pachey.duckdns.org/api
export POSTIZ_API_KEY=your-new-key
npm install
npm run channels
```

That prints every connected channel with its integration id, and hands you a
`"channels"` array to paste into `plan.json`.

**Use the ids, not the identifiers.** Identifiers are not unique — two Instagram
accounts both report `instagram-standalone`, so naming the platform posts to both.
The render script refuses to run on an ambiguous reference rather than guessing.

### 3. GitHub secrets

Settings → Secrets and variables → Actions:

| Secret | Required | Value |
|---|---|---|
| `POSTIZ_API_URL` | yes | `https://postiz.pachey.duckdns.org/api` |
| `POSTIZ_API_KEY` | yes | the **rotated** key |
| `TELEGRAM_BOT_TOKEN` | no | from @BotFather |
| `TELEGRAM_CHAT_ID` | no | your chat id |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` / `R2_BUCKET` | no | cold archive only |

### 4. Raise the Postiz rate limit

Add `API_LIMIT=500` to the Postiz environment and restart. The self-hosted default
is 30 requests/hour and a 30-video month makes 30 create-post calls. The script backs
off and retries on 429, but raising the limit is the actual fix.

### 5. Set your cadence

`plan.json` carries the times once, not on every item:

```json
"schedule": {
  "startDate": "2026-08-01",
  "timezone": "+05:45",
  "times": ["07:30", "12:45", "19:15"]
}
```

Items are laid out in array order — first three fill day one's slots, next three
fill day two, and so on. Ninety items becomes thirty days at three a day, and you
never type a timestamp. Any item that has its own `publishAt` keeps it.

### 6. First run

Actions → **Render and schedule** → Run workflow → tick **dry_run**. Renders the
starter videos, touches nothing. Download the `videos` artifact and watch them **on
your phone** — text that reads fine at desk size disappears in a feed.

Then run again without dry_run. `plan.json` ships with `"postType": "draft"`, so they
land in your Postiz drafts and nothing goes live.

Once drafts look right, change `postType` to `"schedule"`. From that point Postiz
publishes on its own and nothing else is needed from you.

### Locally

```bash
npm run studio        # live preview with hot reload
npm run channels      # list channels and their ids
npm run validate      # check plan.json
npm run render:dry    # render everything, skip Postiz
```

---

## Channel settings

`channelSettings` in `plan.json` carries the per-platform fields Postiz requires.
Keys can be an identifier (applies to every account on that platform) or a specific
integration id (applies to one account, and wins over the identifier).

```json
"channelSettings": {
  "instagram-standalone": { "__type": "instagram-standalone", "post_type": "post" },
  "x":                    { "__type": "x", "who_can_reply_post": "everyone" },
  "threads":              { "__type": "threads" },
  "facebook":             { "__type": "facebook", "post_type": "post" },
  "linkedin":             { "__type": "linkedin" }
}
```

Instagram Reels come from attaching one MP4 with `post_type: "post"`. There is no
`"reel"` value — passing it fails the post.

X rejects captions over 280 characters. The validator warns before you render.

## Auto-publish

With `"postType": "schedule"` these go live with no human between the AI and your
audience, under your name. Two guards are built in:

- A publish time in the past is a **hard error**, not a warning. Without that, a
  stale `startDate` would fire the entire backlog at once across six accounts —
  which is the exact pattern that gets accounts restricted.
- `prompt.md` tells the model these publish unreviewed, and to drop any claim it
  can't stand behind rather than soften it.

Neither guard reads the content. If you want one glance before anything goes out,
set `postType` back to `"draft"` and approve from the Postiz UI on your phone — the
rest of the pipeline is identical.

---

## Every month, from your phone

You don't need a laptop for any of this.

1. Open `prompt.md`, paste it into Claude or Gemini with your topic.
2. Copy the JSON array it returns.
3. Open `plan.json` on github.com in your phone browser, tap the pencil, replace the
   `items` array, bump `schedule.startDate` to next month, commit.
4. Sleep. Telegram messages you when the run finishes.

The blocks above `items` — schedule, channels, channelSettings — stay as they are
month to month. You only ever replace the array.

Before a frame renders, the run validates the plan and resolves every channel
reference, so a typo fails in seconds rather than hours. If one video fails the rest
still get scheduled; re-run just the failures with the `only` input, e.g. `d07-b,d19-a`.

### How the run is split

A GitHub job is capped at **6 hours**, and ninety videos at 4–8 minutes each won't
fit in one. The workflow validates the plan, splits it into chunks of 12, and runs
four chunks in parallel. Same total minutes, each job comfortably under the cap, and
ninety videos finish in about two hours of wall clock instead of ten.

---

## What each piece costs

| Piece | Free limit | What it does here |
|---|---|---|
| GitHub Actions | 2,000 min/month private, **unlimited if public** | renders everything |
| Oracle free VPS | always free | Postiz + Postgres only |
| DuckDNS | free | dynamic DNS to your Oracle public IP |
| Caddy | free | TLS and reverse proxy on the box |
| Postiz storage | your own disk | ~10 MB × 30 = 300 MB/month |
| Cloudflare R2 | 10 GB, free egress | optional archive |

Budget **4–8 minutes per video** on a 2-core runner. At three a day that's 90 videos
and **360–720 minutes a month** against a 2,000 free allowance — comfortable, with
room to re-run failures. A public repo gets unlimited minutes *and* 4-core runners.

Storage runs about **900 MB a month**, so R2's free 10 GB fills in roughly eleven
months. Set a lifecycle rule on the bucket to delete objects after 90 days and it
never fills at all.

Your path is DuckDNS → Oracle public IP → port 443 → Caddy → Postiz. There's no
tunnel in it, which means the box is directly exposed and the public IP matters:
confirm in the OCI console that it's **reserved**, not ephemeral. Stopping an
instance keeps an ephemeral IP, but termination or unassignment releases it, and if
your DuckDNS updater runs as a cron job on that same box it can't update while the
box is down.

### Three things that aren't free, said plainly

- **Remotion is not MIT-licensed.** Free for individuals and companies under four
  people; a company licence is required past that. See remotion.dev/license.
- **Pexels B-roll** isn't wired in, because this series is motion-graphics only. If
  you add it, cache clips in the repo rather than fetching at render time — a flaky
  API call shouldn't fail a three-hour job.
- **No voiceover means no Piper and no whisper.cpp.** If you ever add narration,
  that's a real audio pipeline, not a small extra step.

---

## Where Vercel fits

Not in the render path. Free-tier function limits are nowhere near a 1080×1920
render and there's no persistent disk for ffmpeg. Rendering there means Remotion
Lambda, which is AWS and isn't free.

The one good use: a small page that writes `plan.json` for you — field limits baked
in, live character counts, a preview of how text wraps at phone width, and a commit
button using the GitHub API. Turns the monthly 20 minutes into about 5. Build it
after the pipeline runs, not before.

---

## Adding a template

1. Copy `src/templates/ListReveal.tsx`, change the middle, keep the `<Frame>` wrapper.
2. Register it in `src/Root.tsx` with `calculateMetadata={durationFrom}`.
3. Add its required props and character limits to `TEMPLATES` in
   `scripts/validate-plan.mjs`.
4. Add its prop list to `prompt.md` so the AI knows it exists.

Step 3 is the one people skip, and then a typo costs a full render run.

## Design notes

Aubergine ground, warm paper type, amber signal — chosen over the usual near-black
and acid green because a mid-dark chromatic ground keeps its identity through feed
compression, and won't look like everyone else's Remotion output.

The signature is the ledger rule at the bottom: a hairline filling left to right in
proportion to `day / 30`. Same on every video, so a returning viewer reads the
series' progress without being told.

Fonts are Bricolage Grotesque for display, JetBrains Mono for labels and numerals.
If either Google Fonts import breaks, swap the two import lines at the top of
`src/theme.ts` — nothing else references them.
