import type { UserRow } from "./auth";

/**
 * Admin gating is email-allowlist only for now. Emails are listed in the
 * `ADMIN_EMAILS` env var (comma-separated), set in wrangler.jsonc or as a
 * secret. Any signed-in user whose email is in the list gets admin access.
 *
 * Not a production-grade authorization model (no roles, no audit trail), but
 * it's the minimum viable gate for a demo admin surface.
 */
export function isAdmin(
  user: UserRow | null,
  adminEmailsEnv: string | undefined,
): boolean {
  if (!user) return false;
  if (!adminEmailsEnv) return false;
  const allow = adminEmailsEnv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(user.email.toLowerCase());
}
