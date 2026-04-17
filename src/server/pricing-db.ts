/**
 * Per-advisor price overrides for the three tiers.
 *
 * Lookup rule used by purchase creation:
 *   1. If a row exists in `expert_pricing` for (expertId, tierId), use it.
 *   2. Otherwise fall back to `TIERS[tierId].priceCents` from tiers.ts.
 *
 * Lifetime tier has no expert scope (scope_type='all'), so it always uses the
 * global default — there's no per-advisor row to look up.
 */
import { TIERS, type TierId } from "./tiers";

export type ExpertPricingRow = {
  expert_id: string;
  tier_id: string;
  price_cents: number;
  currency: string;
  updated_at: string;
};

export type ResolvedPrice = {
  priceCents: number;
  currency: string;
  source: "override" | "default";
};

export async function resolvePriceForExpert(
  db: D1Database,
  expertId: string,
  tierId: TierId,
): Promise<ResolvedPrice> {
  const row = await db
    .prepare(
      `SELECT price_cents, currency FROM expert_pricing
       WHERE expert_id = ? AND tier_id = ? LIMIT 1`,
    )
    .bind(expertId, tierId)
    .first<{ price_cents: number; currency: string }>();
  if (row) {
    return {
      priceCents: row.price_cents,
      currency: row.currency,
      source: "override",
    };
  }
  const def = TIERS[tierId];
  return {
    priceCents: def.priceCents,
    currency: def.currency,
    source: "default",
  };
}

export async function listAllPricing(
  db: D1Database,
): Promise<ExpertPricingRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM expert_pricing`)
    .all<ExpertPricingRow>();
  return results ?? [];
}

export async function listPricingForExpert(
  db: D1Database,
  expertId: string,
): Promise<ExpertPricingRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM expert_pricing WHERE expert_id = ?`)
    .bind(expertId)
    .all<ExpertPricingRow>();
  return results ?? [];
}

export async function setPriceForExpert(
  db: D1Database,
  expertId: string,
  tierId: TierId,
  priceCents: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO expert_pricing (expert_id, tier_id, price_cents, currency, updated_at)
       VALUES (?, ?, ?, 'USD', ?)
       ON CONFLICT(expert_id, tier_id) DO UPDATE SET
         price_cents = excluded.price_cents,
         updated_at  = excluded.updated_at`,
    )
    .bind(expertId, tierId, priceCents, now)
    .run();
}

export async function clearPriceForExpert(
  db: D1Database,
  expertId: string,
  tierId: TierId,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM expert_pricing WHERE expert_id = ? AND tier_id = ?`,
    )
    .bind(expertId, tierId)
    .run();
}
