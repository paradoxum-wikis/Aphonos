import { LockManager } from "../lockManager.js";
import { archiveCiv, loadActiveCivs, saveActiveCiv } from "./log.js";
import { seatFactions } from "./engine.js";
import {
  appendLog,
  clearActiveCiv,
  createEmptyCiv,
  getActiveCiv,
  hasActiveCiv,
  setActiveCiv,
} from "./state.js";
import { CIV_OWNER_ID, type CivPlayPhase, type CivState } from "./types.js";

const tickBusy = new Set<string>();

export function isCivOwner(userId: string): boolean {
  return userId === CIV_OWNER_ID;
}

export function tryBeginTick(guildId: string): boolean {
  if (tickBusy.has(guildId)) return false;
  tickBusy.add(guildId);
  return true;
}

export function endTick(guildId: string): void {
  tickBusy.delete(guildId);
}

export async function hydrateActiveCivs(): Promise<number> {
  let n = 0;
  for (const s of await loadActiveCivs()) {
    if (s.phase === "complete" || s.phase === "aborted") continue;
    setActiveCiv(s);
    if (!LockManager.isLocked(s.guildId, "civilization")) {
      LockManager.acquireLock(s.guildId, "civilization", []);
    }
    n++;
  }
  return n;
}

export async function startCiv(
  guildId: string,
  channelId: string,
): Promise<CivState> {
  if (hasActiveCiv(guildId) || LockManager.isLocked(guildId, "civilization")) {
    throw new Error("An Age is already running.");
  }
  if (!LockManager.acquireLock(guildId, "civilization", [])) {
    throw new Error("Could not lock the Age.");
  }
  const state = createEmptyCiv(guildId, channelId);
  setActiveCiv(state);
  await saveActiveCiv(state);
  return state;
}

export async function abortCiv(guildId: string): Promise<CivState | undefined> {
  const state = getActiveCiv(guildId);
  if (!state) {
    LockManager.releaseLock(guildId, "civilization");
    return undefined;
  }
  state.phase = "aborted";
  appendLog(state, "aborted");
  clearActiveCiv(guildId);
  LockManager.releaseLock(guildId, "civilization");
  await archiveCiv(state);
  return state;
}

export async function finishCiv(state: CivState): Promise<void> {
  state.phase = "complete";
  appendLog(state, "complete", { awards: state.awards });
  clearActiveCiv(state.guildId);
  LockManager.releaseLock(state.guildId, "civilization");
  await archiveCiv(state);
}

export async function pauseCiv(state: CivState): Promise<void> {
  if (state.phase === "factions" || state.phase === "live") {
    state.resumePhase = state.phase;
  }
  state.phase = "paused";
  appendLog(state, "paused");
  setActiveCiv(state);
  await saveActiveCiv(state);
}

export async function resumeCiv(state: CivState): Promise<CivPlayPhase> {
  const next = state.resumePhase ?? "factions";
  state.phase = next;
  state.resumePhase = undefined;
  appendLog(state, "resumed", { phase: next });
  setActiveCiv(state);
  await saveActiveCiv(state);
  return next;
}

export async function beginAge(state: CivState): Promise<string[]> {
  if (state.phase !== "factions") {
    throw new Error("The Age already began.");
  }
  const lines = seatFactions(state);
  state.phase = "live";
  state.resumePhase = undefined;
  appendLog(state, "begin", { lines });
  setActiveCiv(state);
  await saveActiveCiv(state);
  return lines;
}
