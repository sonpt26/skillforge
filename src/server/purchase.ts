/**
 * Purchases + access checking.
 *
 * Access rule (OR across the user's paid rows):
 *   - Any `scope_type='all'` paid row                                 → always allowed
 *   - `scope_type='expert'`, scope_id = template.expertId, not expired → allowed
 *   - `scope_type='template'`, scope_id = templateId                   → allowed
 *
 * Expiry is set at purchase-creation time (see tiers.durationDays); lifetime
 * and one-time rows have expires_at = NULL.
 */
import { getTemplate } from "../data/skill-templates";
import { findOrCreateUser, generateId } from "./auth";
import { resolvePriceForExpert } from "./pricing-db";
import { TIERS, type Tier, type TierId } from "./tiers";

export type PurchaseRow = {
  id: string;
  user_id: string | null;
  email: string;
  tier: TierId;
  scope_type: "template" | "expert" | "all";
  scope_id: string | null;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "refunded";
  payment_ref: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
};

export type PurchaseScope = {
  scopeType: "template" | "expert" | "all";
  scopeId: string | null;
};

export function resolveScope(tier: TierId, skillId: string): PurchaseScope | null {
  const template = getTemplate(skillId);
  if (!template) return null;
  const def = TIERS[tier];
  if (!def) return null;
  if (def.scopeType === "template") return { scopeType: "template", scopeId: skillId };
  if (def.scopeType === "expert") {
    return { scopeType: "expert", scopeId: template.expertId };
  }
  return { scopeType: "all", scopeId: null };
}

export type CreatePurchaseResult = {
  purchase: PurchaseRow;
  tier: Tier;
};

export async function createPendingPurchase(
  db: D1Database,
  email: string,
  tier: TierId,
  skillId: string,
): Promise<CreatePurchaseResult | null> {
  const template = getTemplate(skillId);
  if (!template) return null;
  const scope = resolveScope(tier, skillId);
  const def = TIERS[tier];
  if (!scope || !def) return null;

  // Per-advisor override applies to one_time + advisor_6mo only. Lifetime
  // (scope='all') crosses all advisors, so no single expert's price applies.
  let priceCents = def.priceCents;
  let currency: string = def.currency;
  if (scope.scopeType !== "all") {
    const resolved = await resolvePriceForExpert(db, template.expertId, tier);
    priceCents = resolved.priceCents;
    currency = resolved.currency;
  }

  const id = generateId("pur");
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = def.durationDays
    ? new Date(now + def.durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await db
    .prepare(
      `INSERT INTO purchases
       (id, email, tier, scope_type, scope_id, amount_cents, currency, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      id,
      email.toLowerCase(),
      tier,
      scope.scopeType,
      scope.scopeId,
      priceCents,
      currency,
      createdAt,
      expiresAt,
    )
    .run();

  const purchase: PurchaseRow = {
    id,
    user_id: null,
    email: email.toLowerCase(),
    tier,
    scope_type: scope.scopeType,
    scope_id: scope.scopeId,
    amount_cents: priceCents,
    currency,
    status: "pending",
    payment_ref: null,
    created_at: createdAt,
    paid_at: null,
    expires_at: expiresAt,
  };
  return { purchase, tier: { ...def, priceCents, currency: currency as "USD" } };
}

/**
 * Mark a pending purchase as paid. Idempotent: calling on an already-paid row
 * is a no-op that returns the current state. Creates a user row if the email
 * hasn't been registered yet, and stamps the user_id onto the purchase.
 */
export async function confirmPurchase(
  db: D1Database,
  purchaseId: string,
  paymentRef: string,
): Promise<PurchaseRow | null> {
  const row = await db
    .prepare("SELECT * FROM purchases WHERE id = ?")
    .bind(purchaseId)
    .first<PurchaseRow>();
  if (!row) return null;
  if (row.status === "paid") return row;
  if (row.status !== "pending") return row;

  const user = await findOrCreateUser(db, row.email);
  const paidAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE purchases SET status = 'paid', paid_at = ?, user_id = ?, payment_ref = ? WHERE id = ?`,
    )
    .bind(paidAt, user.id, paymentRef, purchaseId)
    .run();

  return {
    ...row,
    status: "paid",
    paid_at: paidAt,
    user_id: user.id,
    payment_ref: paymentRef,
  };
}

export async function hasAccessToSkill(
  db: D1Database,
  userId: string,
  skillId: string,
): Promise<boolean> {
  const template = getTemplate(skillId);
  if (!template) return false;
  const now = new Date().toISOString();

  const lifetime = await db
    .prepare(
      `SELECT id FROM purchases
       WHERE user_id = ? AND status = 'paid' AND scope_type = 'all' LIMIT 1`,
    )
    .bind(userId)
    .first();
  if (lifetime) return true;

  const advisor = await db
    .prepare(
      `SELECT id FROM purchases
       WHERE user_id = ? AND status = 'paid'
         AND scope_type = 'expert' AND scope_id = ?
         AND (expires_at IS NULL OR expires_at > ?)
       LIMIT 1`,
    )
    .bind(userId, template.expertId, now)
    .first();
  if (advisor) return true;

  const single = await db
    .prepare(
      `SELECT id FROM purchases
       WHERE user_id = ? AND status = 'paid'
         AND scope_type = 'template' AND scope_id = ?
       LIMIT 1`,
    )
    .bind(userId, skillId)
    .first();
  return !!single;
}

/**
 * Used by the entry-modal flow to decide "does this returning user already own
 * access to this skill?" before deciding whether to show the verify-code panel
 * or the 3-tier picker.
 */
export async function hasAccessByEmail(
  db: D1Database,
  email: string,
  skillId: string,
): Promise<boolean> {
  const user = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ id: string }>();
  if (!user) return false;
  return hasAccessToSkill(db, user.id, skillId);
}
