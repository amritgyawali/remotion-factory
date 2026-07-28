import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { GitHubError, writeJsonFile } from "@/lib/github";
import { countIssues, validatePlan, type WeeklyPlan } from "@/lib/plan-schema";

/**
 * Commits an edited week back to the publishing branch.
 *
 * Two gates before anything is written. The plan is validated with the same
 * rules the Node validator applies, because an invalid plan does not fail
 * here — it fails hours later inside a run nobody is watching. And the write
 * carries the blob sha it was loaded with, so a week the workflow has since
 * touched is rejected rather than silently overwritten.
 */

interface Body {
  path: string;
  sha: string;
  plan: WeeklyPlan;
  message?: string;
}

export async function PUT(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (typeof body.path !== "string" || !/^plans\/[a-z0-9-]+\.json$/.test(body.path)) {
    return NextResponse.json(
      { error: 'path must look like "plans/<week-id>.json"' },
      { status: 400 },
    );
  }
  if (typeof body.sha !== "string" || !body.sha) {
    return NextResponse.json({ error: "sha is required — reload the plan and try again" }, { status: 400 });
  }
  if (!body.plan || typeof body.plan !== "object") {
    return NextResponse.json({ error: "plan is required" }, { status: 400 });
  }

  const issues = validatePlan(body.plan);
  const { errors } = countIssues(issues);
  if (errors > 0) {
    return NextResponse.json(
      { error: `Plan has ${errors} error(s) — nothing was written`, issues },
      { status: 422 },
    );
  }

  // The archive filename is part of the contract the Node loader enforces.
  const expected = `plans/${body.plan.week.id}.json`;
  if (body.path !== expected) {
    return NextResponse.json(
      { error: `week.id is "${body.plan.week.id}" but the file is "${body.path}" — they must match` },
      { status: 422 },
    );
  }

  try {
    const message =
      body.message?.trim() ||
      `chore(plan): edit ${body.plan.week.id} from the dashboard`;
    const { commit } = await writeJsonFile(body.path, body.plan, body.sha, message);

    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, commit, issues });
  } catch (error) {
    if (error instanceof GitHubError && error.status === 409) {
      return NextResponse.json(
        { error: "This week changed on the branch since you loaded it. Reload and reapply your edit." },
        { status: 409 },
      );
    }
    const status = error instanceof GitHubError ? error.status : 500;
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: detail }, { status });
  }
}
