import Link from "next/link";
import { ReviewQueue } from "@/components/ReviewQueue";
import { TriggerPanel } from "@/components/TriggerPanel";
import { StatusPill, runLabel, runRole } from "@/components/Status";
import { Card, ErrorNote, Grid, Meter, StatTile } from "@/components/ui";
import {
  QUEUE_LOW_WATER,
  approvalOf,
  archiveFootprint,
  bufferedVideos,
  dueDecision,
  loadManifest,
  loadState,
  loadWeeks,
  nextAttempt,
  queueSnapshot,
} from "@/lib/factory";
import { lastFailure, listRuns, type FailureReport, type WorkflowRun } from "@/lib/github";
import { checkPostiz } from "@/lib/postiz";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";

export const revalidate = 0;

/**
 * Everything loads in parallel and each half degrades on its own: a Postiz
 * outage must not blank the queue, and an expired GitHub token must not hide
 * the fact that Postiz is fine.
 */
async function load() {
  const [github, postiz] = await Promise.allSettled([
    (async () => {
      const [state, weeks, runs, manifest, footprint] = await Promise.all([
        loadState(),
        loadWeeks(),
        listRuns(8),
        loadManifest(),
        archiveFootprint(),
      ]);
      // Depends on `runs`, so it cannot join the batch above.
      const failure = await lastFailure(runs).catch(() => null);
      return { state, weeks, runs, manifest, footprint, failure };
    })(),
    checkPostiz(),
  ]);

  return { github, postiz };
}

