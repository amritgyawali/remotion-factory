import { NextResponse } from "next/server";
import { GitHubError, getRun, listJobs } from "@/lib/github";

/** Polled by the run page while a run is live, so steps tick over without a reload. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isSafeInteger(runId)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  try {
    const [run, jobs] = await Promise.all([getRun(runId), listJobs(runId)]);
    return NextResponse.json({ run, jobs });
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
