-- Skillforge Phase 4a initial schema.
-- Auth + purchase tables. Artifact / chat-session tables land in Phase 4c.

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users(email);

-- Short-lived login codes (6-digit). One purpose per row so we can re-use the
-- table for post-purchase onboarding codes alongside normal sign-in codes.
CREATE TABLE login_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  purpose     TEXT NOT NULL,  -- 'login' | 'post_purchase'
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_login_codes_email_purpose ON login_codes(email, purpose);

-- Long-lived session tokens set as HttpOnly cookie after a verified code.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Purchases grant access scoped to a specific template, a specific expert,
-- or everything (lifetime). Access checks OR across a user's paid rows.
--
--   tier          scope_type   scope_id
--   one_time      template     <templateId>
--   advisor_6mo   expert       <expertId>
--   lifetime      all          NULL
--
-- `email` is captured on pending rows so a webhook or manual confirmation can
-- attach the purchase to the right user even if the account doesn't exist yet.
CREATE TABLE purchases (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  email        TEXT NOT NULL,
  tier         TEXT NOT NULL,
  scope_type   TEXT NOT NULL,
  scope_id     TEXT,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  status       TEXT NOT NULL DEFAULT 'pending',
  payment_ref  TEXT,
  created_at   TEXT NOT NULL,
  paid_at      TEXT,
  expires_at   TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_purchases_user ON purchases(user_id);
CREATE INDEX idx_purchases_email ON purchases(email);
