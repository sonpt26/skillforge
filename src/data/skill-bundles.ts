/**
 * A SkillBundle is a "combo" product: one expert groups 2+ of their SkillTemplates
 * under a single purchase. Each template inside the bundle still points at its own
 * KhaiVanSkill, so the Coach may run multiple discovery interviews (or reuse existing
 * reports where the user has already completed the matching khai-van-skill).
 *
 * Phase 1 seeds an empty list — types and helpers are in place so the admin/store flow
 * and the Coach pipeline can consume bundles in later phases without further refactor.
 */
export type SkillBundle = {
  id: string;
  expertId: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  highlights: string[];
  templateIds: string[];
};

export const bundles: SkillBundle[] = [];

export function getBundle(id: string): SkillBundle | null {
  return bundles.find((b) => b.id === id) ?? null;
}

export function getBundlesByExpert(expertId: string): SkillBundle[] {
  return bundles.filter((b) => b.expertId === expertId);
}
