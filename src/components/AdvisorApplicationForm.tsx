import { useEffect, useState } from "react";

type Specialty = { id: string; label: string };

type FormState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "success"; name: string }
  | { kind: "error"; message: string };

export default function AdvisorApplicationForm() {
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [brief, setBrief] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/advisor-specialties");
        const data = (await res.json()) as { specialties: Specialty[] };
        setSpecialties(data.specialties);
      } catch {
        // leave null; field stays disabled until network recovers
      }
    })();
  }, []);

  async function submit() {
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/advisor-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone, specialty, brief }),
      });
      const data = (await res.json()) as {
        status?: string;
        error?: string;
        applicationId?: string;
      };
      if (!res.ok || data.status !== "ok") {
        throw new Error(data.error ?? "Submit failed.");
      }
      setState({ kind: "success", name });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div className="border border-emerald-300 bg-emerald-50 p-6">
        <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-700 mb-2">
          Application received
        </div>
        <h3 className="text-lg font-medium text-ink-900 mb-2">
          Thanks, {state.name.split(" ")[0] || "friend"}.
        </h3>
        <p className="text-sm text-ink-700 leading-relaxed">
          We review every application personally and usually reply within 3
          business days. If there's a fit, the next step is a 30-minute call
          with one of our platform leads.
        </p>
      </div>
    );
  }

  const busy = state.kind === "busy";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="border border-ink-200 bg-white p-6 md:p-8 space-y-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-medium tracking-tight text-ink-900">
          Application
        </h3>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500">
          Takes 3 minutes
        </span>
      </div>

      <Field label="Full name" required>
        <input
          type="text"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={INPUT_STYLE}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={INPUT_STYLE}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            maxLength={50}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className={INPUT_STYLE}
          />
        </Field>
      </div>

      <Field label="Specialty" required>
        <select
          required
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          disabled={!specialties}
          className={`${INPUT_STYLE} ${specialty === "" ? "text-ink-400" : "text-ink-900"}`}
        >
          <option value="" disabled>
            {specialties ? "Select your area of expertise" : "Loading…"}
          </option>
          {specialties?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Tell us about your playbook"
        hint="What have you built or shipped that teams would pay to learn from?"
      >
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="e.g. I led RevOps at two Series B → D SaaS companies; I want to turn my forecast-prep flow into a skill…"
          className={`${INPUT_STYLE} resize-none`}
        />
        <div className="mt-1 text-[11px] text-ink-400 text-right">
          {brief.length} / 2000
        </div>
      </Field>

      {state.kind === "error" && (
        <div className="border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-ink-500 leading-snug">
          By submitting you agree to let Skillforge contact you about your
          application. We don't share your info.
        </p>
        <button
          type="submit"
          disabled={busy || !name || !email || !specialty}
          className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5 whitespace-nowrap"
        >
          {busy ? "Submitting…" : "Submit application →"}
        </button>
      </div>
    </form>
  );
}

const INPUT_STYLE =
  "w-full border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900 disabled:opacity-50";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500">
          {label}
          {required && <span className="text-accent-500 ml-1">*</span>}
        </span>
      </div>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[11px] text-ink-500 leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}
