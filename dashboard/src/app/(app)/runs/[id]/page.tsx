import Link from "next/link";
import { notFound } from "next/navigation";
import { RunDetail } from "@/components/RunDetail";
import { ErrorNote } from "@/components/ui";
import { GitHubError, getRun, listJobs } from "@/lib/github";

export const revalidate = 0;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isSafeInteger(runId)) notFound();

  try {
    const [run, jobs] = await Promise.all([getRun(runId), listJobs(runId)]);
    return (
      <div className="flex flex-col gap-4">
        <Link href="/runs" className="text-xs" style={{ color: "var(--accent)" }}>
          ← All runs
        </Link>
        <RunDetail initialRun={run} initialJobs={jobs} />
      </div>
    );
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) notFound();
    return (
      <ErrorNote
        title="Could not load this run"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }
}
