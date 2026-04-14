import { useMemo } from "react";
import { buildSkill } from "../lib/skill-builder";
import { getSchema } from "../data/schemas";

type Props = {
  skillId: string;
  profile: Record<string, unknown>;
};

export default function SkillPreview({ skillId, profile }: Props) {
  const { body, filledCount, totalCount } = useMemo(() => {
    const schema = getSchema(skillId);
    const built = buildSkill(skillId, profile);
    if (!schema || !built) {
      return { body: "", filledCount: 0, totalCount: 0 };
    }

    const skillMd =
      built.files.find((f) => f.path.endsWith("SKILL.md"))?.content ?? "";

    const required = schema.slots.filter((s) => s.required);
    const filled = required.filter((s) => {
      const v = profile[s.key];
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.trim().length > 0;
      return true;
    }).length;

    return { body: skillMd, filledCount: filled, totalCount: required.length };
  }, [skillId, profile]);

  const progress = totalCount === 0 ? 0 : Math.round((filledCount / totalCount) * 100);

  return (
    <div className="flex flex-col h-[70vh] min-h-[520px] border border-ink-200 bg-ink-900 text-ink-50">
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
          <span className="text-sm tracking-tight">
            <span className="text-ink-300">Live preview · </span>
            <span className="font-medium">SKILL.md</span>
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-400">
          {filledCount}/{totalCount} slots
        </span>
      </div>

      <div className="px-5 pt-2 pb-3 border-b border-ink-700">
        <div className="h-1 bg-ink-700 overflow-hidden">
          <div
            className="h-full bg-accent-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto px-5 py-5 font-mono text-[12.5px] leading-[1.7]">
          <PreviewBody text={body} />
          <div className="h-52" aria-hidden />
        </div>
        <PaywallOverlay />
      </div>
    </div>
  );
}

function PaywallOverlay() {
  return (
    <div
      className="absolute inset-x-0 bottom-0 h-[58%] pointer-events-none"
      style={{
        backdropFilter: "blur(7px)",
        WebkitBackdropFilter: "blur(7px)",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 22%, black 55%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 22%, black 55%)",
        background:
          "linear-gradient(to bottom, rgba(17,17,16,0) 0%, rgba(17,17,16,0.55) 45%, rgba(17,17,16,0.92) 100%)",
      }}
    >
      <div className="absolute inset-x-0 bottom-7 flex justify-center pointer-events-auto">
        <div className="mx-5 max-w-sm w-full border border-ink-700 bg-ink-800/95 backdrop-blur-sm px-5 py-4 text-center shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.16em] text-accent-500 mb-2">
            <LockIcon />
            <span>Preview locked</span>
          </div>
          <p className="text-sm text-ink-100 leading-relaxed mb-3">
            The full skill file unlocks when you purchase. We'll generate your
            personalized folder and hand you a download link.
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 bg-ink-50 text-ink-900 hover:bg-white disabled:opacity-80 disabled:cursor-not-allowed text-sm font-medium px-4 py-2"
            title="Checkout coming soon"
          >
            Unlock my skill →
          </button>
          <p className="mt-2 text-[11px] text-ink-400">One-time · commercial license</p>
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PreviewBody({ text }: { text: string }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <pre className="whitespace-pre-wrap text-ink-200">
      {tokens.map((tok, i) =>
        tok.type === "slot" ? (
          <span
            key={i}
            className="text-ink-400 bg-ink-700/40 px-1 py-[1px] rounded-sm italic"
            title={`Unfilled slot: ${tok.key}`}
          >
            {`{${tok.key}}`}
          </span>
        ) : (
          <span key={i}>{tok.text}</span>
        ),
      )}
    </pre>
  );
}

type Token =
  | { type: "text"; text: string }
  | { type: "slot"; key: string };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const pattern = /\{\{\s*(\w+)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", text: text.slice(last, m.index) });
    }
    out.push({ type: "slot", key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ type: "text", text: text.slice(last) });
  }
  return out;
}
