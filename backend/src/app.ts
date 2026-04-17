/**
 * Standalone Bun + Hono entry point.
 *
 * Reuses the Cloudflare worker's default fetch handler — same handler, same
 * routes, same business logic — but with:
 *   - a libsql-backed D1 shim for `env.DB`
 *   - env vars loaded from process.env (.env file or systemd EnvironmentFile)
 *   - Bun serving the Astro static build from STATIC_DIR alongside /api/*
 *     (optional — omit if nginx or a CDN serves the frontend)
 *
 * When the Gemma 4 MCP server goes live, set MCP_SERVER_URL in .env and the
 * same code cuts over. No code changes required.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import worker from "../../src/worker";
import type { Env } from "../../src/worker";
import { log } from "../../src/server/logger";
import { createDb } from "./db";

// If LOG_FILE is set, mirror every console.log/err line to that file.
// Systemd / journald / docker users can leave it unset and rely on stdout
// capture; this is mostly for quick demo inspection with `tail -f`.
const LOG_FILE = process.env.LOG_FILE;
if (LOG_FILE) {
  const abs = resolve(LOG_FILE);
  mkdirSync(dirname(abs), { recursive: true });
  const write = (tag: string, args: unknown[]) => {
    const line = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    try {
      appendFileSync(abs, `${tag}${line}\n`);
    } catch {
      /* never block the app on a log write */
    }
  };
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...args: unknown[]) => {
    origLog(...args);
    write("", args);
  };
  console.error = (...args: unknown[]) => {
    origErr(...args);
    write("ERR ", args);
  };
}

const PORT = Number(process.env.PORT ?? 3000);
const DB_URL = process.env.DATABASE_URL ?? "file:./db/skillforge.db";
const STATIC_DIR = process.env.STATIC_DIR;

const db = createDb(DB_URL, process.env.TURSO_AUTH_TOKEN);

function buildEnv(): Env {
  return {
    DB: db,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SKILLFORGE_PROVIDER: process.env.SKILLFORGE_PROVIDER,
    SKILLFORGE_MOCK_MODE: process.env.SKILLFORGE_MOCK_MODE,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    GEMMA_URL: process.env.GEMMA_URL,
    GEMMA_TOKEN: process.env.GEMMA_TOKEN,
    GEMMA_MODEL: process.env.GEMMA_MODEL,
  };
}

const app = new Hono();

// One-line access log for /api/* hits only — skip static file noise.
app.use("/api/*", async (c, next) => {
  const t0 = Date.now();
  await next();
  log({
    msg: "http",
    m: c.req.method,
    p: new URL(c.req.url).pathname,
    s: c.res.status,
    ms: Date.now() - t0,
  });
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    runtime: "bun",
    gemma: process.env.GEMMA_URL ? "configured" : "fallback(deepseek)",
  }),
);

// Every /api/* hits the same worker handler the CF deployment uses.
app.all("/api/*", async (c) => {
  return worker.fetch(c.req.raw, buildEnv());
});

// Optional same-origin static (nginx/CDN can replace this in prod).
if (STATIC_DIR) {
  app.get("/*", serveStatic({ root: STATIC_DIR }));
}

console.log(`skillforge-backend listening on :${PORT}`);
console.log(`  db:     ${DB_URL}`);
console.log(`  static: ${STATIC_DIR || "(none — run nginx or Astro dev separately)"}`);
console.log(`  mcp:    backend-local (this process IS the MCP server)`);
console.log(`  gemma:  ${process.env.GEMMA_URL || "(not set — MCP sessions fall back to DeepSeek)"}`);
console.log(`  mock:   ${process.env.SKILLFORGE_MOCK_MODE === "true" ? "on" : "off"}`);
console.log(`  logfile:${LOG_FILE || "(stdout only)"}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
