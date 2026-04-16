-- Applications from people who want to become an advisor on Skillforge.
-- Submitted via the public /become-an-advisor form; reviewed manually later.

CREATE TABLE advisor_applications (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  specialty  TEXT NOT NULL,
  brief      TEXT,
  status     TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'reviewing' | 'accepted' | 'rejected'
  created_at TEXT NOT NULL
);

CREATE INDEX idx_advisor_applications_email ON advisor_applications(email);
CREATE INDEX idx_advisor_applications_status ON advisor_applications(status);
