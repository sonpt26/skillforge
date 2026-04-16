import { useEffect, useState } from "react";
import type { Skill } from "../data/skills";

type Tier = {
  id: string;
  name: string;
  tagline: string;
  priceCents: number;
  currency: string;
  scopeType: "template" | "expert" | "all";
  durationDays: number | null;
  features: string[];
};

type Phase =
  | { kind: "email" }
  | { kind: "verify"; email: string; mockCode?: string; purchasedTier?: string }
  | { kind: "tiers"; email: string; userExists: boolean }
  | { kind: "payment"; email: string; tier: Tier; purchaseId: string; mock: boolean };

type Props = {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
};

export default function EntryModal({ open, skill, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Tier[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "email" });
    setEmail("");
    setCode("");
    setBusy(false);
    setError(null);
  }, [open, skill?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (phase.kind !== "tiers" || tiers) return;
    void (async () => {
      try {
        const res = await fetch("/api/tiers");
        const data = (await res.json()) as { tiers: Tier[] };
        setTiers(data.tiers);
      } catch {
        setError("Could not load packages.");
      }
    })();
  }, [phase.kind, tiers]);

  async function submitEmail() {
    if (!skill || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, skillId: skill.id }),
      });
      const data = (await res.json()) as {
        status?: string;
        mockCode?: string;
        userExists?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (data.status === "needs_verify") {
        setPhase({ kind: "verify", email, mockCode: data.mockCode });
      } else if (data.status === "needs_purchase") {
        setPhase({ kind: "tiers", email, userExists: !!data.userExists });
      } else {
        throw new Error("Unexpected response from server.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function pickTier(tier: Tier) {
    if (!skill || busy) return;
    const activeEmail = phase.kind === "tiers" ? phase.email : email;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: activeEmail, tier: tier.id, skillId: skill.id }),
      });
      const data = (await res.json()) as {
        purchaseId?: string;
        mock?: boolean;
        error?: string;
      };
      if (!res.ok || !data.purchaseId) {
        throw new Error(data.error ?? "Could not create purchase.");
      }
      setPhase({
        kind: "payment",
        email: activeEmail,
        tier,
        purchaseId: data.purchaseId,
        mock: !!data.mock,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    if (phase.kind !== "payment" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchaseId: phase.purchaseId }),
      });
      const data = (await res.json()) as { mockCode?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Confirm failed.");
      setPhase({
        kind: "verify",
        email: phase.email,
        mockCode: data.mockCode,
        purchasedTier: phase.tier.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (phase.kind !== "verify" || busy || !skill) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: phase.email, code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verify failed.");
      window.location.href = `/app/chat/${skill.id}/`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (!open || !skill) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/75 backdrop-blur-sm flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-7xl max-h-[92vh] bg-white border border-ink-200 shadow-2xl grid grid-cols-1 md:grid-cols-[3fr_2fr] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center text-white/90 hover:text-white md:text-white md:hover:text-white bg-ink-900/40 hover:bg-ink-900/70 backdrop-blur-sm rounded-full text-base"
        >
          ✕
        </button>

        <AdvisorPanel skill={skill} />

        <div className="p-8 md:p-10 overflow-y-auto bg-white flex flex-col">
          {phase.kind === "email" && (
            <EmailStep
              email={email}
              setEmail={setEmail}
              onSubmit={submitEmail}
              busy={busy}
              skill={skill}
            />
          )}
          {phase.kind === "verify" && (
            <VerifyStep
              email={phase.email}
              mockCode={phase.mockCode}
              code={code}
              setCode={setCode}
              onSubmit={submitCode}
              busy={busy}
              purchasedTier={phase.purchasedTier}
            />
          )}
          {phase.kind === "tiers" && (
            <TiersStep
              email={phase.email}
              userExists={phase.userExists}
              tiers={tiers}
              onPick={pickTier}
              busy={busy}
              skill={skill}
            />
          )}
          {phase.kind === "payment" && (
            <PaymentStep
              tier={phase.tier}
              onConfirm={confirmPayment}
              busy={busy}
            />
          )}
          {error && (
            <div className="mt-4 border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Left panel — advisor hero + sections. Scrollable as one column.
// ──────────────────────────────────────────────────────────────────────────

function AdvisorPanel({ skill }: { skill: Skill }) {
  const a = skill.advisor;
  const fullStars = Math.round(a.stats.avgRating);
  return (
    <div className="bg-ink-900 text-ink-50 overflow-y-auto max-h-[92vh]">
      <div className="grid grid-cols-1 md:grid-cols-3 border-b border-ink-800">
        <div className="md:col-span-2 bg-ink-800 h-[420px] md:h-[480px] overflow-hidden">
          <img
            src={a.heroPortraitUrl ?? a.portraitUrl}
            alt={a.name}
            className="w-full h-full object-cover object-top"
          />
        </div>
        <div className="md:col-span-1 p-6 flex flex-col gap-3 border-t md:border-t-0 md:border-l border-ink-800">
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent-400">
            {skill.category} · Advisor
          </div>
          <h2 className="text-2xl font-medium tracking-tight text-white leading-tight">
            {a.name}
          </h2>
          <p className="text-sm text-ink-200 leading-snug">{a.title}</p>
          <div className="flex items-center gap-2 text-xs text-ink-300 mt-1">
            <Stars filled={fullStars} small />
            <span className="text-white font-medium">
              {a.stats.avgRating.toFixed(1)}
            </span>
            <span>· {a.stats.reviewCount.toLocaleString()} reviews</span>
          </div>
          <ul className="text-xs text-ink-300 space-y-1 mt-1">
            <li>
              <span className="text-white font-medium">
                {a.yearsExperience}+ years
              </span>{" "}
              in the field
            </li>
            <li>
              <span className="text-white font-medium">
                {a.stats.usersHelped.toLocaleString()}+
              </span>{" "}
              teams helped
            </li>
            <li>
              <span className="text-white font-medium">
                {a.stats.downloads.toLocaleString()}+
              </span>{" "}
              skills downloaded
            </li>
          </ul>
          {a.approach && (
            <p className="text-xs text-ink-200 italic leading-relaxed border-l-2 border-accent-500 pl-2.5 mt-auto pt-3">
              {a.approach}
            </p>
          )}
        </div>
      </div>

      <div className="p-8 space-y-7">
        {a.specialties && a.specialties.length > 0 && (
          <Section heading="Specialties">
            <div className="flex flex-wrap gap-1.5">
              {a.specialties.map((s, i) => (
                <span
                  key={i}
                  className="text-xs border border-ink-700 bg-ink-800/60 px-2.5 py-1 text-ink-200"
                >
                  {s}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section heading="Background">
          <p className="text-sm text-ink-200 leading-relaxed">{a.bio}</p>
        </Section>

        {a.approach && (
          <Section heading="Approach">
            <p className="text-sm text-ink-200 leading-relaxed italic border-l-2 border-accent-500 pl-3.5">
              {a.approach}
            </p>
          </Section>
        )}

        <Section heading="Credentials">
          <ul className="space-y-1.5 text-sm text-ink-200">
            {a.credentials.map((c, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-accent-400 mt-0.5">◆</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Section>

        {a.notableClients && a.notableClients.length > 0 && (
          <Section heading="Notable clients">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-200">
              {a.notableClients.map((c, i) => (
                <span key={i} className="inline-flex items-center">
                  {c}
                  {i < a.notableClients!.length - 1 && (
                    <span className="text-ink-600 ml-3">·</span>
                  )}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section
          heading={
            <span className="flex items-baseline gap-2">
              <span>Customer reviews</span>
              <span className="text-ink-500 lowercase tracking-normal text-[10px]">
                {a.reviews.length} recent of {a.stats.reviewCount.toLocaleString()}
              </span>
            </span>
          }
        >
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 -mr-2 reviews-scroll">
            {a.reviews.map((r, i) => (
              <div
                key={i}
                className="border border-ink-700 bg-ink-800/40 p-4"
              >
                <Stars filled={5} small />
                <p className="text-sm text-ink-100 leading-relaxed mt-2">
                  "{r.quote}"
                </p>
                <p className="text-xs text-ink-400 mt-2 tracking-wide">
                  — {r.name}, {r.role}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  heading,
  children,
}: {
  heading: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-[0.16em] text-ink-400 mb-2.5">
        {heading}
      </h3>
      {children}
    </div>
  );
}

function Stars({ filled, small = false }: { filled: number; small?: boolean }) {
  const size = small ? 11 : 13;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={i < filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          className={i < filled ? "text-accent-400" : "text-ink-600"}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Right panel — step components
// ──────────────────────────────────────────────────────────────────────────

const PLATFORM_BENEFITS = [
  "Work 1-to-1 with the advisor's playbook — not a generic LLM wrapper",
  "Your skill folder runs locally in Claude Code or any agent runtime",
  "Iterate the configuration anytime — the chat remembers your context",
  "No lock-in: download the skill, keep it forever",
];

function EmailStep({
  email,
  setEmail,
  onSubmit,
  busy,
  skill,
}: {
  email: string;
  setEmail: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  skill: Skill;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col h-full"
    >
      <StepHeader step={1} label="Identify" />
      <h3 className="text-2xl font-medium tracking-tight text-ink-900 mt-3 mb-2">
        Enter the private room
      </h3>
      <p className="text-sm text-ink-600 leading-relaxed mb-6">
        Tell us the email you'll use for{" "}
        <span className="font-medium text-ink-900">{skill.name}</span>. We'll
        check if you already own access, or show you the packages.
      </p>

      <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-1.5">
        Email
      </label>
      <input
        type="email"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="border border-ink-300 bg-white px-3.5 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900"
      />
      <button
        type="submit"
        disabled={busy || email.trim().length === 0}
        className="mt-5 bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-3 self-start"
      >
        {busy ? "Checking…" : "Continue →"}
      </button>

      <div className="mt-auto pt-8">
        <div className="text-[11px] uppercase tracking-[0.16em] text-ink-400 mb-3">
          What's included
        </div>
        <ul className="space-y-2">
          {PLATFORM_BENEFITS.map((b, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-600 leading-relaxed">
              <span className="text-accent-500 mt-0.5">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}

function VerifyStep({
  email,
  mockCode,
  code,
  setCode,
  onSubmit,
  busy,
  purchasedTier,
}: {
  email: string;
  mockCode?: string;
  code: string;
  setCode: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  purchasedTier?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col"
    >
      <StepHeader step={purchasedTier ? 3 : 2} label="Verify" />
      <h3 className="text-2xl font-medium tracking-tight text-ink-900 mt-3 mb-2">
        {purchasedTier ? "Payment received" : "Welcome back"}
      </h3>
      <p className="text-sm text-ink-600 leading-relaxed mb-5">
        {purchasedTier
          ? `Your ${purchasedTier} is active on ${email}. Scan the QR to get a code — or paste any code below (mock mode).`
          : `Scan the QR with your phone to receive a one-time code on ${email}.`}
      </p>

      <div className="flex flex-col sm:flex-row items-start gap-5 mb-5">
        <QrPlaceholder label="Scan to receive code" />
        <div className="flex-1 w-full">
          <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-1.5 block">
            6-digit code
          </label>
          <input
            type="text"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 123456"
            className="w-full border border-ink-300 bg-white px-3.5 py-3 text-sm font-mono tracking-widest text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900"
          />
          {mockCode && (
            <div className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-medium mb-0.5">Mock mode</div>
              Dev code:{" "}
              <span className="font-mono font-medium">{mockCode}</span> — or
              type any non-empty value.
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={busy || code.trim().length === 0}
        className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-3 self-start"
      >
        {busy ? "Verifying…" : "Enter the room →"}
      </button>
    </form>
  );
}

function TiersStep({
  email,
  userExists,
  tiers,
  onPick,
  busy,
  skill,
}: {
  email: string;
  userExists: boolean;
  tiers: Tier[] | null;
  onPick: (tier: Tier) => void;
  busy: boolean;
  skill: Skill;
}) {
  return (
    <div className="flex flex-col">
      <StepHeader step={2} label="Choose a package" />
      <h3 className="text-2xl font-medium tracking-tight text-ink-900 mt-3 mb-2">
        {userExists
          ? "You don't have access yet"
          : "Pick how you want to work together"}
      </h3>
      <p className="text-sm text-ink-600 leading-relaxed mb-5">
        For{" "}
        <span className="font-medium text-ink-900">{skill.name}</span> on{" "}
        <span className="font-medium text-ink-900">{email}</span>. Confirm with
        a mock payment, then enter the room.
      </p>

      {!tiers ? (
        <div className="text-sm text-ink-500">Loading packages…</div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              onPick={() => onPick(tier)}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TierCard({
  tier,
  onPick,
  busy,
}: {
  tier: Tier;
  onPick: () => void;
  busy: boolean;
}) {
  const price = formatPrice(tier.priceCents, tier.currency);
  const featured = tier.id === "advisor_6mo";
  return (
    <div
      className={`relative border px-5 py-4 ${
        featured
          ? "border-accent-500 bg-accent-50/40 shadow-[0_0_0_1px] shadow-accent-500/20"
          : "border-ink-200 bg-white hover:border-ink-900 transition"
      }`}
    >
      {featured && (
        <span className="absolute -top-2 left-5 bg-accent-500 text-white text-[10px] uppercase tracking-[0.14em] px-2 py-0.5">
          Most popular
        </span>
      )}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-medium text-ink-900">{tier.name}</h4>
          <p className="text-xs text-ink-600 mt-1 leading-relaxed">
            {tier.tagline}
          </p>
          <ul className="mt-3 space-y-1">
            {tier.features.map((f, i) => (
              <li
                key={i}
                className="flex gap-1.5 text-[11px] text-ink-700 leading-snug"
              >
                <span className="text-accent-500 mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="text-lg font-medium text-ink-900">{price}</div>
          {tier.durationDays && (
            <div className="text-[10px] text-ink-500 uppercase tracking-wide mt-0.5">
              {tier.durationDays} days
            </div>
          )}
          {!tier.durationDays && tier.scopeType === "all" && (
            <div className="text-[10px] text-ink-500 uppercase tracking-wide mt-0.5">
              Lifetime
            </div>
          )}
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className="mt-3 bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 text-xs px-3 py-2 whitespace-nowrap"
          >
            Choose →
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentStep({
  tier,
  onConfirm,
  busy,
}: {
  tier: Tier;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col">
      <StepHeader step={3} label="Pay" />
      <h3 className="text-2xl font-medium tracking-tight text-ink-900 mt-3 mb-2">
        {tier.name}
      </h3>
      <p className="text-sm text-ink-600 leading-relaxed mb-5">
        Scan the QR with your banking app to pay{" "}
        <span className="font-medium text-ink-900">
          {formatPrice(tier.priceCents, tier.currency)}
        </span>
        . Once payment is received, a login code will be sent to your email.
      </p>
      <div className="flex flex-col sm:flex-row items-start gap-5 mb-5">
        <QrPlaceholder label="Scan to pay" />
        <div className="flex-1 text-sm text-ink-600 space-y-3">
          <div>
            <div className="text-ink-400 uppercase tracking-[0.14em] text-[10px]">
              Amount
            </div>
            <div className="text-ink-900 font-medium text-lg">
              {formatPrice(tier.priceCents, tier.currency)}
            </div>
          </div>
          <div>
            <div className="text-ink-400 uppercase tracking-[0.14em] text-[10px]">
              Status
            </div>
            <div className="text-amber-700 font-medium">Awaiting payment</div>
          </div>
        </div>
      </div>
      <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 mb-4">
        Mock mode: click below to simulate a completed payment.
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 text-sm px-5 py-3 self-start"
      >
        {busy ? "Confirming…" : "Simulate payment →"}
      </button>
    </div>
  );
}

function StepHeader({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-500">
      <span className="w-5 h-5 inline-flex items-center justify-center bg-ink-900 text-ink-50 text-[10px]">
        {step}
      </span>
      <span>{label}</span>
    </div>
  );
}

function QrPlaceholder({ label }: { label: string }) {
  return (
    <div className="shrink-0 flex flex-col items-center">
      <div className="w-44 h-44 bg-white border border-ink-200 grid grid-cols-7 grid-rows-7 gap-1 p-2.5">
        {Array.from({ length: 49 }).map((_, i) => {
          const row = Math.floor(i / 7);
          const col = i % 7;
          const isCorner =
            (row <= 1 && col <= 1) ||
            (row <= 1 && col >= 5) ||
            (row >= 5 && col <= 1);
          const filled = isCorner || (i * 37 + 13) % 5 < 2;
          return (
            <span
              key={i}
              className={filled ? "bg-ink-900" : "bg-transparent"}
              aria-hidden
            />
          );
        })}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-ink-500">
        {label}
      </p>
      <p className="text-[10px] text-ink-400">(placeholder)</p>
    </div>
  );
}

function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}
