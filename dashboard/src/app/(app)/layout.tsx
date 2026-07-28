import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";

/** The authenticated shell. The login page deliberately sits outside it. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight">Video factory</span>
          <span className="text-xs muted">control plane</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action="/api/auth" method="post">
            <input type="hidden" name="action" value="logout" />
            <button type="submit" className="btn" title="End this session">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <Nav />

      <main className="flex flex-1 flex-col gap-4">{children}</main>

      <footer className="pt-2 text-xs muted">
        Times in Asia/Kathmandu. Queue state is read from <code>state.json</code> on the publishing
        branch — the same file the workflow commits.
      </footer>
    </div>
  );
}
