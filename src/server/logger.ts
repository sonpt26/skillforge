/**
 * One-line key=value logger used by both the Cloudflare Worker and the Bun
 * backend. Writes to stdout via `console.log`, which both runtimes surface:
 *   - Bun:  appears in the terminal / docker logs / systemd journal
 *   - CF:   appears in `wrangler tail`
 *
 * Output is deliberately grep-friendly. Example:
 *
 *   23:40:12.345 · interview.turn user=alice@acme skill=sales-ops mode=mcp \
 *                 provider=mcp(deepseek) tokens=231/84 ms=812
 */
export type LogField = string | number | boolean | null | undefined | object;

export function log(fields: Record<string, LogField> & { msg: string }): void {
  const { msg, ...rest } = fields;
  const ts = new Date().toISOString().slice(11, 23);
  const parts: string[] = [`${ts} · ${msg}`];
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || v === null) continue;
    let s: string;
    if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    // Quote when value contains whitespace so the key=value form stays scannable.
    if (/\s/.test(s)) s = `"${s.replace(/"/g, '\\"')}"`;
    parts.push(`${k}=${s}`);
  }
  console.log(parts.join(" "));
}

export function logError(msg: string, err: unknown, extras: Record<string, LogField> = {}): void {
  const err_ = err instanceof Error ? err : new Error(String(err));
  log({
    msg: `ERROR ${msg}`,
    err: err_.message,
    ...extras,
  });
}
