import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SkillSchema } from "../data/schemas";
import type { Advisor } from "../data/skills";
import type { TranscriptTurn } from "../lib/protocol";
import {
  BotMessageResponseSchema,
  buildSystemPrompt,
  transcriptAsText,
  ProviderError,
  type InterviewResult,
  type Provider,
} from "./types";

export function createAnthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    async interview(
      schema: SkillSchema,
      advisor: Advisor,
      transcript: TranscriptTurn[],
    ): Promise<InterviewResult> {
      try {
        const response = await client.messages.parse({
          model: "claude-opus-4-6",
          max_tokens: 2000,
          thinking: { type: "adaptive" },
          system: [
            {
              type: "text",
              text: buildSystemPrompt(schema, advisor),
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Transcript so far:\n${transcriptAsText(transcript)}\n\nProduce the next bot message.`,
            },
          ],
          output_config: {
            format: zodOutputFormat(BotMessageResponseSchema),
          },
        });

        if (!response.parsed_output) {
          throw new ProviderError(
            "Model did not produce a valid structured message.",
          );
        }
        const usage = response.usage
          ? {
              input: response.usage.input_tokens ?? 0,
              output: response.usage.output_tokens ?? 0,
            }
          : undefined;
        return { message: response.parsed_output, usage };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        if (err instanceof Anthropic.APIError) {
          throw new ProviderError(
            `Anthropic error: ${err.message}`,
            err.status ?? 502,
          );
        }
        throw new ProviderError("Unexpected Anthropic error.");
      }
    },
  };
}
