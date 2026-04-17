-- Live-monitoring counters kept on each chat_sessions row.
-- Incremented on every interview turn; read by the admin monitoring panel.

ALTER TABLE chat_sessions ADD COLUMN total_tokens_in  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_sessions ADD COLUMN total_tokens_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_sessions ADD COLUMN turn_count       INTEGER NOT NULL DEFAULT 0;
