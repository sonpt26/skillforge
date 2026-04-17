/**
 * Static "skill set" passed to an MCP session on open. Gemma 4 (or whatever
 * model the MCP server fronts) uses this as its working knowledge — the
 * catalogue of playbooks the advisor ships, the discovery questions they run,
 * and their voice.
 *
 * Output of the session = a personalized variant of these skills for the
 * specific buyer. The MCP server is expected to take this on open and return
 * artifacts in a matching shape.
 */
import { experts } from "../data/experts";
import { getKhaiVanSkill } from "../data/khai-van-skills";
import { getTemplatesByExpert } from "../data/skill-templates";

export type AdvisorSkillSet = {
  advisor: {
    id: string;
    name: string;
    title: string;
    bio: string;
    approach?: string;
    specialties?: string[];
  };
  skills: Array<{
    templateId: string;
    name: string;
    category: string;
    tagline: string;
    description: string;
    skillBodyTemplate: string;
    discovery: {
      khaiVanSkillId: string;
      name: string;
      coachPersona: string;
      mission: string;
      reportTemplate: string;
      slots: Array<{
        key: string;
        title: string;
        description: string;
        kind: "text" | "choice" | "multi";
        required?: boolean;
        options?: Array<{ id: string; label: string; hint?: string }>;
      }>;
    };
  }>;
};

export function loadAdvisorSkillSet(expertId: string): AdvisorSkillSet | null {
  const advisor = experts.find((e) => e.id === expertId);
  if (!advisor) return null;
  const templates = getTemplatesByExpert(expertId);
  const skills = templates
    .map((t) => {
      const kv = getKhaiVanSkill(t.khaiVanSkillId);
      if (!kv) return null;
      return {
        templateId: t.id,
        name: t.name,
        category: t.category,
        tagline: t.tagline,
        description: t.description,
        skillBodyTemplate: t.skillBody,
        discovery: {
          khaiVanSkillId: kv.id,
          name: kv.name,
          coachPersona: kv.coachPersona,
          mission: kv.mission,
          reportTemplate: kv.reportTemplate,
          slots: kv.slots.map((s) => ({
            key: s.key,
            title: s.title,
            description: s.description,
            kind: s.kind,
            required: s.required,
            options: s.options,
          })),
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    advisor: {
      id: advisor.id,
      name: advisor.name,
      title: advisor.title,
      bio: advisor.bio,
      approach: advisor.approach,
      specialties: advisor.specialties,
    },
    skills,
  };
}
