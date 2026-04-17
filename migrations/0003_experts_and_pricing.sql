-- Experts managed in D1 (instead of the static TS file) so admins can edit
-- profiles, and per-advisor pricing overrides the global tier defaults.

CREATE TABLE experts (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  title              TEXT NOT NULL,
  years_experience   INTEGER NOT NULL,
  portrait_url       TEXT NOT NULL,
  hero_portrait_url  TEXT,
  bio                TEXT NOT NULL,
  approach           TEXT,
  specialties        TEXT,  -- JSON array of strings
  notable_clients    TEXT,  -- JSON array of strings
  credentials        TEXT NOT NULL,  -- JSON array of strings
  stats_users_helped INTEGER NOT NULL DEFAULT 0,
  stats_downloads    INTEGER NOT NULL DEFAULT 0,
  stats_avg_rating   REAL    NOT NULL DEFAULT 0,
  stats_review_count INTEGER NOT NULL DEFAULT 0,
  reviews            TEXT NOT NULL,  -- JSON array of {quote, name, role}
  status             TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX idx_experts_status ON experts(status);

-- Per-advisor price override for a given tier. Missing row means "use the
-- global default from src/server/tiers.ts".
CREATE TABLE expert_pricing (
  expert_id    TEXT NOT NULL,
  tier_id      TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (expert_id, tier_id),
  FOREIGN KEY (expert_id) REFERENCES experts(id) ON DELETE CASCADE
);
