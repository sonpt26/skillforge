/**
 * Legacy adapter — pre-refactor, "Skill" and "Advisor" were the store-facing shapes.
 *
 * After the Phase 1 refactor the canonical model lives in:
 *   - experts.ts          (Expert — the authoring persona, now keyed by id)
 *   - skill-templates.ts  (SkillTemplate — the sellable product, owns store metadata)
 *   - khai-van-skills.ts  (KhaiVanSkill — the discovery interview + report template)
 *
 * This file reconstructs the old Skill[] / Advisor types as read-only views on the new
 * model so existing callers (landing page, chat room, provider prompts, advisor hero)
 * keep working unchanged while Phase 2+ migrates them to the new API.
 */
import { experts, getExpert, type Expert, type ExpertReview, type ExpertStats } from "./experts";
import { templates } from "./skill-templates";

export type AdvisorReview = ExpertReview;
export type AdvisorStats = ExpertStats;
export type Advisor = Expert;

export type Skill = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  highlights: string[];
  advisor: Advisor;
};

function advisorFor(expertId: string): Advisor {
  const expert = getExpert(expertId);
  if (!expert) {
    throw new Error(
      `skill-templates references unknown expertId "${expertId}" — add the expert to experts.ts`,
    );
  }
  return expert;
}

export const skills: Skill[] = templates.map((t) => ({
  id: t.id,
  name: t.name,
  category: t.category,
  tagline: t.tagline,
  description: t.description,
  highlights: t.highlights,
  advisor: advisorFor(t.expertId),
}));

export { experts };
