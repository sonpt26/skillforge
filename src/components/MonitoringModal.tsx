import { useEffect, useMemo, useState } from "react";

type SessionOut = {
  id: string;
  userEmail: string;
  skillId: string;
  skillName: string;
  mode: string;
  mcpConversationId: string | null;
  mcpOpen: boolean;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  startedAt: string;
  lastActivityAt: string;
  ageSec: number;
  idleSec: number;
};

type AdvisorGroup = {
  expertId: string;
  expertName: string;
  mcpEnabled: boolean;
  activeSessions: number;
  totalTokensIn: number;
  totalTokensOut: number;
  sessions: SessionOut[];
};

type MonitorPayload = {
  summary: {
    totalActiveSessions: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalMcpOpen: number;
    gemmaConfigured: boolean;
    serverTime: string;
  };
  advisors: AdvisorGroup[];
  orphans: SessionOut[];
};

const REFRESH_MS = 5000;

export default function MonitoringModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number>(Date.now());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const [authLost, setAuthLost] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/admin/monitoring", {
          credentials: "same-origin",
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setAuthLost(true);
            setError(
              `HTTP ${res.status} — your current session isn't on the admin allowlist. Sign out and back in with an admin email.`,
            );
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as MonitorPayload;
        if (!cancelled) {
          setData(d);
          setError(null);
          setAuthLost(false);
          setLastFetchAt(Date.now());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      }
    }
    void refresh();
    const i = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, []);

  // Expand all advisors that actually have sessions on first load.
  useEffect(() => {
    if (!data) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const a of data.advisors) if (a.activeSessions > 0) next.add(a.expertId);
      return next;
    });
  }, [data]);

  const [secondsSinceFetch, setSecondsSinceFetch] = useState(0);
  useEffect(() => {
    const i = setInterval(() => {
      setSecondsSinceFetch(Math.floor((Date.now() - lastFetchAt) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, [lastFetchAt]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm flex items-stretch md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-white md:border md:border-ink-200 md:shadow-2xl overflow-hidden flex flex-col max-h-full md:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200 shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-accent-600 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live monitoring
            </div>
            <h2 className="text-lg font-medium tracking-tight text-ink-900">
              Active chat sessions
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-ink-500">
              auto-refresh · {secondsSinceFetch}s ago
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-ink-500 hover:text-ink-900 text-lg"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 text-red-800 text-sm px-5 py-2 flex items-center justify-between gap-3">
            <span>{error}</span>
            {authLost && (
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/admin/";
                }}
                className="text-xs bg-red-700 text-white hover:bg-red-800 px-3 py-1 whitespace-nowrap"
              >
                Sign out & retry
              </button>
            )}
          </div>
        )}

        {!data ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
            Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-ink-200 border-b border-ink-200 shrink-0">
              <SummaryStat label="Active sessions" value={data.summary.totalActiveSessions} />
              <SummaryStat label="MCP sessions open" value={data.summary.totalMcpOpen} />
              <SummaryStat label="Tokens in" value={data.summary.totalTokensIn.toLocaleString()} />
              <SummaryStat label="Tokens out" value={data.summary.totalTokensOut.toLocaleString()} />
              <SummaryStat
                label="Model backend"
                value={data.summary.gemmaConfigured ? "Gemma" : "DeepSeek"}
                sub={data.summary.gemmaConfigured ? "" : "(fallback)"}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {data.advisors.length === 0 && data.orphans.length === 0 ? (
                <div className="border border-dashed border-ink-300 bg-ink-50/50 p-8 text-center text-sm text-ink-500">
                  No active sessions right now.
                </div>
              ) : (
                data.advisors.map((a) => {
                  const isOpen = expanded.has(a.expertId);
                  return (
                    <div
                      key={a.expertId}
                      className="border border-ink-200 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(expanded);
                          if (isOpen) next.delete(a.expertId);
                          else next.add(a.expertId);
                          setExpanded(next);
                        }}
                        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-ink-50/60 transition text-left"
                      >
                        <span
                          className={`text-ink-400 transition-transform inline-block ${isOpen ? "rotate-90" : ""}`}
                        >
                          ▸
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-900">
                              {a.expertName}
                            </span>
                            {a.mcpEnabled && (
                              <span className="text-[10px] uppercase tracking-[0.14em] text-accent-600 border border-accent-300 bg-accent-50 px-1.5">
                                MCP on
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-500 font-mono mt-0.5">
                            {a.expertId}
                          </div>
                        </div>
                        <div className="flex items-baseline gap-5 text-right shrink-0">
                          <div>
                            <div className="text-lg font-medium text-ink-900">
                              {a.activeSessions}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500">
                              sessions
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-ink-700">
                              {a.totalTokensIn.toLocaleString()} / {a.totalTokensOut.toLocaleString()}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500">
                              in / out
                            </div>
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-ink-100">
                          {a.sessions.map((s) => (
                            <SessionRow key={s.id} session={s} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {data.orphans.length > 0 && (
                <div className="border border-ink-200 bg-amber-50">
                  <div className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-amber-700 border-b border-amber-200">
                    Unknown skill id ({data.orphans.length})
                  </div>
                  {data.orphans.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xl font-medium text-ink-900">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500 mt-0.5">
        {label}
      </div>
      {sub && (
        <div className="text-[10px] text-ink-400 mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: SessionOut }) {
  const fmt = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };
  return (
    <div className="px-4 py-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-ink-100 last:border-b-0 text-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-ink-700">
            {session.userEmail}
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400">
            on {session.skillName}
          </span>
          {session.mcpOpen ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-accent-600 border border-accent-300 bg-accent-50 px-1.5">
              MCP open
            </span>
          ) : session.mode === "mcp" ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500 border border-ink-300 px-1.5">
              MCP pending
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500">
              direct LLM
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-500 mt-1">
          session <span className="font-mono">{session.id}</span>
          {session.mcpConversationId && (
            <>
              {" · "}
              <span className="text-ink-600">conv </span>
              <span className="font-mono">{session.mcpConversationId}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right text-xs text-ink-700 whitespace-nowrap">
        <div>
          <span className="font-medium">{session.turns}</span>{" "}
          <span className="text-ink-500">turns</span>
        </div>
        <div>
          <span className="font-medium">{session.tokensIn.toLocaleString()}</span>
          <span className="text-ink-400"> / </span>
          <span className="font-medium">{session.tokensOut.toLocaleString()}</span>
          <span className="text-ink-500 ml-1">tok</span>
        </div>
        <div className="text-ink-500">
          {fmt(session.ageSec)} old · idle {fmt(session.idleSec)}
        </div>
      </div>
    </div>
  );
}
