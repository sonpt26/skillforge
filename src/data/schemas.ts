/**
 * Legacy adapter — pre-refactor, each SkillTemplate had its own inline "SkillSchema"
 * (persona + mission + slots) driving the interview.
 *
 * After the Phase 1 refactor the interview shape lives on the KhaiVanSkill (see
 * khai-van-skills.ts) and many templates can share one KhaiVanSkill. `getSchema(templateId)`
 * now resolves the template, looks up its `khaiVanSkillId`, and projects a legacy SkillSchema
 * view so existing callers (provider prompts, ChatRoom, skill-builder) keep working
 * unchanged while Phase 2+ migrates them to the KhaiVanSkill API directly.
 */
import {
  getKhaiVanSkill,
  khaiVanSkills,
  type Slot,
  type SlotOption,
} from "./khai-van-skills";
import { getTemplate, templates } from "./skill-templates";

export type { Slot, SlotOption };

export type SkillSchema = {
  skillId: string;
  persona: string;
  mission: string;
  slots: Slot[];
};

function toLegacySchema(templateId: string, khaiVanSkillId: string): SkillSchema | null {
  const kv = getKhaiVanSkill(khaiVanSkillId);
  if (!kv) return null;
  return {
    skillId: templateId,
    persona: kv.coachPersona,
    mission: kv.mission,
    slots: kv.slots,
  };
}

export const schemas: Record<string, SkillSchema> = Object.fromEntries(
  templates
    .map((t) => {
      const schema = toLegacySchema(t.id, t.khaiVanSkillId);
      return schema ? ([t.id, schema] as const) : null;
    })
    .filter((entry): entry is readonly [string, SkillSchema] => entry !== null),
);

export function getSchema(skillId: string): SkillSchema | null {
  const template = getTemplate(skillId);
  if (!template) return null;
  return toLegacySchema(template.id, template.khaiVanSkillId);
}

export { khaiVanSkills };
