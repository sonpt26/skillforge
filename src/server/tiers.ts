/**
 * Three product tiers the user picks between in the entry modal.
 *
 *   one_time     — cheapest: buy THIS template once, single forge, no history.
 *                  Scope = the specific template id.
 *   advisor_6mo  — mid: access to every template by this advisor for 6 months,
 *                  with history + iteration. Scope = the expert id.
 *   lifetime     — full: everything from every advisor, forever.
 *                  Scope = 'all'.
 *
 * Prices are placeholders ($9 / $49 / $199) — easy to swap once we wire a real
 * payment processor and a pricing table behind an admin UI.
 */
export type TierId = "one_time" | "advisor_6mo" | "lifetime";
export type TierScopeType = "template" | "expert" | "all";

export type Tier = {
  id: TierId;
  name: string;
  tagline: string;
  priceCents: number;
  currency: "USD";
  scopeType: TierScopeType;
  durationDays: number | null;
  features: string[];
};

export const TIERS: Record<TierId, Tier> = {
  one_time: {
    id: "one_time",
    name: "One-shot",
    tagline: "Buy this template once. One forge, one download. No history.",
    priceCents: 900,
    currency: "USD",
    scopeType: "template",
    durationDays: null,
    features: [
      "One discovery + forge session",
      "Download the personalized skill folder",
      "Chat history is not saved — no iteration later",
    ],
  },
  advisor_6mo: {
    id: "advisor_6mo",
    name: "6-month advisor pass",
    tagline: "Unlimited work with this advisor's playbook for 6 months.",
    priceCents: 4900,
    currency: "USD",
    scopeType: "expert",
    durationDays: 180,
    features: [
      "All templates authored by this advisor",
      "Chat history saved — come back and iterate",
      "Re-forge with updated context anytime in 6 months",
    ],
  },
  lifetime: {
    id: "lifetime",
    name: "Lifetime all-access",
    tagline: "Every advisor, every template, forever.",
    priceCents: 19900,
    currency: "USD",
    scopeType: "all",
    durationDays: null,
    features: [
      "Every template from every advisor on Skillforge",
      "Chat history saved across all advisors",
      "All future templates included",
    ],
  },
};

export const TIER_IDS: TierId[] = ["one_time", "advisor_6mo", "lifetime"];

export function getTier(id: string): Tier | null {
  return (TIERS as Record<string, Tier>)[id] ?? null;
}
