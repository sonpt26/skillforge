import { useEffect, useMemo, useRef, useState } from "react";
import type { BotMessage, TranscriptTurn, UserTurn } from "../lib/protocol";
import { reconstructProfile } from "../lib/profile";
import SkillPreview from "./SkillPreview";

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
  const advisorFirstName = advisorName.split(" ")[0];
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [multiDraft, setMultiDraft] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);

  const lastBot = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const turn = transcript[i];
      if (turn.role === "bot") return turn.message;
    }
    return null;
  }, [transcript]);

  const isDone = lastBot?.type === "done";
  const awaitingChoice = lastBot?.type === "choice";
  const awaitingText = !isDone && (!lastBot || lastBot.type === "text");
  const doneProfile = isDone && lastBot?.type === "done" ? lastBot.profile : null;
  const liveProfile = useMemo(() => reconstructProfile(transcript), [transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, loading]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void sendTurn([]);
  }, []);

  async function sendTurn(nextTranscript: TranscriptTurn[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId, transcript: nextTranscript }),
      });
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
      <div className="flex flex-col h-[70vh] min-h-[520px] border border-ink-200 bg-white">
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
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-accent-600">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            online
          </span>
        </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
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
          {isDone ? (
            <DoneFooter skillId={skillId} profile={doneProfile ?? {}} />
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
              disabled={loading || !awaitingText}
            />
          )}
        </div>
      </div>

      <SkillPreview skillId={skillId} profile={liveProfile} />
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
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
        placeholder={disabled ? "Working…" : "Type your answer — Enter to send, Shift+Enter for a new line"}
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
  );
}

function DoneFooter({
  skillId,
  profile,
}: {
  skillId: string;
  profile: Record<string, unknown>;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function generate() {
    setDownloading(true);
    setError(null);
    try {
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
      setError(err instanceof Error ? err.message : "Could not generate the skill.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="p-5 space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {done
            ? "Downloaded. Drop the folder into your agent's skills directory and reload."
            : "Ready to build your skill folder from this configuration."}
        </p>
        <button
          onClick={generate}
          disabled={downloading}
          className="bg-ink-900 text-ink-50 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5 whitespace-nowrap"
        >
          {downloading
            ? "Generating…"
            : done
              ? "Download again ↓"
              : "Generate skill folder →"}
        </button>
      </div>
      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
