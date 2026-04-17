import { useEffect, useState } from "react";
import ExpertEditModal from "./ExpertEditModal";
import MonitoringModal from "./MonitoringModal";

type Expert = {
  id: string;
  name: string;
  title: string;
  status: string;
  portraitUrl: string;
  mcpEnabled: boolean;
  updatedAt: string;
};

type TierDefault = {
  tierId: string;
  priceCents: number;
  currency: string;
  scopeType: "template" | "expert" | "all";
};

type Override = {
  expertId: string;
  tierId: string;
  priceCents: number;
  currency: string;
  updatedAt: string;
};

type AuthState =
  | { kind: "checking" }
  | { kind: "anonymous" }
  | { kind: "user"; email: string }
  | { kind: "admin"; email: string };

const TIER_COLUMNS: { id: "one_time" | "advisor_6mo" | "lifetime"; label: string }[] = [
  { id: "one_time", label: "One-shot" },
  { id: "advisor_6mo", label: "6-month pass" },
  { id: "lifetime", label: "Lifetime" },
];

export default function AdminPanel() {
  const [auth, setAuth] = useState<AuthState>({ kind: "checking" });
  const [experts, setExperts] = useState<Expert[]>([]);
  const [defaults, setDefaults] = useState<Record<string, TierDefault>>({});
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [editingExpertId, setEditingExpertId] = useState<string | null>(null);
  const [monitoringOpen, setMonitoringOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    try {
      const me = await fetch("/api/admin/me").then((r) => r.json()) as {
        user: { email: string } | null;
        isAdmin: boolean;
      };
      if (!me.user) {
        setAuth({ kind: "anonymous" });
        setLoading(false);
        return;
      }
      if (!me.isAdmin) {
        setAuth({ kind: "user", email: me.user.email });
        setLoading(false);
        return;
      }
      setAuth({ kind: "admin", email: me.user.email });
      await refreshData();
    } catch {
      setAuth({ kind: "anonymous" });
    } finally {
      setLoading(false);
    }
  }

  const [mcpConfigured, setMcpConfigured] = useState(false);

  async function refreshData() {
    const [expertsRes, pricingRes] = await Promise.all([
      fetch("/api/admin/experts").then((r) => r.json()) as Promise<{
        experts: Expert[];
        mcpConfigured?: boolean;
      }>,
      fetch("/api/admin/pricing").then((r) => r.json()) as Promise<{
        overrides: Override[];
        defaults: TierDefault[];
      }>,
    ]);
    setExperts(expertsRes.experts ?? []);
    setMcpConfigured(!!expertsRes.mcpConfigured);
    const defMap: Record<string, TierDefault> = {};
    for (const d of pricingRes.defaults ?? []) defMap[d.tierId] = d;
    setDefaults(defMap);
    const ovMap = new Map<string, Override>();
    for (const o of pricingRes.overrides ?? []) {
      ovMap.set(`${o.expertId}:${o.tierId}`, o);
    }
    setOverrides(ovMap);
  }

  async function toggleMcp(expert: Expert) {
    try {
      await fetch("/api/admin/experts/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: expert.id, enabled: !expert.mcpEnabled }),
      });
      await refreshData();
    } catch {
      setBanner("Failed to toggle MCP.");
    }
  }

  async function seed() {
    setBanner(null);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" }).then((r) => r.json()) as {
        inserted?: number;
        skipped?: number;
      };
      setBanner(
        `Seed: ${res.inserted ?? 0} inserted, ${res.skipped ?? 0} skipped.`,
      );
      setSeeded(true);
      await refreshData();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Seed failed.");
    }
  }

  async function toggleStatus(expert: Expert) {
    const next = expert.status === "active" ? "disabled" : "active";
    try {
      await fetch("/api/admin/experts/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: expert.id, status: next }),
      });
      await refreshData();
    } catch {
      setBanner("Failed to update status.");
    }
  }

  async function setPrice(
    expertId: string,
    tierId: "one_time" | "advisor_6mo" | "lifetime",
    priceDollars: number,
  ) {
    const priceCents = Math.round(priceDollars * 100);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expertId, tierId, priceCents }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await refreshData();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function clearPrice(expertId: string, tierId: string) {
    try {
      await fetch("/api/admin/pricing/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expertId, tierId }),
      });
      await refreshData();
    } catch {
      setBanner("Reset failed.");
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth({ kind: "checking" });
    await bootstrap();
  }

  if (auth.kind === "checking" || (auth.kind === "admin" && loading)) {
    return <Centered>Checking admin access…</Centered>;
  }

  if (auth.kind === "anonymous") {
    return (
      <AdminLoginCard
        heading="Sign in to continue"
        intro="Only emails on the admin allowlist can use this page."
        onSignedIn={bootstrap}
      />
    );
  }

  if (auth.kind === "user") {
    return (
      <AdminLoginCard
        heading="Not an admin"
        intro={
          <>
            You're signed in as{" "}
            <span className="font-mono">{auth.email}</span>. This email is not
            on the admin allowlist. Sign in with a different email, or go back
            to the site.
          </>
        }
        presetEmail=""
        trailing={
          <div className="mt-4 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={signOut}
              className="underline text-ink-700 hover:text-ink-900"
            >
              Sign out
            </button>
            <a href="/" className="underline text-ink-700 hover:text-ink-900">
              Back to home
            </a>
          </div>
        }
        onSignedIn={bootstrap}
      />
    );
  }

  const noExperts = experts.length === 0;

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-accent-600 mb-1">
            Admin
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-ink-900">
            Skillforge control panel
          </h1>
          <p className="text-xs text-ink-500 mt-1">
            Signed in as <span className="font-mono">{auth.email}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonitoringOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-ink-50 bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5"
            title="Live view of active chat sessions, tokens, MCP status"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            Live monitoring
          </button>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/";
            }}
            className="text-xs text-ink-600 hover:text-ink-900 border border-ink-200 hover:border-ink-900 px-3 py-1.5"
          >
            Sign out
          </button>
        </div>
      </div>

      {banner && (
        <div className="border border-amber-300 bg-amber-50 text-amber-900 text-sm px-3 py-2 flex items-center justify-between">
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-amber-700 hover:text-amber-900 text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      {!mcpConfigured && experts.some((e) => e.mcpEnabled) && (
        <div className="border border-amber-300 bg-amber-50 text-amber-900 text-sm px-3 py-2.5">
          <span className="font-medium">Gemma 4 endpoint not configured.</span>{" "}
          The MCP runtime on this backend is handling chat for advisors with
          MCP on, but it's falling back to DeepSeek for the actual model call
          (the advisor skill set still stays server-side). Set{" "}
          <span className="font-mono">GEMMA_URL</span> (and optionally{" "}
          <span className="font-mono">GEMMA_TOKEN</span>,{" "}
          <span className="font-mono">GEMMA_MODEL</span>) to point at your
          self-hosted Gemma 4.
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-base font-medium text-ink-900 tracking-tight">
            Advisors ({experts.length})
          </h2>
          <button
            type="button"
            onClick={seed}
            className="text-xs text-ink-700 hover:text-ink-900 border border-ink-200 hover:border-ink-900 px-3 py-1.5 disabled:opacity-50"
            disabled={seeded && !noExperts}
            title="Imports any advisors from data/experts.ts that don't yet exist in D1"
          >
            {noExperts ? "Seed from static →" : "Re-seed missing"}
          </button>
        </div>

        {noExperts ? (
          <div className="border border-dashed border-ink-300 bg-ink-50/50 p-8 text-center">
            <p className="text-sm text-ink-700 mb-2">
              The <code className="text-xs">experts</code> table is empty.
            </p>
            <p className="text-xs text-ink-500">
              Click "Seed from static" above to populate it from
              <code className="ml-1">src/data/experts.ts</code>.
            </p>
          </div>
        ) : (
          <div className="border border-ink-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-[11px] uppercase tracking-[0.14em] text-ink-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Advisor</th>
                  <th className="text-left px-4 py-2 font-medium">ID</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">
                    MCP (Gemma 4)
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Updated</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {experts.map((e) => (
                  <tr key={e.id} className="border-t border-ink-100">
                    <td className="px-4 py-3 text-ink-900">
                      <div className="flex items-center gap-3">
                        <img
                          src={e.portraitUrl}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover border border-ink-200"
                        />
                        <div className="min-w-0">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-[11px] text-ink-500 truncate max-w-[240px]">
                            {e.title}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-500">
                      {e.id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] uppercase tracking-[0.14em] ${
                          e.status === "active"
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleMcp(e)}
                        className="inline-flex items-center gap-2 group"
                        title={
                          e.mcpEnabled
                            ? "Click to disable MCP — falls back to DeepSeek/Anthropic"
                            : "Click to route this advisor's chats through MCP (Gemma 4)"
                        }
                      >
                        <span
                          aria-hidden
                          className={`relative w-9 h-5 rounded-full transition ${
                            e.mcpEnabled ? "bg-accent-500" : "bg-ink-200"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                              e.mcpEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </span>
                        <span
                          className={`text-[11px] uppercase tracking-[0.14em] ${
                            e.mcpEnabled
                              ? "text-accent-700"
                              : "text-ink-500"
                          }`}
                        >
                          {e.mcpEnabled ? "on" : "off"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-ink-500">
                      {new Date(e.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingExpertId(e.id)}
                          className="text-xs text-ink-50 bg-ink-900 hover:bg-ink-700 px-3 py-1"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(e)}
                          className="text-xs text-ink-600 hover:text-ink-900 border border-ink-200 hover:border-ink-900 px-3 py-1"
                        >
                          {e.status === "active" ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-medium text-ink-900 tracking-tight mb-2">
          Pricing policy
        </h2>
        <p className="text-xs text-ink-500 mb-3 max-w-2xl leading-relaxed">
          <span className="font-medium text-ink-700">Click any price</span> to
          edit it. Press Enter to save, blur away to cancel, or click{" "}
          <span className="font-mono">↻</span> to reset to the default. Lifetime
          is platform-wide so cannot be set per-advisor. Prices are USD;
          purchases created after a change use the new price immediately.
        </p>
        <div className="border border-ink-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-[11px] uppercase tracking-[0.14em] text-ink-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Advisor</th>
                {TIER_COLUMNS.map((col) => (
                  <th key={col.id} className="text-left px-4 py-2 font-medium">
                    {col.label}
                    <div className="text-[10px] text-ink-400 font-normal normal-case tracking-normal mt-0.5">
                      default ${defaults[col.id] ? (defaults[col.id].priceCents / 100).toFixed(0) : "—"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {experts.map((e) => (
                <tr key={e.id} className="border-t border-ink-100">
                  <td className="px-4 py-3 text-ink-900 font-medium">{e.name}</td>
                  {TIER_COLUMNS.map((col) => {
                    const key = `${e.id}:${col.id}`;
                    const override = overrides.get(key);
                    const isLifetime = col.id === "lifetime";
                    return (
                      <td key={col.id} className="px-4 py-3 align-middle">
                        {isLifetime ? (
                          <span className="text-[11px] text-ink-400 uppercase tracking-[0.14em]">
                            global
                          </span>
                        ) : (
                          <PriceCell
                            override={override}
                            defaultCents={defaults[col.id]?.priceCents ?? 0}
                            onSave={(dollars) => setPrice(e.id, col.id, dollars)}
                            onReset={() => clearPrice(e.id, col.id)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingExpertId && (
        <ExpertEditModal
          expertId={editingExpertId}
          onClose={() => setEditingExpertId(null)}
          onSaved={() => {
            setBanner("Advisor profile saved.");
            void refreshData();
          }}
        />
      )}

      {monitoringOpen && (
        <MonitoringModal onClose={() => setMonitoringOpen(false)} />
      )}
    </div>
  );
}

function PriceCell({
  override,
  defaultCents,
  onSave,
  onReset,
}: {
  override: Override | undefined;
  defaultCents: number;
  onSave: (dollars: number) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    override ? (override.priceCents / 100).toString() : (defaultCents / 100).toString(),
  );

  useEffect(() => {
    setValue(
      override
        ? (override.priceCents / 100).toString()
        : (defaultCents / 100).toString(),
    );
  }, [override, defaultCents]);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value);
          if (Number.isFinite(n) && n >= 0) {
            onSave(n);
          }
          setEditing(false);
        }}
        className="flex items-center gap-1"
      >
        <span className="text-ink-500 text-sm">$</span>
        <input
          type="number"
          min={0}
          step={1}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            const n = Number(value);
            if (Number.isFinite(n) && n >= 0) onSave(n);
            setEditing(false);
          }}
          className="w-20 border border-ink-300 focus:border-ink-900 outline-none px-2 py-1 text-sm"
        />
      </form>
    );
  }

  const current = override?.priceCents ?? defaultCents;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit price"
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-sm font-medium border transition ${
          override
            ? "border-accent-400 bg-accent-50 text-accent-700 hover:border-accent-600"
            : "border-ink-200 bg-white text-ink-700 hover:border-ink-900 hover:text-ink-900"
        }`}
      >
        <span>${(current / 100).toFixed(0)}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-60"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
      {override ? (
        <button
          type="button"
          onClick={onReset}
          title="Clear override, use default"
          className="text-xs text-ink-500 hover:text-ink-900 underline"
        >
          reset
        </button>
      ) : (
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400">
          default
        </span>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      {children}
    </div>
  );
}

function AdminLoginCard({
  heading,
  intro,
  presetEmail = "",
  trailing,
  onSignedIn,
}: {
  heading: string;
  intro: React.ReactNode;
  presetEmail?: string;
  trailing?: React.ReactNode;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState(presetEmail);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"email" | "verify">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockCode, setMockCode] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        status?: string;
        mockCode?: string;
        error?: string;
      };
      if (!res.ok || data.status !== "needs_verify") {
        throw new Error(data.error ?? "Could not send code.");
      }
      setMockCode(data.mockCode ?? null);
      setPhase("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verify failed.");
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto border border-ink-200 bg-white p-6 md:p-8">
      <div className="text-[11px] uppercase tracking-[0.16em] text-accent-600 mb-2">
        Admin
      </div>
      <h1 className="text-xl font-medium tracking-tight text-ink-900 mb-2">
        {heading}
      </h1>
      <p className="text-sm text-ink-600 leading-relaxed mb-5">{intro}</p>

      {phase === "email" ? (
        <form onSubmit={requestCode} className="space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-1.5 block">
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900"
            />
          </label>
          <button
            type="submit"
            disabled={busy || email.trim().length === 0}
            className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5"
          >
            {busy ? "Sending…" : "Send code →"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-xs text-ink-500">
            A code was generated for <span className="font-mono">{email}</span>.
          </p>
          {mockCode && (
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-medium mb-0.5">Mock mode</div>
              Dev code:{" "}
              <span className="font-mono font-medium">{mockCode}</span> — or type
              any non-empty value.
            </div>
          )}
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-1.5 block">
              6-digit code
            </span>
            <input
              type="text"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full border border-ink-300 bg-white px-3.5 py-2.5 text-sm font-mono tracking-widest text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || code.trim().length === 0}
              className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5"
            >
              {busy ? "Verifying…" : "Sign in →"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("email");
                setCode("");
                setMockCode(null);
              }}
              className="text-xs text-ink-600 hover:text-ink-900 underline"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-3 border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {trailing}
    </div>
  );
}
