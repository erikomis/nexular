/**
 * Nexular Session — HMAC-signed, stateless cookie sessions.
 *
 * No external dependencies. Uses Node.js crypto (HMAC-SHA256) to sign and
 * verify cookie payloads, making sessions tamper-proof without a database.
 *
 * Usage (in a route's loadData or server action):
 *
 *   import { getSession, setSession, destroySession } from "@nexular/core/session";
 *
 *   // Read
 *   const session = await getSession<{ userId: string }>(req.headers.cookie);
 *   console.log(session.data.userId);
 *
 *   // Write
 *   const { cookie } = await setSession({ userId: "123" });
 *   res.setHeader("Set-Cookie", cookie);
 *
 *   // Destroy
 *   const { cookie } = destroySession();
 *   res.setHeader("Set-Cookie", cookie);
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_COOKIE_NAME = "nx_session";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.NEXULAR_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXULAR_SESSION_SECRET env var is required in production for cookie sessions."
      );
    }
    // Dev-only fallback — not secure for production
    return "nexular-dev-secret-change-me";
  }
  return secret;
}

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function encode(data: unknown, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

function decode<T>(token: string, secret: string): T | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payload, secret);
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((parts) => parts.length >= 2)
      .map(([k, ...v]) => [k!.trim(), decodeURIComponent(v.join("=").trim())])
  );
}

function buildCookieHeader(
  name: string,
  value: string,
  options: SessionCookieOptions
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path ?? true) {
    parts.push(`Path=${options.path ?? "/"}`);
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }

  if (options.secure ?? process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  const sameSite = options.sameSite ?? "Lax";
  parts.push(`SameSite=${sameSite}`);

  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionCookieOptions {
  /** Cookie name (default: "nx_session") */
  name?: string;
  /** Max-Age in seconds (default: 7 days) */
  maxAge?: number;
  /** Cookie Path (default: "/") */
  path?: string;
  /** Cookie Domain */
  domain?: string;
  /** HttpOnly flag (default: true) */
  httpOnly?: boolean;
  /** Secure flag (default: true in production) */
  secure?: boolean;
  /** SameSite policy (default: "Lax") */
  sameSite?: "Strict" | "Lax" | "None";
}

export interface Session<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Session data. Empty object if no session exists. */
  data: T;
  /** True if the session was read from a valid, signed cookie. */
  exists: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads and verifies the session cookie from a `Cookie` header string.
 *
 * @example
 * const session = await getSession<{ userId: string }>(req.headers.cookie);
 * if (session.exists) console.log(session.data.userId);
 */
export function getSession<T extends Record<string, unknown> = Record<string, unknown>>(
  cookieHeader: string | undefined,
  options: Pick<SessionCookieOptions, "name"> = {}
): Session<T> {
  const name = options.name ?? DEFAULT_COOKIE_NAME;
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[name];

  if (!raw) {
    return { data: {} as T, exists: false };
  }

  const data = decode<T>(decodeURIComponent(raw), getSecret());
  if (!data) {
    return { data: {} as T, exists: false };
  }

  return { data, exists: true };
}

/**
 * Creates a new session cookie string with the given data.
 *
 * @example
 * const { cookie } = setSession({ userId: "123", role: "admin" });
 * res.setHeader("Set-Cookie", cookie);
 */
export function setSession<T extends Record<string, unknown>>(
  data: T,
  options: SessionCookieOptions = {}
): { cookie: string } {
  const name = options.name ?? DEFAULT_COOKIE_NAME;
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE_SECONDS;
  const token = encode(data, getSecret());
  const cookie = buildCookieHeader(name, token, { ...options, name, maxAge });
  return { cookie };
}

/**
 * Returns a `Set-Cookie` header value that clears the session cookie.
 *
 * @example
 * const { cookie } = destroySession();
 * res.setHeader("Set-Cookie", cookie);
 */
export function destroySession(options: Pick<SessionCookieOptions, "name" | "path" | "domain"> = {}): {
  cookie: string;
} {
  const name = options.name ?? DEFAULT_COOKIE_NAME;
  const cookie = buildCookieHeader(name, "", {
    ...options,
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  });
  return { cookie };
}

/**
 * Updates only specific fields of an existing session, preserving other data.
 *
 * @example
 * const { cookie } = await updateSession(req.headers.cookie, { lastSeen: Date.now() });
 * res.setHeader("Set-Cookie", cookie);
 */
export function updateSession<T extends Record<string, unknown>>(
  cookieHeader: string | undefined,
  updates: Partial<T>,
  options: SessionCookieOptions = {}
): { cookie: string } {
  const existing = getSession<T>(cookieHeader, options);
  const merged = { ...existing.data, ...updates } as T;
  return setSession(merged, options);
}
