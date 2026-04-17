/**
 * D1-backed expert records. Seed from the static `data/experts.ts` file on
 * first admin touch; after that the DB is source of truth for the admin UI.
 *
 * Public pages keep importing static experts for now (Astro prerender). A later
 * phase will point them at these rows too.
 */
import type {
  Expert,
  ExpertReview,
  ExpertStats,
} from "../data/experts";

export type ExpertRow = {
  id: string;
  name: string;
  title: string;
  years_experience: number;
  portrait_url: string;
  hero_portrait_url: string | null;
  bio: string;
  approach: string | null;
  specialties: string | null;
  notable_clients: string | null;
  credentials: string;
  stats_users_helped: number;
  stats_downloads: number;
  stats_avg_rating: number;
  stats_review_count: number;
  reviews: string;
  status: string;
  mcp_enabled: number;
  created_at: string;
  updated_at: string;
};

function parseJsonArray<T>(raw: string | null): T[] | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : undefined;
  } catch {
    return undefined;
  }
}

export function rowToExpert(row: ExpertRow): Expert {
  const credentials = parseJsonArray<string>(row.credentials) ?? [];
  const specialties = parseJsonArray<string>(row.specialties);
  const notableClients = parseJsonArray<string>(row.notable_clients);
  const reviews = parseJsonArray<ExpertReview>(row.reviews) ?? [];
  const stats: ExpertStats = {
    usersHelped: row.stats_users_helped,
    downloads: row.stats_downloads,
    avgRating: row.stats_avg_rating,
    reviewCount: row.stats_review_count,
  };
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    yearsExperience: row.years_experience,
    portraitUrl: row.portrait_url,
    heroPortraitUrl: row.hero_portrait_url ?? undefined,
    bio: row.bio,
    approach: row.approach ?? undefined,
    specialties,
    notableClients,
    credentials,
    stats,
    reviews,
  };
}

export async function listExperts(db: D1Database): Promise<ExpertRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM experts ORDER BY status = 'active' DESC, name ASC`,
    )
    .all<ExpertRow>();
  return results ?? [];
}

export async function getExpertRow(
  db: D1Database,
  id: string,
): Promise<ExpertRow | null> {
  const row = await db
    .prepare(`SELECT * FROM experts WHERE id = ?`)
    .bind(id)
    .first<ExpertRow>();
  return row ?? null;
}

export async function countExperts(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM experts`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function upsertExpert(
  db: D1Database,
  expert: Expert,
  status: "active" | "disabled" = "active",
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO experts (
         id, name, title, years_experience, portrait_url, hero_portrait_url,
         bio, approach, specialties, notable_clients, credentials,
         stats_users_helped, stats_downloads, stats_avg_rating, stats_review_count,
         reviews, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         title = excluded.title,
         years_experience = excluded.years_experience,
         portrait_url = excluded.portrait_url,
         hero_portrait_url = excluded.hero_portrait_url,
         bio = excluded.bio,
         approach = excluded.approach,
         specialties = excluded.specialties,
         notable_clients = excluded.notable_clients,
         credentials = excluded.credentials,
         stats_users_helped = excluded.stats_users_helped,
         stats_downloads = excluded.stats_downloads,
         stats_avg_rating = excluded.stats_avg_rating,
         stats_review_count = excluded.stats_review_count,
         reviews = excluded.reviews,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .bind(
      expert.id,
      expert.name,
      expert.title,
      expert.yearsExperience,
      expert.portraitUrl,
      expert.heroPortraitUrl ?? null,
      expert.bio,
      expert.approach ?? null,
      expert.specialties ? JSON.stringify(expert.specialties) : null,
      expert.notableClients ? JSON.stringify(expert.notableClients) : null,
      JSON.stringify(expert.credentials),
      expert.stats.usersHelped,
      expert.stats.downloads,
      expert.stats.avgRating,
      expert.stats.reviewCount,
      JSON.stringify(expert.reviews),
      status,
      now,
      now,
    )
    .run();
}

export async function setExpertStatus(
  db: D1Database,
  id: string,
  status: "active" | "disabled",
): Promise<void> {
  await db
    .prepare(`UPDATE experts SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, new Date().toISOString(), id)
    .run();
}

export async function setExpertMcpEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
): Promise<void> {
  await db
    .prepare(`UPDATE experts SET mcp_enabled = ?, updated_at = ? WHERE id = ?`)
    .bind(enabled ? 1 : 0, new Date().toISOString(), id)
    .run();
}

export async function isExpertMcpEnabled(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT mcp_enabled FROM experts WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ mcp_enabled: number }>();
  return !!row && row.mcp_enabled === 1;
}

/**
 * Idempotent: inserts each static expert if its row doesn't already exist.
 * Does NOT overwrite existing rows (admin edits are sacred).
 */
export async function seedExpertsIfMissing(
  db: D1Database,
  staticExperts: Expert[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const e of staticExperts) {
    const existing = await getExpertRow(db, e.id);
    if (existing) {
      skipped++;
      continue;
    }
    await upsertExpert(db, e, "active");
    inserted++;
  }
  return { inserted, skipped };
}
