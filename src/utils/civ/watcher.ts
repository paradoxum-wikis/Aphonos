import type { Message } from "discord.js";
import { calculateAuraPercentage } from "../fighterGenerator.js";
import { enroll, getActiveCiv, setActiveCiv } from "./state.js";
import { saveActiveCiv } from "./log.js";
import type { ChatLine } from "./types.js";

const buffers = new Map<string, ChatLine[]>();

export function takeBuffer(guildId: string): ChatLine[] {
  const lines = buffers.get(guildId) ?? [];
  buffers.set(guildId, []);
  return lines;
}

export async function handleCivMessage(message: Message): Promise<void> {
  if (!message.guildId) return;
  if (message.author.bot || message.webhookId) return;
  if (!message.content.trim()) return;

  const state = getActiveCiv(message.guildId);
  if (!state) return;
  if (
    state.phase !== "live" &&
    state.phase !== "paused" &&
    state.phase !== "factions"
  )
    return;
  if (message.channelId !== state.channelId) return;

  const displayName = message.member?.displayName ?? message.author.username;
  const fresh = !state.participants[message.author.id];
  if (fresh) {
    enroll(
      state,
      message.author.id,
      displayName,
      calculateAuraPercentage(displayName),
    );
    setActiveCiv(state);
    await saveActiveCiv(state);
  } else if (state.participants[message.author.id].displayName !== displayName) {
    state.participants[message.author.id].displayName = displayName;
  }

  const buf = buffers.get(state.guildId) ?? [];
  buf.push({
    userId: message.author.id,
    displayName,
    content: message.content.slice(0, 500),
  });
  buffers.set(state.guildId, buf);
}
