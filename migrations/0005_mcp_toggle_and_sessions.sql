-- Per-advisor toggle for routing chat through an MCP-backed self-hosted model
-- (Gemma 4) instead of the default DeepSeek/Anthropic provider.
--
-- When `mcp_enabled = 1`, /api/interview opens an MCP conversation on the
-- first turn, resumes it on subsequent turns using `mcp_conversation_id` from
-- chat_sessions, and closes it on reset/finalize to free backend resources.

ALTER TABLE experts ADD COLUMN mcp_enabled INTEGER NOT NULL DEFAULT 0;

-- Which provider this chat session is tied to ('llm' or 'mcp'). Decided the
-- first time we dispatch for this session and pinned for its lifetime so
-- context doesn't bounce between backends mid-conversation.
ALTER TABLE chat_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'llm';

-- Opaque conversation id on the MCP server. Used to resume context on every
-- subsequent turn and passed back to the server when closing.
ALTER TABLE chat_sessions ADD COLUMN mcp_conversation_id TEXT;
