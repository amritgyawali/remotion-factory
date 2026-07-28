import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { GitHubError, readJsonFile, writeJsonFile } from "@/lib/github";
import type { Approval, BufferEntry, QueueState } from "@/lib/factory";

/**
 * Review actions on the render buffer: approve, reject, or discard.
 *
 * All three are a read-modify-write of state.json on the publishing branch,
 * carrying the blob sha they were read with. That sha is the whole safety
 * story here — the render batch and the publisher both write this file, and
 * without it an approval could silently erase a `posted` entry the publisher
 * had just committed.
 */

type Action = "approve" | "reject" | "discard";

const COMMIT_MESSAGE: Record<Action, (id: string) => string> = {
  approve: (id) => `chore(review): approve ${id}`,
  reject: (id) => `chore(review): reject ${id}`,
  discard: (id) => `chore(review): discard ${id} for re-render`,
};

const APPROVAL_FOR: Record<Exclude<Action, "discard">, Approval> = {
  approve: "approved",
  reject: "rejected",
};

export async function POST(request: NextRequest) {
  let body: { action?: Action; id?: string };
  try {
    body = (await request.json()) as { action?: Action; id?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { action, id } = body;
  if (!action || !(action in COMMIT_MESSAGE)) {
    return NextResponse.json(
      { error: `action must be one of ${Object.keys(COMMIT_MESSAGE).join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const file = await readJsonFile<QueueState>("state.json");
    if (!file) {
      return NextResponse.json({ error: "state.json is missing on the branch" }, { status: 409 });
    }

    const rendered = file.data.rendered ?? [];
    const entry = rendered.find((candidate: BufferEntry) => candidate.id === id);
    if (!entry) {
      return NextResponse.json(
        { error: `"${id}" is no longer in the render buffer — it may have posted already.` },
        { status: 409 },
      );
    }
    if (file.data.posted.includes(id)) {
      return NextResponse.json(
        { error: `"${id}" has already been posted; reviewing it now would change nothing.` },
        { status: 409 },
      );
    }

    const next: QueueState =
      action === "discard"
        ? // The master stays in its Release. Dropping the pointer is what makes
          // the id eligible for the next batch to render again.
          { ...file.data, rendered: rendered.filter((candidate) => candidate.id !== id) }
        : {
            ...file.data,
            rendered: rendered.map((candidate) =>
              candidate.id === id
                ? {
                    ...candidate,
                    approval: APPROVAL_FOR[action],
                    reviewedAt: new Date().toISOString(),
                  }
                : candidate,
            ),
          };

    const { commit } = await writeJsonFile(
      "state.json",
      next,
      file.sha,
      COMMIT_MESSAGE[action](id),
    );

    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, commit, action, id });
  } catch (error) {
    if (error instanceof GitHubError && error.status === 409) {
      return NextResponse.json(
        {
          error:
            "state.json changed on the branch while you were reviewing. Reload and try again — " +
            "a workflow probably committed at the same moment.",
        },
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
