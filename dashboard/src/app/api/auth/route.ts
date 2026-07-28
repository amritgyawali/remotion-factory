import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, createSession, safeEqual } from "@/lib/auth";
import { dashboardPassword, sessionSecret } from "@/lib/env";

/**
 * Issues and clears the session cookie. This is the one route the middleware
 * lets through unauthenticated, so it does its own checking.
 */

/**
 * A brute-force speed bump, per instance. Serverless means several instances
 * may exist at once, so this narrows the attempt rate rather than capping it —
 * the real defence is a long password. It costs nothing and stops the trivial
 * case of a script hammering one warm instance.
 */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now - record.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  record.count += 1;

  // Bounded so a flood of unique addresses cannot grow the map without limit.
  if (attempts.size > 1000) attempts.clear();

  return record.count > MAX_ATTEMPTS;
}

/** Only same-origin relative paths, so `next` cannot become an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = form.get("action");
  const origin = request.nextUrl.origin;

  if (action === "logout") {
    const response = NextResponse.redirect(new URL("/login", origin), { status: 303 });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  const next = safeNext(form.get("next"));
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (rateLimited(clientKey)) {
    return NextResponse.redirect(new URL("/login?error=rate", origin), { status: 303 });
  }

  const submitted = form.get("password");
  const ok =
    typeof submitted === "string" && (await safeEqual(submitted, dashboardPassword()));

  if (!ok) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "bad");
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  attempts.delete(clientKey);

  const session = await createSession(sessionSecret());
  const response = NextResponse.redirect(new URL(next, origin), { status: 303 });
  response.cookies.set(SESSION_COOKIE, session.value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: session.maxAge,
  });
  return response;
}
