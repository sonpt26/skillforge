import { generateId } from "./auth";

export type ChatSessionMode = "llm" | "mcp";

export type ChatSessionRow = {
  id: string;
  user_id: string;
  skill_id: string;
  status: string;
  transcript: string;
  profile: string;
  mode: string;
  mcp_conversation_id: string | null;
  total_tokens_in: number;
  total_tokens_out: number;
  turn_count: number;
  created_at: string;
  updated_at: string;
};

export async function getActiveSession(
  db: D1Database,
  userId: string,
  skillId: string,
): Promise<ChatSessionRow | null> {
  const row = await db
    .prepare(
      `SELECT * FROM chat_sessions
       WHERE user_id = ? AND skill_id = ? AND status = 'active'
       LIMIT 1`,
    )
    .bind(userId, skillId)
    .first<ChatSessionRow>();
  return row ?? null;
}

/**
 * Create a new active session. Mode is pinned at creation time so provider
 * dispatch for every subsequent turn in this session stays consistent.
 */
export async function createActiveSession(
  db: D1Database,
  userId: string,
  skillId: string,
  mode: ChatSessionMode,
): Promise<ChatSessionRow> {
  const id = generateId("cs");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO chat_sessions
         (id, user_id, skill_id, status, transcript, profile, mode, mcp_conversation_id, created_at, updated_at)
       VALUES (?, ?, ?, 'active', '[]', '{}', ?, NULL, ?, ?)`,
    )
    .bind(id, userId, skillId, mode, now, now)
    .run();
  return {
    id,
    user_id: userId,
    skill_id: skillId,
    status: "active",
    transcript: "[]",
    profile: "{}",
    mode,
    mcp_conversation_id: null,
    total_tokens_in: 0,
    total_tokens_out: 0,
    turn_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Returns the active session for (user, skill) or creates one pinned to `mode`.
 * If an active session already exists, its mode wins — the caller should end
 * it first if they want to switch.
 */
export async function ensureActiveSession(
  db: D1Database,
  userId: string,
  skillId: string,
  mode: ChatSessionMode,
): Promise<ChatSessionRow> {
  const existing = await getActiveSession(db, userId, skillId);
  if (existing) return existing;
  return createActiveSession(db, userId, skillId, mode);
}

export async function saveTranscript(
  db: D1Database,
  sessionId: string,
  transcript: unknown,
  profile: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      `UPDATE chat_sessions
       SET transcript = ?, profile = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      JSON.stringify(transcript),
      JSON.stringify(profile),
      new Date().toISOString(),
      sessionId,
    )
    .run();
}

export async function setMcpConversationId(
  db: D1Database,
  sessionId: string,
  conversationId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE chat_sessions
       SET mcp_conversation_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(conversationId, new Date().toISOString(), sessionId)
    .run();
}

export async function recordTurnStats(
  db: D1Database,
  sessionId: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE chat_sessions
       SET turn_count = turn_count + 1,
           total_tokens_in = total_tokens_in + ?,
           total_tokens_out = total_tokens_out + ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(tokensIn, tokensOut, new Date().toISOString(), sessionId)
    .run();
}

/** Active rows joined with user email. Grouped by advisor in the handler. */
export type ActiveSessionView = {
  id: string;
  skill_id: string;
  mode: string;
  mcp_conversation_id: string | null;
  total_tokens_in: number;
  total_tokens_out: number;
  turn_count: number;
  created_at: string;
  updated_at: string;
  user_email: string;
};

export async function listActiveSessionsWithUser(
  db: D1Database,
): Promise<ActiveSessionView[]> {
  const { results } = await db
    .prepare(
      `SELECT cs.id, cs.skill_id, cs.mode, cs.mcp_conversation_id,
              cs.total_tokens_in, cs.total_tokens_out, cs.turn_count,
              cs.created_at, cs.updated_at,
              u.email AS user_email
       FROM chat_sessions cs
       INNER JOIN users u ON u.id = cs.user_id
       WHERE cs.status = 'active'
       ORDER BY cs.updated_at DESC`,
    )
    .all<ActiveSessionView>();
  return results ?? [];
}

export async function archiveActiveSession(
  db: D1Database,
  userId: string,
  skillId: string,
): Promise<ChatSessionRow | null> {
  const existing = await getActiveSession(db, userId, skillId);
  if (!existing) return null;
  await db
    .prepare(
      `UPDATE chat_sessions SET status = 'archived', updated_at = ? WHERE id = ?`,
    )
    .bind(new Date().toISOString(), existing.id)
    .run();
  return existing;
}