export default async function OverviewPage() {
  const { github, postiz } = await load();

  if (github.status === "rejected") {
    return (
      <ErrorNote
        title="Could not read the repository"
        detail={github.reason instanceof Error ? github.reason.message : String(github.reason)}
      />
    );
  }

  const { state, weeks, runs, manifest, footprint, failure } = github.value;

  if (!state) {
    return (
      <ErrorNote
        title="state.json is missing on the publishing branch"
        detail="The factory refuses to guess what has already posted. Restore the file before the next run."
      />
    );
  }

  const queue = queueSnapshot(weeks, state.data);
  const due = dueDecision(state.data);
  const attempt = nextAttempt();
  const lastRun = runs.find((run) => run.name === "Publish next video") ?? runs[0];
  const health = postiz.status === "fulfilled" ? postiz.value : null;

  const daysOfRunway = Math.floor(queue.remaining / 4);

  // The review buffer sits between the morning render and the publish slots.
  const buffer = bufferedVideos(state.data);
  const awaitingReview = buffer.filter((entry) => approvalOf(entry) === "pending").length;
  const approved = buffer.filter((entry) => approvalOf(entry) === "approved").length;

  return (
    <div className="flex flex-col gap-4">
      <Grid min="200px">
        <StatTile
          label="Queue remaining"
          value={queue.remaining}
          hint={
            queue.remaining <= QUEUE_LOW_WATER
              ? `Low — about ${daysOfRunway} day${daysOfRunway === 1 ? "" : "s"} of runway`
              : `about ${daysOfRunway} days at four a day`
          }
          status={
            queue.remaining === 0 ? (
              <StatusPill role="critical" label="Empty" />
            ) : queue.remaining <= QUEUE_LOW_WATER ? (
              <StatusPill role="warning" label="Low" />
            ) : (
              <StatusPill role="good" label="Healthy" />
            )
          }
        />

        <StatTile
          label="Next post"
          value={due.due ? "Due now" : relativeTime(due.opensAt)}
          hint={due.reason}
          status={
            due.due ? <StatusPill role="good" label="Ready" /> : <StatusPill role="neutral" label="Waiting" />
          }
        />

        <StatTile
          label="Awaiting review"
          value={awaitingReview}
          hint={
            buffer.length
              ? `${buffer.length} rendered, ${approved} approved`
              : `next batch ${relativeTime(attempt)}`
          }
          status={
            awaitingReview > 0 ? (
              <StatusPill role="warning" label="Needs you" />
            ) : approved > 0 ? (
              <StatusPill role="good" label="Ready" />
            ) : undefined
          }
        />

        <StatTile
          label="Postiz"
          value={health?.ok ? `${health.live} live` : "Unreachable"}
          hint={health?.ok ? health.host : (health?.reason ?? "Check failed")}
          status={
            health?.ok ? (
              <StatusPill role="good" label="Reachable" />
            ) : health?.configured === false ? (
              <StatusPill role="warning" label="Not set" />
            ) : (
              <StatusPill role="critical" label="Down" />
            )
          }
        />
      </Grid>

      {failure ? <FailureCard failure={failure} /> : null}

      <ReviewQueue entries={buffer} approvalRequired={process.env.REQUIRE_APPROVAL !== "0"} />

      {!health?.ok && health ? (
        <ErrorNote title="Postiz is not answering" detail={health.reason} />
      ) : null}

      {queue.unknown.length > 0 ? (
        <ErrorNote
          title="state.json references ids that no accepted week contains"
          detail={`Every run will fail until this is resolved: ${queue.unknown.join(", ")}`}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card
            title="Next out of the queue"
            action={
              queue.nextPlanPath ? (
                <Link href="/plan" className="text-xs" style={{ color: "var(--accent)" }}>
                  Edit plan →
                </Link>
              ) : null
            }
          >
            {queue.next ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded px-1.5 py-0.5 text-sm font-semibold" style={{ background: "var(--wash)" }}>
                    {queue.next.id}
                  </code>
                  <span className="text-xs secondary">{queue.next.template}</span>
                  <span className="text-xs muted">·</span>
                  <span className="text-xs muted">{queue.nextWeek}</span>
                </div>
                {typeof queue.next.props?.hook === "string" ? (
                  <p className="text-sm">{String(queue.next.props.hook)}</p>
                ) : null}
                <p className="text-xs secondary whitespace-pre-wrap">{queue.next.caption}</p>
              </div>
            ) : (
              <p className="text-sm secondary">
                The queue is empty. Accept a new 28-item week before the next attempt.
              </p>
            )}
          </Card>

          <Card title="Recent runs" action={<Link href="/runs" className="text-xs" style={{ color: "var(--accent)" }}>All runs →</Link>} dense>
            {runs.length === 0 ? (
              <p className="p-4 text-sm secondary">No workflow runs yet.</p>
            ) : (
              <ul>
                {runs.slice(0, 6).map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <TriggerPanel due={due.due} queueEmpty={queue.remaining === 0} />

          <Card title="Archive">
            <div className="flex flex-col gap-4">
              <Meter
                label="Week progress"
                value={queue.posted}
                max={queue.total || 1}
                caption={`${queue.posted} of ${queue.total} posted`}
              />
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs muted">Videos archived</dt>
                  <dd className="font-medium tabular">{manifest.length}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">Release storage</dt>
                  <dd className="font-medium tabular">{formatBytes(footprint.bytes)}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">Last posted</dt>
                  <dd className="font-medium">{relativeTime(state.data.lastPostedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">Accepted weeks</dt>
                  <dd className="font-medium tabular">{weeks.length}</dd>
                </div>
              </dl>
            </div>
          </Card>

          {lastRun ? (
            <Card title="Last publish attempt">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill
                    role={runRole(lastRun.status, lastRun.conclusion)}
                    label={runLabel(lastRun.status, lastRun.conclusion)}
                  />
                  <span className="text-xs muted">{relativeTime(lastRun.created_at)}</span>
                </div>
                <Link href={`/runs/${lastRun.id}`} className="text-sm" style={{ color: "var(--accent)" }}>
                  {lastRun.name} #{lastRun.run_number} →
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The most recent failure, with the reason lifted out of the job log.
 *
 * There is no Telegram on this deployment, so this card is the notification.
 * It shows the failing step and the error lines themselves — not a link to a
 * place where the error can be found.
 */
function FailureCard({ failure }: { failure: FailureReport }) {
  return (
    <section className="surface overflow-hidden" style={{ borderColor: "var(--color-status-critical)" }}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" style={{ color: "var(--color-status-critical)" }}>
            ✕
          </span>
          Last run failed
          {failure.stepName ? <span className="font-normal secondary">at “{failure.stepName}”</span> : null}
        </h2>
        <span className="text-xs muted">
          {failure.run.name} #{failure.run.run_number} · {relativeTime(failure.run.created_at)}
        </span>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {failure.lines.length > 0 ? (
          <pre
            className="scroll-x rounded-lg p-3 font-mono text-[11px] leading-relaxed"
            style={{ background: "var(--plane)" }}
          >
            {failure.lines.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </pre>
        ) : (
          <p className="text-xs secondary">
            GitHub has expired this run’s logs, so the reason is no longer retrievable. The step that
            failed was “{failure.stepName ?? failure.jobName}”.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Link href={`/runs/${failure.run.id}`} style={{ color: "var(--accent)" }}>
            Full log and step timings →
          </Link>
          <a href={failure.run.html_url} target="_blank" rel="noreferrer" className="muted">
            Open on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function RunRow({ run }: { run: WorkflowRun }) {
  return (
    <li className="border-b last:border-b-0">
      <Link
        href={`/runs/${run.id}`}
        className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--wash)]"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{run.name}</span>
          <span className="text-xs muted">
            #{run.run_number} · {run.event} · {relativeTime(run.created_at)}
          </span>
        </span>
        <StatusPill role={runRole(run.status, run.conclusion)} label={runLabel(run.status, run.conclusion)} />
      </Link>
    </li>
  );
}
