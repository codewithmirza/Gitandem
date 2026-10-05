import { DurableObject } from "cloudflare:workers";

const hash = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** One directory instance per GitHub identity; it stores revocable session hashes, never cookie values. */
export class UserDirectory extends DurableObject<Env> {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS sessions (session_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, revoked_at INTEGER)");
    });
  }

  async createSession(sessionId: string, expiresAt: number) {
    await this.ready;
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL", now);
    this.ctx.storage.sql.exec("INSERT INTO sessions (session_hash, expires_at, revoked_at) VALUES (?, ?, NULL)", await hash(sessionId), expiresAt);
  }

  async hasSession(sessionId: string, now = Date.now()): Promise<boolean> {
    await this.ready;
    const row = this.ctx.storage.sql.exec<{ session_hash: string }>("SELECT session_hash FROM sessions WHERE session_hash = ? AND expires_at > ? AND revoked_at IS NULL", await hash(sessionId), now).toArray()[0];
    return Boolean(row);
  }

  async revokeSession(sessionId: string) {
    await this.ready;
    this.ctx.storage.sql.exec("UPDATE sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL", Date.now(), await hash(sessionId));
  }
}
