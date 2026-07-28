import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { GitHubError, readJsonFile, writeJsonFile } from "@/lib/github";
import { countIssues, validatePlan, type WeeklyPlan } from "@/lib/plan-schema";
import { loadWeeks } from "@/lib/factory";

/**
 * Submit a new week by writing plan.json.
 *
 * This deliberately writes the inbox, not the archive. Pushing plan.json is
 * what triggers the Accept weekly plan workflow, and that workflow owns the
 * rules this dashboard does not reimplement — cross-week uniqueness of ids,
 * source ids and captions, and the freeze on a week that has already started.
 * Writing plans/ directly would route around all of it.
 */
export async function PUT(request: NextRequest) {
  let body: { plan?: WeeklyPlan; message?: string };
  try {
    body = (await request.json()) as { plan?: WeeklyPlan; message?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || typeof plan !== "object") {
    return NextResponse.json({ error: "plan is required" }, { status: 400 });
  }

  const issues = validatePlan(plan);
  const { errors } = countIssues(issues);
  if (errors > 0) {
    return NextResponse.json(
      { error: `Plan has ${errors} error(s) — nothing was written`, issues },
      { status: 422 },
    );
  }

  try {
    const accepted = await loadWeeks();

    // A week that already exists must go through the editor, where the freeze
    // rules are visible, rather than being silently replaced from here.
    if (accepted.some((week) => week.plan.week?.id === plan.week.id)) {
      return NextResponse.json(
        {
          error: `Week "${plan.week.id}" is already accepted. Edit it on the Plan page instead — content freezes once its first video posts.`,
        },
        { status: 409 },
      );
    }

    const highest = accepted.reduce((max, week) => Math.max(max, week.plan.week?.order ?? 0), 0);
    if (plan.week.order <= highest) {
      return NextResponse.json(
        {
          error: `week.order must be greater than every accepted week. The highest is ${highest}, so use at least ${highest + 1}.`,
        },
        { status: 422 },
      );
    }

    const existing = await readJsonFile<WeeklyPlan>("plan.json");
    if (!existing) {
      return NextResponse.json({ error: "plan.json is missing on the branch" }, { status: 409 });
    }

    const { commit } = await writeJsonFile(
      "plan.json",
      plan,
      existing.sha,
      body.message?.trim() || `feat(plan): submit ${plan.week.id}`,
    );

    revalidatePath("/", "layout");
    return NextResponse.json({
      ok: true,
      commit,
      issues,
      note: "Accept weekly plan runs on the push and will archive this into plans/.",
    });
  } catch (error) {
    if (error instanceof GitHubError && error.status === 409) {
      return NextResponse.json(
        { error: "plan.json changed on the branch since you loaded it. Reload and try again." },
        { status: 409 },
      );
    }
    const status = error instanceof GitHubError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
