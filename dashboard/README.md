# Video factory — control plane

A dashboard for the factory in the parent directory: what is queued, what ran,
what shipped, and what Postiz thinks. It can edit the plan and start a run.

It is a **control plane, not a renderer**. Rendering a 22-second video takes four
minutes and gigabytes of Chrome; a Vercel function has neither the time nor the
disk. Every heavy action here is a `workflow_dispatch` against GitHub Actions,
which is where the work already happens.

```
browser ──▶ Next.js (Vercel) ──▶ GitHub API   (runs, logs, releases, contents)
                             └─▶ Postiz API   (integrations, posts)
```

There is no database. `state.json` on the publishing branch is the source of
truth for what has shipped, exactly as it is for the workflow — so the dashboard
cannot drift from what the pipeline believes.

## What is on each page

| Page | What it answers |
|---|---|
| **Overview** | Is a post due, when is the next attempt, is Postiz up, what goes out next, did the last run pass |
| **Plan** | The 28-item week, grouped by day, editable with live validation; commits back to the branch |
| **Runs** | Every workflow run; drill in for per-step timings and raw logs, re-run or cancel |
| **Videos** | The archive from `archive/manifest.json`, playable in the browser |
| **Channels** | Postiz integrations, which ones the plan targets, and recent posts |

## Deploying to Vercel (free tier)

The app lives in a subdirectory, so Vercel needs to be told where.

1. **Import the repo** at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `dashboard`. Framework preset detects Next.js.
3. Add the environment variables below under **Settings → Environment Variables**.
4. Deploy.

Everything is server-rendered on demand and nothing is precomputed at build
time, so a deployment does not need the secrets to be valid — a wrong token
shows up as an error card on the page rather than a failed build.

### Environment variables

See [`.env.example`](.env.example) for the annotated list. The required ones:

| Variable | Notes |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT, this repo only. **Contents: read/write** and **Actions: read/write**. Nothing else. |
| `GITHUB_REPO` | `owner/repo` |
| `DASHBOARD_PASSWORD` | What you type to get in. Make it long. |
| `DASHBOARD_SECRET` | Signs the session cookie. `openssl rand -hex 32`. Must differ from the password. |

Optional: `GITHUB_BRANCH` (default `main`), `POSTIZ_API_URL`, `POSTIZ_API_KEY`,
`MIN_GAP_HOURS` (must match the workflow, or the predicted next slot is wrong).

Omit the Postiz pair and the rest of the dashboard still works — those panels
report "not set" instead of failing.

## Access control

Everything is behind one password. This is deliberate for a single-operator
console, and it is also the whole of the authentication story — there are no
accounts, roles, or audit trail. Treat the password as equivalent to write
access on the repository, because that is what it grants.

- `middleware.ts` gates every route except `/login` and `/api/auth`, so a new
  route cannot forget to check.
- The session is an HMAC-signed cookie (`httpOnly`, `SameSite=Lax`, `Secure` in
  production), 12-hour expiry. No session store, which suits a deployment that
  scales to zero.
- The password is compared in constant time, with a per-instance rate limit.
- Tokens are read only in server components and route handlers. `server-only`
  is imported by every module that touches a secret, so a stray client import
  fails the build rather than shipping a token to the browser.

If the deployment is reachable from the internet, consider also enabling Vercel's
Deployment Protection in front of it.

## Safety properties worth knowing

**Publishing is a two-step.** A live run puts a video in front of real accounts
and cannot be undone, so the button asks for confirmation. Dry runs are one click.

**Posted items are locked.** Once an id is in `state.json`, the plan editor makes
it read-only — the video has shipped, and rewriting its record would leave the
archive describing something that was never published.

**Plan edits are validated twice.** The browser runs `src/lib/plan-schema.ts` on
every keystroke and the save route runs it again before writing. Both are a port
of `scripts/validate-plan.mjs`; where they disagree, the Node one wins, because
that is the copy standing between a bad plan and Postiz.

**Writes are optimistically locked.** A commit carries the blob sha the editor
loaded. If the workflow committed `state.json` in the meantime, GitHub rejects
the write with a 409 and the dashboard asks you to reload, rather than silently
discarding the newer commit.

**Workflow names are allowlisted.** The dispatch route accepts three known
filenames, not whatever the browser sends.

## Cost

Comfortably inside the Hobby tier. Every page is a handful of GitHub API calls;
the API budget is 5000/hour and a page view spends under ten. Videos stream
directly from their Release asset URL rather than through a function, so the
bandwidth-heavy path never touches Vercel.

The run page polls every 6 seconds **only while a run is in flight**, and stops
once it settles.

## Local development

```bash
cd dashboard
npm install
cp .env.example .env.local     # fill it in
npm run dev
```

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

## Limits

- **No rendering, no preview.** The dashboard shows videos that already exist. It
  cannot render one; that needs a GitHub runner.
- **Logs expire.** GitHub keeps run records far longer than run logs, so an old
  run will show its steps and timings but report the log as expired.
- **Accepting a new week is not here.** The editor edits accepted weeks. Creating
  one still goes through `plan.json` and the `Accept weekly plan` workflow, which
  has the cross-week uniqueness rules the dashboard does not reimplement.
- **Postiz's `/posts` shape varies by version.** If the recent-posts list reports
  an unrecognised shape, the panel says so rather than guessing.
