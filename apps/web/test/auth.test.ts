import { describe, expect, it } from "vitest";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createOAuthStateCookie,
  createSessionCookie,
  isSameOrigin,
  parseCookie,
  readOAuthStateCookie,
  readSessionCookie,
} from "../src/auth";

const secret = "test-only-signing-secret-with-more-than-32-characters";
const now = Date.UTC(2026, 9, 5, 12);

describe("GitHub browser auth primitives", () => {
  it("signs and verifies session claims in a secure HttpOnly cookie", async () => {
    const claims = { sessionId: "session-123", subject: "github:1234", login: "test-user", expiresAt: now + 60_000 };
    const cookie = await createSessionCookie(claims, secret, now);
    expect(cookie).toContain("__Host-gitandem_session=");
    expect(cookie).toContain("; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60");
    expect(await readSessionCookie(cookie.split(";")[0]!, secret, now)).toEqual(claims);
  });

  it("rejects altered, expired, malformed, and wrongly signed sessions", async () => {
    const cookie = await createSessionCookie({ sessionId: "session-123", subject: "github:1234", login: "test-user", expiresAt: now + 10_000 }, secret, now);
    const pair = cookie.split(";")[0]!;
    const [name, value] = pair.split("=");
    const [payload, signature] = value!.split(".");
    const changed = `${name}=${payload!.slice(0, -1)}x.${signature}`;
    expect(await readSessionCookie(pair, "a-different-signing-secret-with-more-than-32-characters", now)).toBeNull();
    expect(await readSessionCookie(changed, secret, now)).toBeNull();
    expect(await readSessionCookie(pair, secret, now + 10_000)).toBeNull();
    expect(await readSessionCookie(`${name}=not-a-token`, secret, now)).toBeNull();
  });

  it("rejects ambiguous duplicate cookies and safely parses values", () => {
    expect(parseCookie("other=a; session=hello%20world", "session")).toBe("hello world");
    expect(parseCookie("session=first; session=second", "session")).toBeNull();
    expect(parseCookie("session=%E0%A4%A", "session")).toBeNull();
  });

  it("creates a signed ten-minute OAuth state cookie and S256 PKCE challenge", async () => {
    const attempt = await createOAuthStateCookie(secret, now);
    expect(attempt.expiresAt).toBe(now + 10 * 60 * 1000);
    expect(attempt.state).not.toBe(attempt.verifier);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attempt.verifier)));
    const expectedChallenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    expect(attempt.challenge).toBe(expectedChallenge);
    const pair = attempt.cookie.split(";")[0]!;
    expect(attempt.cookie).toContain("__Host-gitandem_oauth=");
    expect(attempt.cookie).toContain("; Path=/; HttpOnly; Secure; SameSite=Lax;");
    expect(await readOAuthStateCookie(pair, attempt.state, secret, now)).toEqual({ verifier: attempt.verifier });
    expect(await readOAuthStateCookie(pair, "wrong-state", secret, now)).toBeNull();
    expect(await readOAuthStateCookie(pair, attempt.state, secret, attempt.expiresAt)).toBeNull();
  });

  it("provides cookie clearing headers for session and OAuth state", () => {
    expect(clearSessionCookie()).toMatch(/^__Host-gitandem_session=; .*HttpOnly; Secure; SameSite=Lax; Max-Age=0;/);
    expect(clearOAuthStateCookie()).toMatch(/^__Host-gitandem_oauth=; .*Max-Age=0;/);
  });

  it("never drops Secure from a __Host- prefixed cookie, which browsers would silently reject", async () => {
    const cookies = [
      await createSessionCookie({ sessionId: "s", subject: "github:1", login: "test-user", expiresAt: now + 60_000 }, secret, now),
      (await createOAuthStateCookie(secret, now)).cookie,
      clearSessionCookie(),
      clearOAuthStateCookie(),
    ];
    for (const cookie of cookies) {
      expect(cookie.split(";")[0]).toMatch(/^__Host-/);
      expect(cookie).toMatch(/; Secure;/);
      expect(cookie).not.toMatch(/Domain=/);
    }
  });

  it("requires a valid same-origin Origin header", () => {
    const same = new Request("https://gitandem.example/api/logout", { headers: { Origin: "https://gitandem.example" } });
    const cross = new Request("https://gitandem.example/api/logout", { headers: { Origin: "https://evil.example" } });
    const absent = new Request("https://gitandem.example/api/logout");
    const malformed = new Request("https://gitandem.example/api/logout", { headers: { Origin: "not-an-origin" } });
    expect(isSameOrigin(same)).toBe(true);
    expect(isSameOrigin(cross)).toBe(false);
    expect(isSameOrigin(absent)).toBe(false);
    expect(isSameOrigin(malformed)).toBe(false);
  });
});
