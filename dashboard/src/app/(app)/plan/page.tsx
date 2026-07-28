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
        detail="Nothing in plans/ on the publishing branch. Accept a 28-item week first — the dashboard edits accepted weeks, it does not create them."
      />
    );
  }

  return <PlanEditor weeks={weeks} posted={state?.data.posted ?? []} />;
}
