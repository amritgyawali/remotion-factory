import { NewWeekComposer } from "@/components/NewWeekComposer";
import { ErrorNote } from "@/components/ui";
import { loadWeeks } from "@/lib/factory";
import { readJsonFile } from "@/lib/github";
import type { WeeklyPlan } from "@/lib/plan-schema";

export const revalidate = 0;

export default async function NewWeekPage() {
  try {
    const [weeks, inbox] = await Promise.all([
      loadWeeks(),
      readJsonFile<WeeklyPlan>("plan.json"),
    ]);

    const highestOrder = weeks.reduce((max, week) => Math.max(max, week.plan.week?.order ?? 0), 0);

    return (
      <NewWeekComposer
        highestOrder={highestOrder}
        acceptedIds={weeks.map((week) => week.plan.week?.id ?? week.path)}
        // The current inbox is the best possible starting point: it is a plan
        // that already passed the validator, so the scaffold inherits real
        // channels, channelSettings and series rather than invented ones.
        template={inbox?.data ?? null}
      />
    );
  } catch (error) {
    return (
      <ErrorNote
        title="Could not load the current plan"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }
}
