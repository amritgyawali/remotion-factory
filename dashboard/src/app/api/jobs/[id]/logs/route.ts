import { NextResponse } from "next/server";
import { GitHubError, getJobLog } from "@/lib/github";

/**
 * Plain-text logs for one job.
 *
 * GitHub expires Actions logs well before it expires the run record, so a
 * missing log is an ordinary outcome and comes back as 404 with a reason
 * rather than as an error the UI has to guess at.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const jobId = Number(id);
  if (!Number.isSafeInteger(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  try {
    const log = await getJobLog(jobId);
    if (log === null) {
      return NextResponse.json(
        { error: "GitHub has expired the logs for this job." },
        { status: 404 },
      );
    }
    return new NextResponse(log, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, max-age=30" },
    });
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    if (status === 404 || status === 410) {
      return NextResponse.json({ error: "GitHub has expired the logs for this job." }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
