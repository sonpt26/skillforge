import OpenAI from "openai";
import type { SkillSchema } from "../data/schemas";
import type { Advisor } from "../data/skills";
import type { TranscriptTurn } from "../lib/protocol";
import {
  BotMessageResponseSchema,
  buildSystemPrompt,
  transcriptAsText,
  ProviderError,
  type BotMessageResponse,
  type InterviewResult,
  type Provider,
  type TokenUsage,
} from "./types";

export const OUTPUT_CONTRACT = `

## OUTPUT CONTRACT

You MUST return a single JSON object matching one of these shapes. No prose outside the JSON. No code fences. No commentary.

Shape A — ask an open-ended question or acknowledge:
  {"type":"text","text":"<string>","slotKey":"<optional slot key>"}

Shape B — ask a question answered by buttons:
  {"type":"choice","text":"<question>","slotKey":"<slot key>","options":[{"id":"<id>","label":"<label>"}, ...],"multi":<true|false>}
  Rules: 2-8 options. Use the slot's exact option ids where available. Set "multi":true only for slots declared as (multi).

Shape C — interview complete:
  {"type":"done","summary":"<short summary>","profile":{"<slotKey>":<value>, ...}}
  For choice slots, value is the option id (string). For multi slots, value is an array of option ids. For text slots, value is the raw text.

Reply with exactly one of these JSON shapes.`;

/**
 * Reusable structured-output call to DeepSeek. One retry on validation failure,
 * then throws. Exposed so the MCP stub (while Gemma 4 is not hosted) can reuse
 * the same retry/parse loop with a different system prompt.
 */
export async function callDeepseekForBotMessage(
  apiKey: string,
  systemPrompt: string,
  transcript: TranscriptTurn[],
): Promise<{ message: BotMessageResponse; usage?: TokenUsage }> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com/v1",
  });
  const userPrompt = `Transcript so far:\n${transcriptAsText(transcript)}\n\nProduce the next bot message as a single JSON object.`;

  let lastRaw = "";
  let lastError = "";
  let accumulatedUsage: TokenUsage | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    if (attempt > 0) {
      messages.push({ role: "assistant", content: lastRaw });
      messages.push({
        role: "user",
        content: `Your previous JSON failed validation with: ${lastError}\nReply again with a single JSON object that matches the contract exactly.`,
      });
    }

    try {
      const completion = await client.chat.completions.create({
        model: "deepseek-chat",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2000,
      });

      if (completion.usage) {
        const add: TokenUsage = {
          input: completion.usage.prompt_tokens ?? 0,
          output: completion.usage.completion_tokens ?? 0,
        };
        accumulatedUsage = accumulatedUsage
          ? {
              input: accumulatedUsage.input + add.input,
              output: accumulatedUsage.output + add.output,
            }
          : add;
      }

      lastRaw = completion.choices[0]?.message?.content ?? "";
      if (!lastRaw) {
        lastError = "empty response";
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(lastRaw);
      } catch (e) {
        lastError = `JSON parse error: ${e instanceof Error ? e.message : "unknown"}`;
        continue;
      }

      const result = BotMessageResponseSchema.safeParse(parsed);
      if (!result.success) {
        lastError = result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        continue;
      }

      return { message: result.data, usage: accumulatedUsage };
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        throw new ProviderError(
          `DeepSeek error: ${err.message}`,
          err.status ?? 502,
        );
      }
      throw new ProviderError("Unexpected DeepSeek error.");
    }
  }

  throw new ProviderError(
    `DeepSeek failed to produce valid structured output after retry. Last error: ${lastError}`,
  );
}

export function createDeepseekProvider(apiKey: string): Provider {
  return {
    name: "deepseek",
    async interview(
      schema: SkillSchema,
      advisor: Advisor,
      transcript: TranscriptTurn[],
    ): Promise<InterviewResult> {
      const systemPrompt = buildSystemPrompt(schema, advisor) + OUTPUT_CONTRACT;
      return callDeepseekForBotMessage(apiKey, systemPrompt, transcript);
    },
  };
}
