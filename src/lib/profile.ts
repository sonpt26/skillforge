import type { BotMessage, TranscriptTurn } from "./protocol";

export function reconstructProfile(
  transcript: TranscriptTurn[],
): Record<string, unknown> {
  const profile: Record<string, unknown> = {};

  for (let i = 0; i < transcript.length; i++) {
    const turn = transcript[i];
    if (turn.role !== "user") continue;

    const prev = i > 0 ? transcript[i - 1] : null;
    if (!prev || prev.role !== "bot") continue;

    const botMsg: BotMessage = prev.message;
    if (botMsg.type === "done") continue;

    const slotKey =
      botMsg.type === "choice"
        ? botMsg.slotKey
        : botMsg.type === "text"
          ? botMsg.slotKey
          : undefined;
    if (!slotKey) continue;

    if (turn.turn.type === "text") {
      profile[slotKey] = turn.turn.text;
    } else {
      const isMulti = botMsg.type === "choice" && botMsg.multi;
      profile[slotKey] = isMulti ? turn.turn.selected : turn.turn.selected[0];
    }
  }

  const lastBot = [...transcript].reverse().find((t) => t.role === "bot");
  if (lastBot && lastBot.role === "bot" && lastBot.message.type === "done") {
    return lastBot.message.profile;
  }

  return profile;
}
