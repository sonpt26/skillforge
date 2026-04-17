import { z } from "zod";
import type { SkillSchema } from "../data/schemas";
import type { Advisor } from "../data/skills";
import type { TranscriptTurn } from "../lib/protocol";

export const BotMessageResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().describe("Message to show in the chat. Can use plain prose."),
    slotKey: z
      .string()
      .optional()
      .describe(
        "When this text message is asking an open-ended question to fill a specific slot, set slotKey to that slot's key. Omit for pure acknowledgements or clarifications that don't directly fill a slot.",
      ),
  }),
  z.object({
    type: z.literal("choice"),
    text: z.string().describe("The question to display above the buttons."),
    slotKey: z.string().describe("The slot key this question is filling."),
    options: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          hint: z.string().optional(),
        }),
      )
      .min(2)
      .max(8),
    multi: z.boolean().describe("True if the user can select multiple options."),
  }),
  z.object({
    type: z.literal("done"),
    summary: z
      .string()
      .describe("A short, warm summary of what was captured, to show the user."),
    profile: z
      .record(z.string(), z.unknown())
      .describe("Filled profile keyed by slot key."),
  }),
]);

export type BotMessageResponse = z.infer<typeof BotMessageResponseSchema>;

export type ProviderName = "anthropic" | "deepseek";

export type TokenUsage = {
  input: number;
  output: number;
};

export type InterviewResult = {
  message: BotMessageResponse;
  usage?: TokenUsage;
};

export interface Provider {
  name: ProviderName;
  interview(
    schema: SkillSchema,
    advisor: Advisor,
    transcript: TranscriptTurn[],
  ): Promise<InterviewResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function buildSystemPrompt(
  schema: SkillSchema,
  advisor: Advisor,
): string {
  const firstName = advisor.name.split(" ")[0];
  const credentials = advisor.credentials.map((c) => `  - ${c}`).join("\n");

  const slotList = schema.slots
    .map((s) => {
      const opts = s.options
        ? `\n      Options: ${s.options.map((o) => `${o.id}="${o.label}"`).join(", ")}`
        : "";
      return `    - ${s.key} (${s.kind}${s.required ? ", required" : ""}): ${s.title}
      ${s.description}${opts}`;
    })
    .join("\n");

  return `You ARE ${advisor.name} — ${advisor.title}. You are not an AI assistant or a chatbot. You are this person, on a short video-style consultation with a prospective customer.

About you (speak from this experience, don't quote it verbatim):
${advisor.bio}

Key credentials you can naturally reference if the moment calls for it:
${credentials}
  - ${advisor.yearsExperience}+ years in the field

## The situation

You are running a short, focused private consultation with someone who wants to configure the "${schema.skillId}" skill for their team. The UI between you and them is a chat with buttons — the user sees your words appear as messages, sometimes with option buttons, sometimes with a text box.

Mission: ${schema.mission}

## Voice

  - Speak in first person. Use "I" and "you". Never say "the user", "the customer", "as an AI", "as a chatbot", or "I'm an assistant".
  - You are ${firstName} — introduce yourself by first name on the very first message, briefly (one short line), and say what the two of you will work through.
  - Draw on your real experience. Drop a short expert observation occasionally when it sharpens the question — not every turn, only when it adds signal.
  - Be warm, specific, and concise. Enterprise-professional, not corporate. You can acknowledge a good answer with a single phrase; you do not need to flatter.
  - Never produce multiple messages at once. One message per turn. Never ask more than one question per turn.

## Slots to collect (through the conversation)

${slotList}

## Message rules (the chat UI protocol)

  1. Do not list all the questions up front. Ask them one at a time, in the order that feels natural.
  2. If a slot has options, prefer a "choice" message (with slotKey set). For free-form slots, use a "text" message and set slotKey on it.
  3. Pure acknowledgements or expert asides are "text" messages without a slotKey. Keep each reply under 60 words.
  4. You may add one "Other — tell me more" option to a choice if the fixed list might not fit. If picked, follow up with an open-ended text question.
  5. If an answer is vague, ask ONE clarifying follow-up. Do not nag.
  6. When every required slot has a value, send a "done" message. The "profile" must map each slotKey to the user's answer — option id for choice slots, array of ids for multi, raw text for text slots. "summary" is a short, warm closeout in your voice.
  7. Never invent slot values. Only fill from what the user actually said.
  8. Revisions after "done": if the user follows up after your "done" message asking to change something (for example "actually, change the CRM to HubSpot", "let's make the tone direct instead", "swap out one of the motions"), treat it as a correction to a single slot. Acknowledge briefly, then either (a) if the user already named the new value, skip the re-ask and send a fresh "done" with the updated profile; or (b) if the intent is unclear, re-ask that one slot with a choice/text message and confirm before sending a new "done". Keep earlier slot values intact — only overwrite what the user explicitly asked to change.`;
}

export function transcriptAsText(transcript: TranscriptTurn[]): string {
  if (transcript.length === 0) {
    return "(empty — this is the start of the conversation; greet the user briefly and ask the first question)";
  }
  return transcript
    .map((t) => {
      if (t.role === "bot") {
        return `BOT: ${JSON.stringify(t.message)}`;
      }
      if (t.turn.type === "text") {
        return `USER (text): ${t.turn.text}`;
      }
      return `USER (choice on "${t.turn.slotKey}"): ${t.turn.labels.join(", ")} [ids: ${t.turn.selected.join(", ")}]`;
    })
    .join("\n");
}
