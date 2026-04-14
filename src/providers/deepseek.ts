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
  type Provider,
} from "./types";

const OUTPUT_CONTRACT = `

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

export function createDeepseekProvider(apiKey: string): Provider {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com/v1",
  });

  return {
    name: "deepseek",
    async interview(
      schema: SkillSchema,
      advisor: Advisor,
      transcript: TranscriptTurn[],
    ): Promise<BotMessageResponse> {
      const systemPrompt = buildSystemPrompt(schema, advisor) + OUTPUT_CONTRACT;
      const userPrompt = `Transcript so far:\n${transcriptAsText(transcript)}\n\nProduce the next bot message as a single JSON object.`;

      let lastRaw = "";
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const messages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ];
        if (attempt > 0) {
          messages.push({
            role: "assistant",
            content: lastRaw,
          });
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

          return result.data;
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
    },
  };
}
