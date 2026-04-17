import { useEffect, useState } from "react";
import type { Expert, ExpertReview } from "../data/experts";

type Props = {
  expertId: string;
  onClose: () => void;
  onSaved: () => void;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; expert: Expert }
  | { kind: "error"; message: string };

export default function ExpertEditModal({ expertId, onClose, onSaved }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/experts/get?id=${encodeURIComponent(expertId)}`,
        );
        const data = (await res.json()) as { expert?: Expert; error?: string };
        if (!res.ok || !data.expert) {
          throw new Error(data.error ?? "Could not load expert.");
        }
        setState({ kind: "loaded", expert: data.expert });
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Load failed.",
        });
      }
    })();
  }, [expertId]);

  async function save(expert: Expert) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/experts/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expert),
      });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok || data.status !== "ok") {
        throw new Error(data.error ?? "Save failed.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm flex items-stretch md:items-center justify-center p-0 md:p-6"
      onClick={() => !saving && onClose()}
    >
      <div
        className="relative w-full max-w-3xl bg-white md:border md:border-ink-200 md:shadow-2xl overflow-hidden flex flex-col max-h-full md:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200 shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-accent-600">
              Edit advisor profile
            </div>
            <h2 className="text-lg font-medium tracking-tight text-ink-900">
              {state.kind === "loaded" ? state.expert.name : "Loading…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 flex items-center justify-center text-ink-500 hover:text-ink-900 text-lg disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {state.kind === "loading" && (
            <div className="p-10 text-center text-sm text-ink-500">
              Loading…
            </div>
          )}
          {state.kind === "error" && (
            <div className="p-10 text-center">
              <p className="text-sm text-red-700">{state.message}</p>
            </div>
          )}
          {state.kind === "loaded" && (
            <EditForm
              expert={state.expert}
              saving={saving}
              error={error}
              onCancel={onClose}
              onSave={save}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EditForm({
  expert,
  saving,
  error,
  onCancel,
  onSave,
}: {
  expert: Expert;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (expert: Expert) => void;
}) {
  const [name, setName] = useState(expert.name);
  const [title, setTitle] = useState(expert.title);
  const [yearsExperience, setYearsExperience] = useState(expert.yearsExperience);
  const [portraitUrl, setPortraitUrl] = useState(expert.portraitUrl);
  const [heroPortraitUrl, setHeroPortraitUrl] = useState(
    expert.heroPortraitUrl ?? "",
  );
  const [bio, setBio] = useState(expert.bio);
  const [approach, setApproach] = useState(expert.approach ?? "");
  const [specialties, setSpecialties] = useState(
    (expert.specialties ?? []).join("\n"),
  );
  const [notableClients, setNotableClients] = useState(
    (expert.notableClients ?? []).join("\n"),
  );
  const [credentials, setCredentials] = useState(
    expert.credentials.join("\n"),
  );
  const [usersHelped, setUsersHelped] = useState(expert.stats.usersHelped);
  const [downloads, setDownloads] = useState(expert.stats.downloads);
  const [avgRating, setAvgRating] = useState(expert.stats.avgRating);
  const [reviewCount, setReviewCount] = useState(expert.stats.reviewCount);
  const [reviews, setReviews] = useState<ExpertReview[]>(expert.reviews);

  function toLines(text: string): string[] {
    return text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      id: expert.id,
      name,
      title,
      yearsExperience,
      portraitUrl,
      heroPortraitUrl: heroPortraitUrl.trim() || undefined,
      bio,
      approach: approach.trim() || undefined,
      specialties: toLines(specialties),
      notableClients: toLines(notableClients),
      credentials: toLines(credentials),
      stats: {
        usersHelped,
        downloads,
        avgRating,
        reviewCount,
      },
      reviews: reviews
        .map((r) => ({
          quote: r.quote.trim(),
          name: r.name.trim(),
          role: r.role.trim(),
        }))
        .filter((r) => r.quote && r.name),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="p-5 md:p-7 space-y-7">
        <Section title="Basics">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Years experience">
              <input
                type="number"
                min={0}
                value={yearsExperience}
                onChange={(e) => setYearsExperience(Number(e.target.value))}
                className={INPUT}
              />
            </Field>
            <Field label="Title / tagline" className="sm:col-span-2">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
        </Section>

        <Section title="Photos">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Portrait URL (small / catalog avatar)"
              hint="Square headshot. Used on cards and chat header."
            >
              <input
                type="url"
                required
                value={portraitUrl}
                onChange={(e) => setPortraitUrl(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field
              label="Hero portrait URL (half-body)"
              hint="Larger photo shown in the entry modal + advisor page."
            >
              <input
                type="url"
                value={heroPortraitUrl}
                onChange={(e) => setHeroPortraitUrl(e.target.value)}
                placeholder="Optional"
                className={INPUT}
              />
            </Field>
          </div>
          {(portraitUrl || heroPortraitUrl) && (
            <div className="mt-4 flex items-start gap-4">
              {portraitUrl && (
                <img
                  src={portraitUrl}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover border border-ink-200"
                />
              )}
              {heroPortraitUrl && (
                <img
                  src={heroPortraitUrl}
                  alt=""
                  className="h-32 rounded object-contain border border-ink-200 bg-ink-50"
                />
              )}
            </div>
          )}
        </Section>

        <Section title="Narrative">
          <Field label="Bio">
            <textarea
              required
              rows={5}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={`${INPUT} resize-y`}
            />
          </Field>
          <Field label="Approach" hint="One-line pull-quote shown as italic.">
            <textarea
              rows={3}
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
              className={`${INPUT} resize-y`}
              placeholder="Optional"
            />
          </Field>
        </Section>

        <Section title="Lists (one per line)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Specialties">
              <textarea
                rows={6}
                value={specialties}
                onChange={(e) => setSpecialties(e.target.value)}
                className={`${INPUT} resize-y font-mono text-xs`}
                placeholder="One per line"
              />
            </Field>
            <Field label="Credentials">
              <textarea
                rows={6}
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                className={`${INPUT} resize-y font-mono text-xs`}
                placeholder="One per line"
              />
            </Field>
            <Field label="Notable clients">
              <textarea
                rows={6}
                value={notableClients}
                onChange={(e) => setNotableClients(e.target.value)}
                className={`${INPUT} resize-y font-mono text-xs`}
                placeholder="One per line"
              />
            </Field>
          </div>
        </Section>

        <Section title="Stats">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Users helped">
              <input
                type="number"
                min={0}
                value={usersHelped}
                onChange={(e) => setUsersHelped(Number(e.target.value))}
                className={INPUT}
              />
            </Field>
            <Field label="Downloads">
              <input
                type="number"
                min={0}
                value={downloads}
                onChange={(e) => setDownloads(Number(e.target.value))}
                className={INPUT}
              />
            </Field>
            <Field label="Avg rating">
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={avgRating}
                onChange={(e) => setAvgRating(Number(e.target.value))}
                className={INPUT}
              />
            </Field>
            <Field label="Review count">
              <input
                type="number"
                min={0}
                value={reviewCount}
                onChange={(e) => setReviewCount(Number(e.target.value))}
                className={INPUT}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Customer reviews"
          action={
            <button
              type="button"
              onClick={() =>
                setReviews([...reviews, { quote: "", name: "", role: "" }])
              }
              className="text-xs text-ink-700 hover:text-ink-900 border border-ink-200 hover:border-ink-900 px-3 py-1.5"
            >
              + Add review
            </button>
          }
        >
          {reviews.length === 0 ? (
            <p className="text-sm text-ink-500">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r, i) => (
                <div
                  key={i}
                  className="border border-ink-200 bg-ink-50/40 p-3 space-y-2"
                >
                  <textarea
                    rows={2}
                    value={r.quote}
                    placeholder="Quote"
                    onChange={(e) => {
                      const next = [...reviews];
                      next[i] = { ...r, quote: e.target.value };
                      setReviews(next);
                    }}
                    className={`${INPUT} resize-y text-sm`}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      type="text"
                      value={r.name}
                      placeholder="Name"
                      onChange={(e) => {
                        const next = [...reviews];
                        next[i] = { ...r, name: e.target.value };
                        setReviews(next);
                      }}
                      className={`${INPUT} text-sm`}
                    />
                    <input
                      type="text"
                      value={r.role}
                      placeholder="Role / company"
                      onChange={(e) => {
                        const next = [...reviews];
                        next[i] = { ...r, role: e.target.value };
                        setReviews(next);
                      }}
                      className={`${INPUT} text-sm`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setReviews(reviews.filter((_, j) => j !== i))
                      }
                      className="text-xs text-red-700 hover:text-red-900 border border-red-200 hover:border-red-700 px-3 py-1.5 whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {error && (
        <div className="mx-5 md:mx-7 mb-4 border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="border-t border-ink-200 bg-ink-50/60 px-5 md:px-7 py-3 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-ink-700 hover:text-ink-900 underline hover:no-underline"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-ink-500">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-1.5 block">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] text-ink-500 leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}
