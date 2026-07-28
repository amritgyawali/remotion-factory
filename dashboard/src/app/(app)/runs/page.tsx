import Link from "next/link";
import { StatusPill, runLabel, runRole } from "@/components/Status";
import { Card, EmptyState, ErrorNote, Grid, StatTile } from "@/components/ui";
import { listRuns, listWorkflows } from "@/lib/github";
import { formatDateTime, formatDuration, relativeTime, shortSha } from "@/lib/format";

export const revalidate = 0;

export default async function RunsPage() {
  let runs;
  let workflows;
  try {
    [runs, workflows] = await Promise.all([listRuns(30), listWorkflows()]);
  } catch (error) {
    return (
      <ErrorNote
        title="Could not list workflow runs"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  const publishRuns = runs.filter((run) => run.name === "Publish next video");
  const failures = publishRuns.filter((run) => run.conclusion === "failure").length;

  return (
    <div className="flex flex-col gap-4">
      <Grid min="200px">
        <StatTile label="Runs recorded" value={runs.length} hint="most recent 30" />
        <StatTile
          label="Publish attempts"
          value={publishRuns.length}
          hint={failures ? `${failures} failed` : "none failed"}
          status={
            failures > 0 ? <StatusPill role="critical" label="Failures" /> : <StatusPill role="good" label="Clean" />
          }
        />
        <StatTile
          label="Workflows"
          value={workflows.length}
          hint={workflows.every((w) => w.state === "active") ? "all active" : "one or more disabled"}
          status={
            workflows.every((w) => w.state === "active") ? (
              <StatusPill role="good" label="Active" />
            ) : (
              <StatusPill role="warning" label="Disabled" />
            )
          }
        />
      </Grid>

      {workflows.some((w) => w.state !== "active") ? (
        <ErrorNote
          title="A workflow is disabled"
          detail={workflows
            .filter((w) => w.state !== "active")
            .map((w) => `${w.name} (${w.state.replace(/_/g, " ")})`)
            .join(", ")}
        />
      ) : null}

      <Card title="All runs" dense>
        {runs.length === 0 ? (
          <EmptyState title="No runs yet" detail="Dispatch one from the overview." />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="px-4 py-2 text-xs font-medium tracking-wide uppercase muted">
                    Workflow
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-medium tracking-wide uppercase muted">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-medium tracking-wide uppercase muted">
                    Trigger
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-medium tracking-wide uppercase muted">
                    Started
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-medium tracking-wide uppercase muted">
                    Took
                  </th>
                  <th scope="col" className="px-4 py-2 text-xs font-medium tracking-wide uppercase muted">
                    Commit
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-b-0 hover:bg-[var(--wash)]">
                    <td className="px-4 py-2">
                      <Link href={`/runs/${run.id}`} className="font-medium" style={{ color: "var(--accent)" }}>
                        {run.name}
                      </Link>
                      <span className="ml-1.5 text-xs muted tabular">#{run.run_number}</span>
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill role={runRole(run.status, run.conclusion)} label={runLabel(run.status, run.conclusion)} />
                    </td>
                    <td className="px-4 py-2 text-xs secondary">{run.event}</td>
                    <td className="px-4 py-2 text-xs secondary whitespace-nowrap">
                      <span title={formatDateTime(run.created_at)}>{relativeTime(run.created_at)}</span>
                    </td>
                    <td className="px-4 py-2 text-xs secondary tabular whitespace-nowrap">
                      {formatDuration(run.run_started_at ?? run.created_at, run.status === "completed" ? run.updated_at : null)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs muted">{shortSha(run.head_sha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
