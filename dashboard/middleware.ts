import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Nothing is public. This dashboard can dispatch workflows and rewrite the
 * plan on main, so an unauthenticated request never reaches a route handler —
 * the gate lives here rather than in each one, where a new route could forget it.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.DASHBOARD_SECRET;

  // Refusing to serve is the only safe response to a missing signing key:
  // with no secret there is no way to tell a real session from a forged one.
  if (!secret) {
    return new NextResponse(
      "DASHBOARD_SECRET is not set on this deployment. Add it in Vercel > Settings > Environment Variables.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  const authenticated = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (authenticated) return NextResponse.next();

  // API callers get a status they can act on; humans get the login form.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/") {
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except the login page, the endpoint that issues the session,
     * Next's own assets, and the favicon.
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
