import { useMemo } from "react";
import { getKhaiVanSkill } from "../data/khai-van-skills";
import { getTemplate } from "../data/skill-templates";
import { renderReport } from "../lib/skill-builder";

type Props = {
  skillId: string;
  profile: Record<string, unknown>;
  reviewMode?: boolean;
};

export default function ReportPreview({ skillId, profile, reviewMode = false }: Props) {
  const { markdown, khaiVanName, filledCount, totalCount } = useMemo(() => {
    const template = getTemplate(skillId);
    const khaiVan = template ? getKhaiVanSkill(template.khaiVanSkillId) : null;
    if (!template || !khaiVan) {
      return { markdown: "", khaiVanName: "", filledCount: 0, totalCount: 0 };
    }
    const report = renderReport(khaiVan, profile);
    const required = khaiVan.slots.filter((s) => s.required);
    const filled = required.filter((s) => {
      const v = profile[s.key];
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.trim().length > 0;
      return true;
    }).length;
    return {
      markdown: report.markdown,
      khaiVanName: khaiVan.name,
      filledCount: filled,
      totalCount: required.length,
    };
  }, [skillId, profile]);

  const progress = totalCount === 0 ? 0 : Math.round((filledCount / totalCount) * 100);

  return (
    <div className="flex flex-col h-[70vh] min-h-[520px] border border-ink-200 bg-ink-900 text-ink-50">
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              reviewMode ? "bg-emerald-400" : "bg-accent-500"
            }`}
          />
          <span className="text-sm tracking-tight">
            <span className="text-ink-300">
              {reviewMode ? "Review · " : "Live preview · "}
            </span>
            <span className="font-medium">{khaiVanName || "Discovery Report"}</span>
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-400">
          {filledCount}/{totalCount} slots
        </span>
      </div>

      <div className="px-5 pt-2 pb-3 border-b border-ink-700">
        <div className="h-1 bg-ink-700 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              reviewMode ? "bg-emerald-400" : "bg-accent-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto px-5 py-5 font-mono text-[12.5px] leading-[1.7]">
          <PreviewBody text={markdown} />
          <div className="h-24" aria-hidden />
        </div>
      </div>

      {reviewMode && (
        <div className="border-t border-ink-700 px-5 py-3 bg-ink-800/60">
          <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-400">
            Report ready — confirm below to hand off to Skill Forge
          </p>
        </div>
      )}
    </div>
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
