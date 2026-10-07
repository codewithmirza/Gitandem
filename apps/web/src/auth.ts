const SESSION_COOKIE = "__Host-gitandem_session";
const OAUTH_COOKIE = "__Host-gitandem_oauth";
const OAUTH_TTL_MS = 10 * 60 * 1000;
const encoder = new TextEncoder();

export type SessionClaims = {
  sessionId: string;
  subject: string;
  login: string;
  expiresAt: number;
};

type OAuthClaims = {
  state: string;
  verifier: string;
  expiresAt: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("Cookie signing secret must be at least 32 characters.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign<T extends { expiresAt: number }>(claims: T, secret: string, name: string, now: number): Promise<string> {
  if (!Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= now) throw new Error("Cookie expiry must be in the future.");
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const key = await signingKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const maxAge = Math.max(1, Math.floor((claims.expiresAt - now) / 1000));
  const secure = import.meta.env?.DEV ? "" : " Secure;";
  return `${name}=${payload}.${base64UrlEncode(signature)}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}

async function verify<T extends { expiresAt: number }>(cookieHeader: string | null, secret: string, name: string, now: number): Promise<T | null> {
  const value = parseCookie(cookieHeader, name);
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const signature = base64UrlDecode(value.slice(separator + 1));
  const bytes = base64UrlDecode(payload);
  if (!signature || !bytes) return null;
  try {
    const signatureBuffer = new Uint8Array(signature).buffer as ArrayBuffer;
    const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), signatureBuffer, encoder.encode(payload));
    if (!valid) return null;
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims || typeof claims !== "object" || !Number.isSafeInteger((claims as { expiresAt?: unknown }).expiresAt)) return null;
    if ((claims as { expiresAt: number }).expiresAt <= now) return null;
    return claims as T;
  } catch {
    return null;
  }
}

/** Parse a named cookie. Duplicate names are rejected to avoid ambiguous cookie selection. */
export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  let found: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    if (found !== null) return null;
    found = part.slice(index + 1).trim();
  }
  if (found === null) return null;
  try { return decodeURIComponent(found); } catch { return null; }
}

export function clearCookie(name: string): string {
  const secure = import.meta.env?.DEV ? "" : " Secure;";
  return `${name}=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function clearSessionCookie(): string { return clearCookie(SESSION_COOKIE); }
export function clearOAuthStateCookie(): string { return clearCookie(OAUTH_COOKIE); }

export function createSessionCookie(claims: SessionClaims, secret: string, now = Date.now()): Promise<string> {
  if (!claims.sessionId || claims.sessionId.length > 100 || !claims.subject || claims.subject.length > 256 || !claims.login || claims.login.length > 100) throw new Error("Invalid session claims.");
  return sign(claims, secret, SESSION_COOKIE, now);
}

export async function readSessionCookie(cookieHeader: string | null, secret: string, now = Date.now()): Promise<SessionClaims | null> {
  const claims = await verify<SessionClaims>(cookieHeader, secret, SESSION_COOKIE, now);
  return claims && typeof claims.sessionId === "string" && !!claims.sessionId && typeof claims.subject === "string" && !!claims.subject && typeof claims.login === "string" && !!claims.login
    ? claims
    : null;
}

/** Creates a short-lived state + PKCE cookie. The callback must validate the returned state and clear this cookie. */
export async function createOAuthStateCookie(secret: string, now = Date.now()): Promise<{
  state: string;
  verifier: string;
  challenge: string;
  cookie: string;
  expiresAt: number;
}> {
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
  const expiresAt = now + OAUTH_TTL_MS;
  const cookie = await sign({ state, verifier, expiresAt }, secret, OAUTH_COOKIE, now);
  return { state, verifier, challenge, cookie, expiresAt };
}

/** Returns the verifier only for an unexpired, state-matching signed cookie. Clear the cookie after consumption. */
export async function readOAuthStateCookie(cookieHeader: string | null, expectedState: string, secret: string, now = Date.now()): Promise<{ verifier: string } | null> {
  const claims = await verify<OAuthClaims>(cookieHeader, secret, OAUTH_COOKIE, now);
  if (!claims || !expectedState || claims.state !== expectedState || typeof claims.verifier !== "string" || !claims.verifier) return null;
  return { verifier: claims.verifier };
}

/** Reject missing, malformed, or cross-origin Origin headers for browser state-changing requests. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
