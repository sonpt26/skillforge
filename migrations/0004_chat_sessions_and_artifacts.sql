-- Chat persistence + artifact history, replacing the Phase 3 localStorage store.
--
-- One active chat_session per (user, skill) at a time. "Start over" archives
-- the old session and creates a fresh active row. Transcript + profile are
-- kept as JSON blobs so we can resume the UI exactly where the user left off.
--
-- Artifacts are one row per (user, skill). Each forge adds a row in
-- artifact_versions with the profile it was built from; the skill ZIP can be
-- rebuilt on demand via buildSkill(skillId, profile) — we don't store binary.

CREATE TABLE chat_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  skill_id    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  transcript  TEXT NOT NULL DEFAULT '[]',
  profile     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_sessions_user_skill_status ON chat_sessions(user_id, skill_id, status);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at);

CREATE TABLE artifacts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  skill_id        TEXT NOT NULL,
  latest_version  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE(user_id, skill_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_artifacts_user ON artifacts(user_id);

CREATE TABLE artifact_versions (
  id               TEXT PRIMARY KEY,
  artifact_id      TEXT NOT NULL,
  version          INTEGER NOT NULL,
  profile_data     TEXT NOT NULL,
  report_markdown  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE(artifact_id, version),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE INDEX idx_artifact_versions_artifact ON artifact_versions(artifact_id);
