import { z } from "zod";

export const BotOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string().optional(),
});

export const BotMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
    slotKey: z.string().optional(),
  }),
  z.object({
    type: z.literal("choice"),
    text: z.string(),
    options: z.array(BotOptionSchema).min(2).max(8),
    slotKey: z.string(),
    multi: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("done"),
    summary: z.string(),
    profile: z.record(z.string(), z.unknown()),
  }),
]);

export type BotMessage = z.infer<typeof BotMessageSchema>;

export type UserTurn =
  | { type: "text"; text: string }
  | { type: "choice"; slotKey: string; selected: string[]; labels: string[] };

export type TranscriptTurn =
  | { role: "bot"; message: BotMessage }
  | { role: "user"; turn: UserTurn };

export type InterviewRequest = {
  skillId: string;
  transcript: TranscriptTurn[];
};

export type InterviewResponse = {
  message: BotMessage;
};
