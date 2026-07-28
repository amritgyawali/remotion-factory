import Link from "next/link";
import { PlanEditor } from "@/components/PlanEditor";
import { EmptyState, ErrorNote } from "@/components/ui";
import { loadState, loadWeeks } from "@/lib/factory";

export const revalidate = 0;

export default async function PlanPage() {
  let weeks;
  let state;
  try {
    [weeks, state] = await Promise.all([loadWeeks(), loadState()]);
  } catch (error) {
    return (
      <ErrorNote
        title="Could not read the accepted weeks"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (weeks.length === 0) {
    return (
      <EmptyState
        title="No accepted weeks"
        detail={
          <>
            Nothing in <code>plans/</code> on the publishing branch.{" "}
            <Link href="/plan/new" style={{ color: "var(--accent)" }}>
              Compose the first week →
            </Link>
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/plan/new" className="btn">
          + New week
        </Link>
      </div>
      <PlanEditor weeks={weeks} posted={state?.data.posted ?? []} />
    </div>
  );
}
