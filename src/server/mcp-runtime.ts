/**
 * In-backend MCP runtime — the advisor-chat "model context protocol" is
 * implemented right here; there is no external MCP server to call out to.
 *
 * When an advisor has `mcp_enabled = 1` the interview handler routes the
 * conversation through these three functions:
 *
 *     open(ctx)            → conversationId + first assistant message
 *     turn(ctx, convId)    → next assistant message
 *     close(convId)        → release any model-side resources
 *
 * The actual text generation goes to Gemma 4 when `GEMMA_URL` is configured;
 * otherwise we fall back to DeepSeek with the full advisor skill set packed
 * into the system prompt. In both cases the skill set stays on the backend —
 * the client only ever sees a BotMessageResponse.
 */
import { z } from "zod";
import type { SkillSchema } from "../data/schemas";
import type { Advisor } from "../data/skills";
import type { TranscriptTurn } from "../lib/protocol";
import {
  callDeepseekForBotMessage,
  OUTPUT_CONTRACT,
} from "../providers/deepseek";
import {
  BotMessageResponseSchema,
  buildSystemPrompt,
  type BotMessageResponse,
  ProviderError,
  type TokenUsage,
} from "../providers/types";
import type { AdvisorSkillSet } from "./advisor-skill-set";

export type McpRuntimeEnv = {
  GEMMA_URL?: string;
  GEMMA_TOKEN?: string;
  GEMMA_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
};

export type McpCallInput = {
  schema: SkillSchema;
  advisor: Advisor;
  skillSet: AdvisorSkillSet;
  transcript: TranscriptTurn[];
};

export type McpOpenResult = {
  conversationId: string;
  message: BotMessageResponse;
  usage?: TokenUsage;
  model: "gemma" | "deepseek";
};

export type McpTurnResult = {
  message: BotMessageResponse;
  usage?: TokenUsage;
  model: "gemma" | "deepseek";
};

export function isGemmaConfigured(env: McpRuntimeEnv): boolean {
  return !!env.GEMMA_URL;
}

function generateConversationId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `mcp_${uuid.replace(/-/g, "").slice(0, 16)}`;
}

function summarizeSkillSet(
  skillSet: AdvisorSkillSet,
  currentSkillId: string,
): string {
  const lines: string[] = [];
  lines.push(
    `Advisor specialties: ${skillSet.advisor.specialties?.join(", ") ?? "—"}`,
  );
  lines.push("");
  lines.push(
    "Your full playbook catalogue (available to you for context, not necessarily the one the buyer is here for):",
  );
  for (const s of skillSet.skills) {
    const marker = s.templateId === currentSkillId ? "→ (active)" : "  ";
    lines.push(`${marker} ${s.name} [${s.category}] — ${s.tagline}`);
    lines.push(`     discovery: ${s.discovery.mission}`);
  }
  return lines.join("\n");
}

function buildSessionSystemPrompt(input: McpCallInput): string {
  const base = buildSystemPrompt(input.schema, input.advisor);
  const catalogue = summarizeSkillSet(input.skillSet, input.schema.skillId);
  const mcpNote = `\n\n## Context from your broader knowledge\n\n${catalogue}\n\nYou may reference other playbooks if the buyer's needs don't fit the active one, and suggest the right next step — but still drive the current interview to completion unless they explicitly pivot.`;
  return base + mcpNote + OUTPUT_CONTRACT;
}

// ────────────────────────────────────────────────────────────────────────
// Model dispatch: Gemma if configured, DeepSeek otherwise
// ────────────────────────────────────────────────────────────────────────

const GemmaResponseSchema = z.object({
  message: BotMessageResponseSchema,
  usage: z
    .object({ input: z.number(), output: z.number() })
    .optional(),
});

async function callGemma(
  env: McpRuntimeEnv,
  systemPrompt: string,
  transcript: TranscriptTurn[],
): Promise<{ message: BotMessageResponse; usage?: TokenUsage }> {
  const url = env.GEMMA_URL!.replace(/\/+$/, "") + "/completions";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.GEMMA_TOKEN) headers.authorization = `Bearer ${env.GEMMA_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.GEMMA_MODEL ?? "gemma-4",
      systemPrompt,
      transcript,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ProviderError(
      `Gemma endpoint returned ${res.status}: ${txt.slice(0, 200)}`,
      502,
    );
  }
  const parsed = GemmaResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ProviderError("Gemma endpoint returned malformed payload.", 502);
  }
  return { message: parsed.data.message, usage: parsed.data.usage };
}

type ModelCallResult = {
  message: BotMessageResponse;
  usage?: TokenUsage;
  model: "gemma" | "deepseek";
};

async function callModel(
  env: McpRuntimeEnv,
  input: McpCallInput,
): Promise<ModelCallResult> {
  const prompt = buildSessionSystemPrompt(input);
  if (isGemmaConfigured(env)) {
    const r = await callGemma(env, prompt, input.transcript);
    return { message: r.message, usage: r.usage, model: "gemma" };
  }
  if (!env.DEEPSEEK_API_KEY) {
    throw new ProviderError(
      "MCP runtime: no GEMMA_URL configured and no DEEPSEEK_API_KEY to fall back on.",
      500,
    );
  }
  const r = await callDeepseekForBotMessage(
    env.DEEPSEEK_API_KEY,
    prompt,
    input.transcript,
  );
  return { message: r.message, usage: r.usage, model: "deepseek" };
}

// ────────────────────────────────────────────────────────────────────────
// Session lifecycle (in-process for stub; Gemma tracks its own state)
// ────────────────────────────────────────────────────────────────────────

export async function mcpSessionOpen(
  env: McpRuntimeEnv,
  input: McpCallInput,
): Promise<McpOpenResult> {
  const conversationId = generateConversationId();
  const r = await callModel(env, input);
  return { conversationId, message: r.message, usage: r.usage, model: r.model };
}

export async function mcpSessionTurn(
  env: McpRuntimeEnv,
  _conversationId: string,
  input: McpCallInput,
): Promise<McpTurnResult> {
  // Gemma is expected to reassemble context from its own conversation store
  // when we replay the transcript. For the DeepSeek stub there is no per-
  // conversation state to carry forward beyond what the transcript captures.
  const r = await callModel(env, input);
  return { message: r.message, usage: r.usage, model: r.model };
}

export async function mcpSessionClose(
  env: McpRuntimeEnv,
  conversationId: string,
): Promise<void> {
  if (!isGemmaConfigured(env)) return;
  try {
    const url = env.GEMMA_URL!.replace(/\/+$/, "") + "/sessions/close";
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (env.GEMMA_TOKEN) headers.authorization = `Bearer ${env.GEMMA_TOKEN}`;
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ conversationId }),
    });
  } catch {
    // best-effort
  }
}
