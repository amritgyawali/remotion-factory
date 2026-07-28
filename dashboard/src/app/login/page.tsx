import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  const secret = process.env.DASHBOARD_SECRET;
  if (secret) {
    const store = await cookies();
    if (await verifySession(store.get(SESSION_COOKIE)?.value, secret)) redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Video factory</h1>
        <p className="text-sm secondary">
          This console dispatches workflows and rewrites the plan on the publishing branch. Sign in
          to continue.
        </p>
      </div>

      <form action="/api/auth" method="post" className="surface flex flex-col gap-3 p-4">
        <input type="hidden" name="action" value="login" />
        {/* Preserved so a deep link survives the round trip through the form. */}
        <input type="hidden" name="next" value={next ?? "/"} />

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide uppercase muted">Password</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            className="field"
          />
        </label>

        {error ? (
          <p
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--color-status-critical)" }}
            role="alert"
          >
            <span aria-hidden="true">✕</span>
            {error === "rate" ? "Too many attempts. Wait a minute and try again." : "Wrong password."}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary justify-center">
          Sign in
        </button>
      </form>
    </div>
  );
}
