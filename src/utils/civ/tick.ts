import type { Client, MessageCreateOptions } from "discord.js";
import { liveKin } from "./family.js";
import { computeAwards } from "./awards.js";
import { resolveLobby, resolveTick } from "./engine.js";
import {
  endTick,
  finishCiv,
  tryBeginTick,
} from "./lifecycle.js";
import { saveActiveCiv } from "./log.js";
import { allActiveCivs, getActiveCiv, setActiveCiv } from "./state.js";
import { TICK_MS, WORLD_EVERY, type CivState } from "./types.js";
import { bookSig } from "./digest.js";
import { judgementEmbed, recapPayload } from "./ui.js";
import { dream, narrate, rawNarration } from "./voice.js";
import { takeBuffer } from "./watcher.js";

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function stopCivTimer(guildId: string): void {
  const t = timers.get(guildId);
  if (t) clearTimeout(t);
  timers.delete(guildId);
}

export function scheduleCivTick(
  client: Client,
  guildId: string,
  delay = TICK_MS,
): void {
  stopCivTimer(guildId);
  const state = getActiveCiv(guildId);
  if (!state || (state.phase !== "live" && state.phase !== "factions"))
    return;
  timers.set(
    guildId,
    setTimeout(() => {
      runCivTick(client, guildId).catch((e) =>
        console.error("[civ] tick", e),
      );
    }, delay),
  );
}

export function scheduleAllLiveCivs(client: Client): void {
  for (const s of allActiveCivs()) {
    if (s.phase === "live" || s.phase === "factions")
      scheduleCivTick(client, s.guildId);
  }
}

async function post(
  client: Client,
  state: CivState,
  payload: MessageCreateOptions,
): Promise<void> {
  const ch = await client.channels.fetch(state.channelId);
  if (!ch || !ch.isTextBased() || !("send" in ch)) return;
  await ch.send(payload);
}

export async function runCivTick(
  client: Client,
  guildId: string,
  force = false,
): Promise<void> {
  const state = getActiveCiv(guildId);
  if (!state) return;
  const lobby =
    state.phase === "factions" ||
    (force && state.phase === "paused" && state.resumePhase === "factions");
  if (!force && state.phase !== "live" && state.phase !== "factions") return;
  if (!tryBeginTick(guildId)) return;
  const started = Date.now();
  let next: "live" | "factions" | undefined;
  const again = (phase: "live" | "factions") => {
    next = phase;
  };

  try {
    const chat = takeBuffer(guildId);
    if (lobby && !chat.length && !force) {
      again("factions");
      return;
    }

    const kin = await liveKin(Object.keys(state.participants));
    const thought = chat.length
      ? await dream(state, chat, kin, lobby).catch((e) => {
          console.error("[civ] dream", e);
          return { narration: "", intents: [], inventions: [] };
        })
      : { narration: "", intents: [], inventions: [] };

    if (lobby) {
      const before = bookSig(state);
      const result = resolveLobby(state, thought.intents);
      const showBook = bookSig(state) !== before || force;
      setActiveCiv(state);
      await saveActiveCiv(state);
      if (result.lines.length || thought.narration || force) {
        await post(client, state, {
          content: thought.narration || rawNarration(result),
          ...(showBook ? recapPayload(state) : {}),
        });
      }
      again("factions");
      return;
    }

    const before = bookSig(state);
    const result = resolveTick(state, thought.intents, kin, thought.inventions);
    const text = chat.length
      ? await narrate(state, result, kin, chat).catch((e) => {
          console.error("[civ] narrate", e);
          return rawNarration(result);
        })
      : rawNarration(result);

    if (result.winnerFactionId) {
      state.awards = computeAwards(state, kin, result.winnerFactionId);
      await finishCiv(state);
      stopCivTimer(guildId);
      await post(client, state, {
        content: text,
        embeds: [judgementEmbed(state)],
      });
      return;
    }

    const showBook =
      bookSig(state) !== before ||
      force ||
      state.tick % WORLD_EVERY === 0;
    setActiveCiv(state);
    await saveActiveCiv(state);
    await post(client, state, {
      content: text,
      ...(showBook ? recapPayload(state) : {}),
    });
    again("live");
  } finally {
    endTick(guildId);
    if (next && getActiveCiv(guildId)?.phase === next) {
      const wait = Math.max(0, TICK_MS - (Date.now() - started));
      scheduleCivTick(client, guildId, wait);
    }
  }
}

export async function judgeCivNow(client: Client, guildId: string): Promise<boolean> {
  const state = getActiveCiv(guildId);
  if (!state) return false;
  if (!tryBeginTick(guildId)) throw new Error("A tick is already running.");
  try {
    const kin = await liveKin(Object.keys(state.participants));
    state.awards = computeAwards(state, kin);
    await finishCiv(state);
    stopCivTimer(guildId);
    await post(client, state, { embeds: [judgementEmbed(state)] });
    return true;
  } finally {
    endTick(guildId);
  }
}
