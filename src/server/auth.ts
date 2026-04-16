/**
 * Auth primitives: users, short-lived email codes, long-lived session tokens.
 *
 * Flow:
 *   1. Client POSTs email → `createLoginCode` writes a 6-digit code to login_codes.
 *      In mock mode the code is returned to the client for demo; in real mode
 *      it would be emailed.
 *   2. Client POSTs (email, code) → `verifyLoginCode` marks it consumed.
 *   3. `createSession` issues a `ses_*` id written as HttpOnly cookie.
 *   4. `getSessionUser` resolves the cookie to a user on every subsequent request.
 */

export type UserRow = {
  id: string;
  email: string;
  created_at: string;
};

export type LoginCodeRow = {
  id: string;
  email: string;
  code: string;
  purpose: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type CodePurpose = "login" | "post_purchase";

const CODE_TTL_SEC = 10 * 60;
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export function generateId(prefix: string): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 12)}`;
}

export function generateCode(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, created_at FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

export async function findOrCreateUser(
  db: D1Database,
  email: string,
): Promise<UserRow> {
  const existing = await findUserByEmail(db, email);
  if (existing) return existing;
  const now = new Date().toISOString();
  const id = generateId("usr");
  const normalized = email.toLowerCase();
  await db
    .prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, normalized, now)
    .run();
  return { id, email: normalized, created_at: now };
}

export async function createLoginCode(
  db: D1Database,
  email: string,
  purpose: CodePurpose,
  opts: { fixedCode?: string } = {},
): Promise<{ codeId: string; code: string; expiresAt: string }> {
  const id = generateId("lc");
  const code = opts.fixedCode ?? generateCode();
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CODE_TTL_SEC * 1000).toISOString();
  await db
    .prepare(
      "INSERT INTO login_codes (id, email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, email.toLowerCase(), code, purpose, expiresAt, createdAt)
    .run();
  return { codeId: id, code, expiresAt };
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "consumed" };

export async function verifyAndConsumeCode(
  db: D1Database,
  email: string,
  code: string,
): Promise<VerifyCodeResult> {
  const row = await db
    .prepare(
      `SELECT id, expires_at, consumed_at FROM login_codes
       WHERE email = ? AND code = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(email.toLowerCase(), code)
    .first<{ id: string; expires_at: string; consumed_at: string | null }>();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumed_at) return { ok: false, reason: "consumed" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  await db
    .prepare("UPDATE login_codes SET consumed_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.id)
    .run();
  return { ok: true };
}

export async function createSession(
  db: D1Database,
  userId: string,
): Promise<{ sessionId: string; maxAgeSec: number }> {
  const id = generateId("ses");
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_TTL_SEC * 1000).toISOString();
  await db
    .prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, userId, createdAt, expiresAt)
    .run();
  return { sessionId: id, maxAgeSec: SESSION_TTL_SEC };
}

export async function getSessionUser(
  db: D1Database,
  sessionId: string,
): Promise<UserRow | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.created_at FROM users u
       INNER JOIN sessions s ON s.user_id = u.id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, new Date().toISOString())
    .first<UserRow>();
  return row ?? null;
}

export async function deleteSession(
  db: D1Database,
  sessionId: string,
): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}
