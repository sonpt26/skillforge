export const SESSION_COOKIE = "sf_session";

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export type CookieOptions = { secure?: boolean };

export function sessionCookie(
  sessionId: string,
  maxAgeSec: number,
  opts: CookieOptions = { secure: true },
): string {
  const secure = opts.secure === false ? "" : "; Secure";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie(opts: CookieOptions = { secure: true }): string {
  const secure = opts.secure === false ? "" : "; Secure";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

/** True when the request is plain http (dev over localhost). */
export function isInsecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "http:";
  } catch {
    return false;
  }
}
