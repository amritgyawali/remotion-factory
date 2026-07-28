import { StatusPill } from "@/components/Status";
import { Card, EmptyState, ErrorNote, Grid, StatTile } from "@/components/ui";
import { loadWeeks } from "@/lib/factory";
import { checkPostiz, listPosts } from "@/lib/postiz";
import { formatDateTime, relativeTime } from "@/lib/format";

export const revalidate = 0;

export default async function ChannelsPage() {
  const [health, weeks, recent] = await Promise.all([
    checkPostiz(),
    loadWeeks().catch(() => []),
    listPosts().catch(() => ({ posts: [], note: "Could not list posts." })),
  ]);

  if (!health.ok) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorNote
          title={health.configured ? "Postiz is not answering" : "Postiz is not configured"}
          detail={health.reason}
        />
        <Card title="What the workflow will do">
          <p className="text-sm secondary">
            The publish workflow runs this same check before it installs anything. While Postiz is
            unreachable every run will stop in the preflight step, in about fifteen seconds, without
            spending a runner on a render.
          </p>
        </Card>
      </div>
    );
  }

  // Which channels the plan actually targets, so a connected-but-unused
  // account is visibly different from one the plan depends on.
  const planned = new Set(weeks.flatMap((week) => week.plan.channels ?? []));
  const live = health.integrations.filter((integration) => !integration.disabled);
  const missing = [...planned].filter(
    (ref) => !live.some((integration) => integration.id === ref || integration.identifier === ref),
  );

  return (
    <div className="flex flex-col gap-4">
      <Grid min="200px">
        <StatTile
          label="Connected"
          value={health.integrations.length}
          hint={`${live.length} enabled`}
          status={<StatusPill role="good" label="Reachable" />}
        />
        <StatTile label="Targeted by the plan" value={planned.size} hint="channel ids in accepted weeks" />
        <StatTile
          label="Unresolved"
          value={missing.length}
          hint={missing.length ? "the plan names channels Postiz does not have" : "every planned channel resolves"}
          status={
            missing.length > 0 ? (
              <StatusPill role="critical" label="Blocked" />
            ) : (
              <StatusPill role="good" label="Clean" />
            )
          }
        />
        <StatTile label="API host" value={health.host} hint="from POSTIZ_API_URL" />
      </Grid>

      {missing.length > 0 ? (
        <ErrorNote
          title="The plan targets channels that are not connected or are disabled"
          detail={`Every publish will fail in the preflight until these resolve: ${missing.join(", ")}`}
        />
      ) : null}

      <Card title="Channels" dense>
        <ul>
          {health.integrations.map((integration) => {
            const targeted = planned.has(integration.id) || planned.has(integration.identifier);
            return (
              <li
                key={integration.id}
                className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{integration.name}</span>
                  <span className="text-xs muted">
                    {integration.identifier} · <code className="text-[10px]">{integration.id}</code>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {targeted ? <StatusPill role="good" label="In plan" /> : <StatusPill role="neutral" label="Unused" />}
                  {integration.disabled ? <StatusPill role="warning" label="Disabled" /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Recent posts in Postiz" dense>
        {recent.note ? (
          <p className="px-4 py-3 text-xs muted">{recent.note}</p>
        ) : recent.posts.length === 0 ? (
          <EmptyState
            title="No posts in the current window"
            detail="Drafts created by the workflow appear here once Postiz accepts them."
          />
        ) : (
          <ul>
            {recent.posts.slice(0, 25).map((post) => (
              <li
                key={post.id}
                className="flex items-start justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm">{post.content?.replace(/<[^>]*>/g, "") || "—"}</span>
                  <span className="text-xs muted">
                    {post.integration?.name ?? "—"} · {formatDateTime(post.publishDate)} (
                    {relativeTime(post.publishDate)})
                  </span>
                </span>
                <StatusPill
                  role={post.state === "PUBLISHED" ? "good" : post.state === "ERROR" ? "critical" : "neutral"}
                  label={post.state ?? "—"}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
