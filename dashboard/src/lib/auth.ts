/**
 * A single shared password behind an HMAC-signed cookie.
 *
 * This dashboard can dispatch workflows and rewrite the plan on main, so it is
 * not something to leave open. The cookie carries only an expiry and a
 * signature — there is no session store to keep, which suits a deployment that
 * scales to zero.
 *
 * Web Crypto only, so this runs unchanged in middleware (edge) and in route
 * handlers (node).
 */

export const SESSION_COOKIE = "factory_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Length-independent comparison, so a mismatch leaks nothing through timing. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  // Hashing first makes the comparison fixed-width, which keeps the equality
  // check constant-time even when the two inputs differ in length.
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSession(secret: string): Promise<{ value: string; maxAge: number }> {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return { value: `${payload}.${toBase64Url(signature)}`, maxAge: SESSION_TTL_SECONDS };
}

export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(signature);
  } catch {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    bytes as unknown as BufferSource,
    encoder.encode(payload),
  );
}
