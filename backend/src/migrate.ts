/**
 * Apply every `../migrations/*.sql` file to the configured libsql database in
 * filename order. Idempotent via a tiny `_migrations` ledger table.
 *
 * Usage:
 *   bun run migrate
 */
import { createClient } from "@libsql/client";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const url = process.env.DATABASE_URL ?? "file:./db/skillforge.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../migrations");

async function main() {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const client = createClient({ url, authToken });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<string>(
    (
      await client.execute("SELECT name FROM _migrations")
    ).rows.map((r) => r["name"] as string),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`↷ skip ${file}`);
      continue;
    }
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    console.log(`→ applying ${file}`);
    try {
      await client.executeMultiple(sql);
      await client.execute({
        sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
        args: [file, new Date().toISOString()],
      });
      ran++;
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  console.log(`done. ${ran} applied, ${files.length - ran} skipped.`);
  client.close();
}

await main();
