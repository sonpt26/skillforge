/**
 * A Report is the artifact produced by the Coach Agent after running a KhaiVanSkill
 * interview with the user. It contains:
 *   - `data`    — the filled slot values (the "profile")
 *   - `markdown` — the rendered human-readable report the user previews / approves / edits
 *
 * Reports are keyed by `khaiVanSkillId` (NOT by SkillTemplate), so one report can be
 * reused across every SkillTemplate that references the same KhaiVanSkill. When Skill Forge
 * runs, it takes `(report, template)` and produces the final personalized skill.
 *
 * Phase 1 defines the shape and pure helpers only — persistence (DB / storage) arrives later.
 */
export type ReportStatus = "draft" | "confirmed";

export type Report = {
  id: string;
  userId: string;
  khaiVanSkillId: string;
  version: number;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
  markdown: string;
};

export function makeReportId(userId: string, khaiVanSkillId: string, version: number): string {
  return `${userId}:${khaiVanSkillId}:v${version}`;
}
