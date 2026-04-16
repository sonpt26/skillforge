import type { Report } from "../data/reports";
import {
  findReusableReport,
  listReportsForKhaiVanSkill,
  type UserProfile,
} from "../data/user-profiles";

/**
 * Phase 3 persistence stub — stores the user's profile (identity + report history)
 * in localStorage.
 *
 * There is no auth yet, so identity is a stable anonymous id generated on first
 * touch. When real auth lands this wrapper is the single place to swap in a
 * server-backed store; callers (ChatRoom, ReviewFooter) do not know where the
 * profile lives.
 *
 * Why reports are keyed by `khaiVanSkillId` (not template id): by design, many
 * SkillTemplates can share one KhaiVanSkill. A report produced by the "brand
 * discovery" khai-van-skill is reusable for *every* template that asks for the
 * same brand context — so the Coach step can be skipped on the second purchase.
 * That reuse is driven entirely by `findReusableReport(profile, khaiVanSkillId)`.
 */
const STORAGE_KEY = "skillforge:profile";

function safeStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function generateUserId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID?.();
  if (uuid) return `anon-${uuid.slice(0, 8)}`;
  return `anon-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadProfile(): UserProfile | null {
  const s = safeStorage();
  if (!s) return null;
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UserProfile;
    if (!parsed.userId || !Array.isArray(parsed.reports)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // quota exceeded / disabled storage — silently ignore; app still works in-memory
  }
}

export function getOrCreateProfile(): UserProfile {
  const existing = loadProfile();
  if (existing) return existing;
  const fresh: UserProfile = {
    userId: generateUserId(),
    email: "",
    reports: [],
  };
  saveProfile(fresh);
  return fresh;
}

/**
 * Insert or replace a Report on the profile, keyed by (khaiVanSkillId, version).
 * Returns the updated profile.
 */
export const REPORTS_UPDATED_EVENT = "skillforge:reports-updated";

export function upsertReport(report: Report): UserProfile {
  const profile = getOrCreateProfile();
  const idx = profile.reports.findIndex(
    (r) => r.khaiVanSkillId === report.khaiVanSkillId && r.version === report.version,
  );
  const next = [...profile.reports];
  if (idx >= 0) next[idx] = report;
  else next.push(report);
  const updated: UserProfile = { ...profile, reports: next };
  saveProfile(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REPORTS_UPDATED_EVENT));
  }
  return updated;
}

export function findReusableReportLocal(khaiVanSkillId: string): Report | null {
  const profile = loadProfile();
  if (!profile) return null;
  return findReusableReport(profile, khaiVanSkillId);
}

export function listReportsLocal(khaiVanSkillId: string): Report[] {
  const profile = loadProfile();
  if (!profile) return [];
  return listReportsForKhaiVanSkill(profile, khaiVanSkillId);
}

export function nextReportVersion(khaiVanSkillId: string): number {
  const profile = loadProfile();
  if (!profile) return 1;
  const existing = profile.reports.filter((r) => r.khaiVanSkillId === khaiVanSkillId);
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((r) => r.version)) + 1;
}
