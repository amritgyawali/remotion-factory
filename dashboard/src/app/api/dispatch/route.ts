import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { GitHubError, cancelRun, dispatchWorkflow, rerunFailedJobs } from "@/lib/github";

/**
 * The write side of Actions: start a run, retry a failed one, or stop one.
 * Authentication is handled by the middleware — nothing reaches here signed out.
 */

const ALLOWED_WORKFLOWS = new Set(["publish-next.yml", "render.yml", "accept-week.yml"]);

type Body =
  | { action: "dispatch"; workflow: string; dryRun?: boolean; force?: boolean }
  | { action: "rerun"; runId: number }
  | { action: "cancel"; runId: number };

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "dispatch": {
        // An allowlist, not a passthrough: the workflow name arrives from the
        // browser and is interpolated into the API path.
        if (!ALLOWED_WORKFLOWS.has(body.workflow)) {
          return NextResponse.json({ error: `Unknown workflow "${body.workflow}"` }, { status: 400 });
        }
        await dispatchWorkflow(body.workflow, {
          dry_run: String(Boolean(body.dryRun)),
          force: String(Boolean(body.force)),
        });
        break;
      }
      case "rerun": {
        if (!Number.isSafeInteger(body.runId)) {
          return NextResponse.json({ error: "runId must be an integer" }, { status: 400 });
        }
        await rerunFailedJobs(body.runId);
        break;
      }
      case "cancel": {
        if (!Number.isSafeInteger(body.runId)) {
          return NextResponse.json({ error: "runId must be an integer" }, { status: 400 });
        }
        await cancelRun(body.runId);
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    revalidatePath("/", "layout");

    return NextResponse.json({
      ok: true,
      // GitHub queues a dispatch asynchronously; the run row appears a moment
      // later, so the UI is told to wait rather than to expect it immediately.
      note: body.action === "dispatch" ? "Dispatched. The run appears within a few seconds." : undefined,
    });
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: status === 404 ? 400 : status });
  }
}
