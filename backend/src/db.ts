/**
 * Thin shim that makes an @libsql/client connection look like a Cloudflare
 * `D1Database`. The shared server libs (`../../src/server/*-db.ts`) were
 * written against the D1 surface — prepare → bind → first/all/run — so this
 * lets us run the same code on a self-hosted SQLite / Turso without rewriting
 * any query sites.
 *
 * The D1 API is intentionally narrow (no multi-statement, no dump, one level
 * of prepare/bind). That's exactly what we need here; everything maps 1:1 to
 * libsql's `execute({ sql, args })`.
 */
import { createClient, type Client, type InValue, type Row } from "@libsql/client";

type Args = InValue[];

class LibsqlPreparedStatement {
  constructor(
    private client: Client,
    private sql: string,
    private args: Args = [],
  ) {}

  bind(...values: unknown[]): LibsqlPreparedStatement {
    return new LibsqlPreparedStatement(
      this.client,
      this.sql,
      values.map(normalizeValue),
    );
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const r = await this.client.execute({ sql: this.sql, args: this.args });
    if (r.rows.length === 0) return null;
    const obj = rowToObject(r.rows[0], r.columns);
    if (colName !== undefined) return (obj as Record<string, unknown>)[colName] as T;
    return obj as T;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: true }> {
    const r = await this.client.execute({ sql: this.sql, args: this.args });
    return {
      results: r.rows.map((row) => rowToObject(row, r.columns)) as T[],
      success: true,
    };
  }

  async run<T = unknown>(): Promise<{
    success: true;
    meta: { changes: number; last_row_id: number };
    results?: T[];
  }> {
    const r = await this.client.execute({ sql: this.sql, args: this.args });
    return {
      success: true,
      meta: {
        changes: r.rowsAffected,
        last_row_id: Number(r.lastInsertRowid ?? 0),
      },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const r = await this.client.execute({ sql: this.sql, args: this.args });
    return r.rows.map((row) => Array.from(row as unknown as ArrayLike<unknown>)) as T[];
  }
}

class LibsqlD1 {
  constructor(private client: Client) {}

  prepare(sql: string): LibsqlPreparedStatement {
    return new LibsqlPreparedStatement(this.client, sql);
  }

  async batch<T = unknown>(stmts: LibsqlPreparedStatement[]): Promise<
    Array<{ success: true; meta: { changes: number; last_row_id: number }; results?: T[] }>
  > {
    return Promise.all(stmts.map((s) => s.run<T>()));
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    const t0 = Date.now();
    await this.client.executeMultiple(sql);
    return { count: 0, duration: Date.now() - t0 };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error("dump() not implemented in libsql shim");
  }

  close(): void {
    this.client.close();
  }
}

function rowToObject(
  row: Row,
  columns: Array<string | null>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    const name = columns[i];
    if (!name) continue;
    let v: unknown = (row as unknown as Record<string, unknown>)[name];
    if (v === undefined) v = (row as unknown as ArrayLike<unknown>)[i];
    if (typeof v === "bigint") v = Number(v);
    out[name] = v;
  }
  return out;
}

function normalizeValue(v: unknown): InValue {
  if (v === undefined) return null;
  if (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "bigint" ||
    typeof v === "boolean" ||
    v instanceof Uint8Array
  ) {
    return v as InValue;
  }
  // libsql doesn't accept arbitrary objects — stringify as JSON.
  return JSON.stringify(v);
}

export type D1LikeDatabase = LibsqlD1;

export function createDb(url: string, authToken?: string): D1Database {
  const client = createClient({ url, authToken });
  return new LibsqlD1(client) as unknown as D1Database;
}
