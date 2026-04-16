import type { Report } from "./reports";

/**
 * A UserProfile owns a set of Reports across the khai-van-skills the user has completed.
 * When the user buys a new SkillTemplate, the pipeline first checks whether they already
 * have a confirmed Report for that template's `khaiVanSkillId` — if yes, the Coach step is
 * skipped and the existing report is fed straight to Skill Forge.
 *
 * Phase 1 defines the shape and pure helpers only — persistence arrives in a later phase.
 */
export type UserProfile = {
  userId: string;
  email: string;
  displayName?: string;
  reports: Report[];
};

/**
 * Find a confirmed Report on the user's profile that matches the given khai-van-skill.
 * If multiple exist (older versions), the latest confirmed one wins.
 */
export function findReusableReport(
  profile: UserProfile,
  khaiVanSkillId: string,
): Report | null {
  const candidates = profile.reports.filter(
    (r) => r.khaiVanSkillId === khaiVanSkillId && r.status === "confirmed",
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, cur) =>
    cur.version > latest.version ? cur : latest,
  );
}

export function listReportsForKhaiVanSkill(
  profile: UserProfile,
  khaiVanSkillId: string,
): Report[] {
  return profile.reports
    .filter((r) => r.khaiVanSkillId === khaiVanSkillId)
    .sort((a, b) => b.version - a.version);
}
