import { generateId } from "./auth";

export type ArtifactRow = {
  id: string;
  user_id: string;
  skill_id: string;
  latest_version: number;
  created_at: string;
  updated_at: string;
};

export type ArtifactVersionRow = {
  id: string;
  artifact_id: string;
  version: number;
  profile_data: string;
  report_markdown: string;
  created_at: string;
};

export async function getOrCreateArtifact(
  db: D1Database,
  userId: string,
  skillId: string,
): Promise<ArtifactRow> {
  const existing = await db
    .prepare(
      `SELECT * FROM artifacts WHERE user_id = ? AND skill_id = ? LIMIT 1`,
    )
    .bind(userId, skillId)
    .first<ArtifactRow>();
  if (existing) return existing;

  const id = generateId("art");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO artifacts
         (id, user_id, skill_id, latest_version, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .bind(id, userId, skillId, now, now)
    .run();
  return {
    id,
    user_id: userId,
    skill_id: skillId,
    latest_version: 0,
    created_at: now,
    updated_at: now,
  };
}

export type AppendVersionResult = {
  artifactId: string;
  version: number;
  versionId: string;
  createdAt: string;
};

export async function appendArtifactVersion(
  db: D1Database,
  userId: string,
  skillId: string,
  profile: Record<string, unknown>,
  reportMarkdown: string,
): Promise<AppendVersionResult> {
  const artifact = await getOrCreateArtifact(db, userId, skillId);
  const newVersion = artifact.latest_version + 1;
  const versionId = generateId("av");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO artifact_versions
         (id, artifact_id, version, profile_data, report_markdown, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      versionId,
      artifact.id,
      newVersion,
      JSON.stringify(profile),
      reportMarkdown,
      now,
    )
    .run();
  await db
    .prepare(
      `UPDATE artifacts SET latest_version = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(newVersion, now, artifact.id)
    .run();
  return {
    artifactId: artifact.id,
    version: newVersion,
    versionId,
    createdAt: now,
  };
}

export async function listArtifactsForUser(
  db: D1Database,
  userId: string,
): Promise<ArtifactRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM artifacts WHERE user_id = ? ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<ArtifactRow>();
  return results ?? [];
}

export async function listArtifactVersions(
  db: D1Database,
  artifactId: string,
): Promise<ArtifactVersionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC`,
    )
    .bind(artifactId)
    .all<ArtifactVersionRow>();
  return results ?? [];
}

export async function getArtifactForUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<ArtifactRow | null> {
  const row = await db
    .prepare(`SELECT * FROM artifacts WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId)
    .first<ArtifactRow>();
  return row ?? null;
}

export async function getArtifactVersion(
  db: D1Database,
  artifactId: string,
  version: number,
): Promise<ArtifactVersionRow | null> {
  const row = await db
    .prepare(
      `SELECT * FROM artifact_versions
       WHERE artifact_id = ? AND version = ? LIMIT 1`,
    )
    .bind(artifactId, version)
    .first<ArtifactVersionRow>();
  return row ?? null;
}
