import { useEffect, useMemo, useRef, useState } from "react";
import { getKhaiVanSkill } from "../data/khai-van-skills";
import type { Report } from "../data/reports";
import { getTemplate } from "../data/skill-templates";
import type { BotMessage, TranscriptTurn, UserTurn } from "../lib/protocol";
import { renderReport } from "../lib/skill-builder";
import {
  findReusableReportLocal,
  listReportsLocal,
  nextReportVersion,
  REPORTS_UPDATED_EVENT,
  upsertReport,
} from "../lib/storage";

type AuthState =
  | { kind: "checking" }
  | { kind: "signed_in"; user: { id: string; email: string } }
  | { kind: "signed_out" };

function openEntryModal(skillId: string) {
  window.dispatchEvent(
    new CustomEvent("skillforge:open-modal", { detail: { skillId } }),
  );
}

type Props = {
  skillId: string;
  skillName: string;
  advisorName: string;
  advisorPortraitUrl: string;
};

export default function ChatRoom({
  skillId,
  skillName,
  advisorName,
  advisorPortraitUrl,
}: Props) {
  const [auth, setAuth] = useState<AuthState>({ kind: "checking" });
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [multiDraft, setMultiDraft] = useState<Set<string>>(new Set());
  const [editingReport, setEditingReport] = useState(false);
  const [reusableReport, setReusableReport] = useState<Report | null>(null);
  const [showReuseBanner, setShowReuseBanner] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (auth.kind !== "checking") return;
    void (async () => {
      try {
        const res = await fetch("/api/me");
        const data = (await res.json()) as { user?: { id: string; email: string } | null };
        if (data.user) setAuth({ kind: "signed_in", user: data.user });
        else setAuth({ kind: "signed_out" });
      } catch {
        setAuth({ kind: "signed_out" });
      }
    })();
  }, [auth.kind]);

  const template = useMemo(() => getTemplate(skillId), [skillId]);
  const khaiVanSkillId = template?.khaiVanSkillId ?? null;

  const lastBot = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const turn = transcript[i];
      if (turn.role === "bot") return turn.message;
    }
    return null;
  }, [transcript]);

  const isDone = lastBot?.type === "done";
  const awaitingChoice = lastBot?.type === "choice";
  const doneProfile = isDone && lastBot?.type === "done" ? lastBot.profile : null;

  useEffect(() => {
    if (isDone) setEditingReport(false);
  }, [isDone, lastBot]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, loading]);

  useEffect(() => {
    if (auth.kind !== "signed_in" || didInit.current) return;
    didInit.current = true;

    void (async () => {
      // First: try to resume a server-side chat session. If we find one with
      // transcript already populated, hydrate the UI from it — no need to
      // replay /api/interview for the intro turn.
      try {
        const res = await fetch(
          `/api/chat/session?skillId=${encodeURIComponent(skillId)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            session: {
              transcript: TranscriptTurn[];
              mode: string;
            } | null;
          };
          if (data.session && data.session.transcript.length > 0) {
            setTranscript(data.session.transcript);
            return;
          }
        }
      } catch {
        // fall through to normal start
      }

      // No server session — fall back to the legacy localStorage reuse flow
      // (will be retired once the folder panel also moves to D1).
      if (khaiVanSkillId) {
        const reusable = findReusableReportLocal(khaiVanSkillId);
        if (reusable) {
          setReusableReport(reusable);
          setShowReuseBanner(true);
          return;
        }
      }

      void sendTurn([]);
    })();
  }, [auth.kind, khaiVanSkillId, skillId]);

  async function startOver() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/chat/session/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId }),
      });
      setTranscript([]);
      setEditingReport(false);
      setError(null);
      await sendTurn([]);
    } catch {
      setError("Could not start over.");
      setLoading(false);
    }
  }

  function acceptReuse() {
    if (!reusableReport) return;
    const doneMsg: BotMessage = {
      type: "done",
      summary:
        "Welcome back — I've loaded your answers from a previous session. Review the report on the right, edit anything that's changed, and forge when ready.",
      profile: reusableReport.data,
    };
    setTranscript([{ role: "bot", message: doneMsg }]);
    setShowReuseBanner(false);
  }

  function declineReuse() {
    setReusableReport(null);
    setShowReuseBanner(false);
    void sendTurn([]);
  }

  async function sendTurn(nextTranscript: TranscriptTurn[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId, transcript: nextTranscript }),
      });
      if (res.status === 401 || res.status === 403) {
        setAuth({ kind: "signed_out" });
        didInit.current = false;
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { message: BotMessage };
      setTranscript([...nextTranscript, { role: "bot", message: data.message }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function submitText() {
    const text = textDraft.trim();
    if (!text || loading) return;
    const turn: UserTurn = { type: "text", text };
    const next: TranscriptTurn[] = [...transcript, { role: "user", turn }];
    setTextDraft("");
    setTranscript(next);
    void sendTurn(next);
  }

  function submitChoice(ids: string[], labels: string[]) {
    if (!lastBot || lastBot.type !== "choice" || loading) return;
    const turn: UserTurn = {
      type: "choice",
      slotKey: lastBot.slotKey,
      selected: ids,
      labels,
    };
    const next: TranscriptTurn[] = [...transcript, { role: "user", turn }];
    setMultiDraft(new Set());
    setTranscript(next);
    void sendTurn(next);
  }

  if (auth.kind === "checking") {
    return (
      <div className="mx-auto max-w-3xl flex items-center justify-center h-[40vh] text-sm text-ink-500">
        Checking access…
      </div>
    );
  }

  if (auth.kind === "signed_out") {
    return <SignedOutGate skillId={skillId} skillName={skillName} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
      <div className="flex flex-col h-[65vh] min-h-[440px] lg:h-[70vh] lg:min-h-[520px] border border-ink-200 bg-white">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <img
              src={advisorPortraitUrl}
              alt={advisorName}
              className="w-7 h-7 rounded-full object-cover border border-ink-200"
            />
            <div className="min-w-0">
              <div className="text-sm text-ink-900 font-medium tracking-tight leading-tight">
                {advisorName}
              </div>
              <div className="text-[11px] text-ink-500 leading-tight">
                live consultation · {skillName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {transcript.length > 1 && (
              <button
                type="button"
                onClick={startOver}
                disabled={loading}
                className="text-[11px] text-ink-500 hover:text-ink-900 underline hover:no-underline disabled:opacity-50"
                title="Archive this session and start a fresh conversation"
              >
                Start over
              </button>
            )}
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-accent-600">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
              online
            </span>
          </div>
        </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
        {showReuseBanner && reusableReport && (
          <ReuseBanner
            report={reusableReport}
            onAccept={acceptReuse}
            onDecline={declineReuse}
          />
        )}

        {transcript.length === 0 && loading && (
          <TypingBubble advisorPortraitUrl={advisorPortraitUrl} />
        )}

        {transcript.map((turn, idx) => (
          <TurnView key={idx} turn={turn} advisorPortraitUrl={advisorPortraitUrl} />
        ))}

        {loading && transcript.length > 0 && (
          <TypingBubble advisorPortraitUrl={advisorPortraitUrl} />
        )}

        {error && (
          <div className="border border-red-300 bg-red-50 text-red-800 text-sm px-4 py-3">
            {error}
            <button
              className="ml-3 underline hover:no-underline"
              onClick={() => void sendTurn(transcript)}
            >
              Retry
            </button>
          </div>
        )}
      </div>

        <div className="border-t border-ink-200 bg-ink-50/60">
          {isDone && !editingReport ? (
            <ReviewFooter
              skillId={skillId}
              profile={doneProfile ?? {}}
              onEdit={() => setEditingReport(true)}
            />
          ) : awaitingChoice && lastBot && lastBot.type === "choice" ? (
            <ChoiceFooter
              message={lastBot}
              multiDraft={multiDraft}
              setMultiDraft={setMultiDraft}
              onSubmit={submitChoice}
              disabled={loading}
            />
          ) : (
            <TextFooter
              value={textDraft}
              onChange={setTextDraft}
              onSubmit={submitText}
              disabled={loading}
              editMode={isDone && editingReport}
              onCancelEdit={
                isDone && editingReport ? () => setEditingReport(false) : undefined
              }
            />
          )}
        </div>
      </div>

      <SkillFolderPanel skillId={skillId} />
    </div>
  );
}

function SignedOutGate({
  skillId,
  skillName,
}: {
  skillId: string;
  skillName: string;
}) {
  return (
    <div className="mx-auto max-w-xl border border-ink-200 bg-white p-8 text-center">
      <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 mb-2">
        Sign in required
      </div>
      <h2 className="text-xl font-medium tracking-tight text-ink-900 mb-3">
        This is a private room
      </h2>
      <p className="text-sm text-ink-600 leading-relaxed mb-6">
        To configure <span className="font-medium">{skillName}</span> you need an
        active package. Sign in or pick a tier to continue.
      </p>
      <button
        type="button"
        onClick={() => openEntryModal(skillId)}
        className="bg-ink-900 text-ink-50 hover:bg-ink-700 text-sm px-5 py-2.5"
      >
        Open sign in →
      </button>
    </div>
  );
}

function TurnView({
  turn,
  advisorPortraitUrl,
}: {
  turn: TranscriptTurn;
  advisorPortraitUrl: string;
}) {
  if (turn.role === "bot") {
    const m = turn.message;
    if (m.type === "text")
      return <BotBubble advisorPortraitUrl={advisorPortraitUrl}>{m.text}</BotBubble>;
    if (m.type === "choice")
      return <BotBubble advisorPortraitUrl={advisorPortraitUrl}>{m.text}</BotBubble>;
    return (
      <div className="flex gap-3">
        <img
          src={advisorPortraitUrl}
          alt=""
          className="w-7 h-7 rounded-full object-cover border border-ink-200 mt-1 shrink-0"
        />
        <div className="flex-1 border border-ink-200 bg-ink-50 p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-accent-600 mb-2">
            Consultation complete
          </div>
          <p className="text-sm text-ink-800 leading-relaxed">{m.summary}</p>
        </div>
      </div>
    );
  }
  const t = turn.turn;
  if (t.type === "text") return <UserBubble>{t.text}</UserBubble>;
  return <UserBubble>{t.labels.join(", ")}</UserBubble>;
}

function BotBubble({
  children,
  advisorPortraitUrl,
}: {
  children: React.ReactNode;
  advisorPortraitUrl: string;
}) {
  return (
    <div className="flex gap-3">
      <img
        src={advisorPortraitUrl}
        alt=""
        className="w-7 h-7 rounded-full object-cover border border-ink-200 mt-1 shrink-0"
      />
      <div className="max-w-[85%] border border-ink-200 bg-white px-4 py-3 text-sm text-ink-800 leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-ink-900 text-ink-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

function TypingBubble({ advisorPortraitUrl }: { advisorPortraitUrl: string }) {
  return (
    <div className="flex gap-3">
      <img
        src={advisorPortraitUrl}
        alt=""
        className="w-7 h-7 rounded-full object-cover border border-ink-200 mt-1 shrink-0"
      />
      <div className="border border-ink-200 bg-white px-4 py-3 flex gap-1.5">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-bounce"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}

function ChoiceFooter({
  message,
  multiDraft,
  setMultiDraft,
  onSubmit,
  disabled,
}: {
  message: Extract<BotMessage, { type: "choice" }>;
  multiDraft: Set<string>;
  setMultiDraft: (s: Set<string>) => void;
  onSubmit: (ids: string[], labels: string[]) => void;
  disabled: boolean;
}) {
  if (!message.multi) {
    return (
      <div className="p-4 flex flex-wrap gap-2">
        {message.options.map((opt) => (
          <button
            key={opt.id}
            disabled={disabled}
            onClick={() => onSubmit([opt.id], [opt.label])}
            className="group text-left border border-ink-300 bg-white hover:border-ink-900 disabled:opacity-50 transition px-3.5 py-2 text-sm text-ink-800 disabled:cursor-not-allowed"
            title={opt.hint}
          >
            {opt.label}
            {opt.hint && (
              <span className="block text-xs text-ink-500 mt-0.5">{opt.hint}</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {message.options.map((opt) => {
          const selected = multiDraft.has(opt.id);
          return (
            <button
              key={opt.id}
              disabled={disabled}
              onClick={() => {
                const next = new Set(multiDraft);
                if (selected) next.delete(opt.id);
                else next.add(opt.id);
                setMultiDraft(next);
              }}
              className={`border px-3.5 py-2 text-sm transition disabled:opacity-50 ${
                selected
                  ? "bg-ink-900 border-ink-900 text-ink-50"
                  : "bg-white border-ink-300 text-ink-800 hover:border-ink-900"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-ink-500">
          Select all that apply ({multiDraft.size})
        </span>
        <button
          disabled={disabled || multiDraft.size === 0}
          onClick={() => {
            const ids = Array.from(multiDraft);
            const labels = message.options
              .filter((o) => multiDraft.has(o.id))
              .map((o) => o.label);
            onSubmit(ids, labels);
          }}
          className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm px-4 py-2"
        >
          Send →
        </button>
      </div>
    </div>
  );
}

function TextFooter({
  value,
  onChange,
  onSubmit,
  disabled,
  editMode = false,
  onCancelEdit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  editMode?: boolean;
  onCancelEdit?: () => void;
}) {
  return (
    <div>
      {editMode && (
        <div className="flex items-center justify-between border-b border-ink-200 bg-amber-50 px-4 py-2">
          <span className="text-xs text-amber-900">
            Tell me what you'd like to change — I'll adjust and show you the updated report.
          </span>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-amber-900 underline hover:no-underline"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      <form
        className="p-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled
              ? "Working…"
              : editMode
                ? "e.g. change the CRM to HubSpot"
                : "Type your answer — Enter to send, Shift+Enter for a new line"
          }
          className="flex-1 resize-none border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-ink-900 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm px-4 py-2.5"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function ReviewFooter({
  skillId,
  profile,
  onEdit,
}: {
  skillId: string;
  profile: Record<string, unknown>;
  onEdit: () => void;
}) {
  const [forging, setForging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function forge() {
    setForging(true);
    setError(null);
    try {
      const template = getTemplate(skillId);
      const khaiVan = template ? getKhaiVanSkill(template.khaiVanSkillId) : null;
      if (template && khaiVan) {
        const version = nextReportVersion(khaiVan.id);
        const rendered = renderReport(khaiVan, profile, { version });
        upsertReport({ ...rendered, status: "confirmed" });
      }

      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId, profile }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }

      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `${skillId}.zip`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not forge the skill.");
    } finally {
      setForging(false);
    }
  }

  return (
    <div className="p-5 space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {done
            ? "Forged and downloaded. Drop the folder into your agent's skills directory and reload."
            : "Review the report on the right. Confirm to hand off to Skill Forge, or ask to change something."}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            disabled={forging}
            className="border border-ink-300 bg-white hover:border-ink-900 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-ink-800 px-4 py-2.5 whitespace-nowrap"
          >
            Change something
          </button>
          <button
            type="button"
            onClick={forge}
            disabled={forging}
            className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5 whitespace-nowrap"
          >
            {forging
              ? "Forging…"
              : done
                ? "Forge again ↓"
                : "Forge my skill →"}
          </button>
        </div>
      </div>
      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

function ReuseBanner({
  report,
  onAccept,
  onDecline,
}: {
  report: Report;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const savedAgo = formatRelative(report.updatedAt);
  const slotCount = Object.keys(report.data).length;
  return (
    <div className="border border-accent-300 bg-accent-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="text-sm text-ink-900 font-medium">
          I found your answers from a previous discovery ({slotCount} slots, saved{" "}
          {savedAgo}).
        </p>
        <p className="text-xs text-ink-600 mt-0.5">
          Reuse them and skip straight to review, or start a fresh interview.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onDecline}
          className="text-sm text-ink-700 underline hover:no-underline"
        >
          Start fresh
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="bg-ink-900 text-ink-50 hover:bg-ink-700 text-sm px-3 py-1.5 whitespace-nowrap"
        >
          Reuse answers →
        </button>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function SkillFolderPanel({ skillId }: { skillId: string }) {
  const template = useMemo(() => getTemplate(skillId), [skillId]);
  const khaiVanSkillId = template?.khaiVanSkillId ?? null;
  const [versions, setVersions] = useState<Report[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!khaiVanSkillId) return;
    const refresh = () => setVersions(listReportsLocal(khaiVanSkillId));
    refresh();
    window.addEventListener(REPORTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(REPORTS_UPDATED_EVENT, refresh);
  }, [khaiVanSkillId]);

  async function reDownload(report: Report) {
    if (downloading) return;
    setDownloading(report.id);
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId, profile: report.data }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `${skillId}-v${report.version}.zip`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // swallow — user can retry
    } finally {
      setDownloading(null);
    }
  }

  return (
    <aside className="flex flex-col h-auto max-h-[480px] lg:h-[70vh] lg:max-h-none lg:min-h-[520px] border border-ink-200 bg-ink-50/40">
      <div className="px-5 py-3.5 border-b border-ink-200 bg-white">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderIcon />
            <div className="text-sm text-ink-900 font-medium tracking-tight">
              Skill folder
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">
            {versions.length} {versions.length === 1 ? "version" : "versions"}
          </div>
        </div>
        <p className="text-[11px] text-ink-500 mt-1 leading-snug">
          Every time you forge, a new version lands here.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {versions.length === 0 ? (
          <EmptyFolderState />
        ) : (
          versions.map((v) => (
            <VersionCard
              key={v.id}
              report={v}
              downloading={downloading === v.id}
              onRedownload={() => void reDownload(v)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function EmptyFolderState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-12 h-12 border-2 border-dashed border-ink-300 flex items-center justify-center mb-3">
        <FolderIcon />
      </div>
      <p className="text-sm text-ink-600 font-medium">Empty folder</p>
      <p className="text-xs text-ink-500 leading-relaxed mt-1 max-w-[220px]">
        Finish the interview and forge your first skill — all versions will live here.
      </p>
    </div>
  );
}

function VersionCard({
  report,
  downloading,
  onRedownload,
}: {
  report: Report;
  downloading: boolean;
  onRedownload: () => void;
}) {
  const slotCount = Object.keys(report.data).length;
  return (
    <div className="border border-ink-200 bg-white">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-ink-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase bg-ink-900 text-ink-50 px-1.5 py-0.5">
              v{report.version}
            </span>
            <span
              className={`text-[10px] uppercase tracking-[0.14em] ${
                report.status === "confirmed" ? "text-emerald-600" : "text-amber-600"
              }`}
            >
              {report.status}
            </span>
          </div>
          <div className="text-[11px] text-ink-500 mt-1">
            {formatRelative(report.updatedAt)} · {slotCount} slots
          </div>
        </div>
        <button
          type="button"
          onClick={onRedownload}
          disabled={downloading}
          className="text-xs text-ink-700 hover:text-ink-900 border border-ink-200 hover:border-ink-900 px-2.5 py-1 disabled:opacity-50 whitespace-nowrap"
        >
          {downloading ? "…" : "↓ .zip"}
        </button>
      </div>
      <div className="px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-ink-400">
        Files
      </div>
      <ul className="px-4 pb-3 space-y-0.5 font-mono text-[11px] text-ink-700">
        <li>SKILL.md</li>
        <li>README.md</li>
        <li>config.json</li>
      </ul>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="text-ink-600"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}
