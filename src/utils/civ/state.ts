import { hashString } from "../fighterGenerator.js";
import { createMap, PROVINCE_IDS, shuffleIds } from "./map.js";
import {
  DECREES,
  type CivLogEntry,
  type CivState,
  type DecreeId,
  type Faction,
  type Participant,
  type Province,
} from "./types.js";

const active = new Map<string, CivState>();

export function now(): string {
  return new Date().toISOString();
}

export function createCivId(): string {
  return `civ_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function pickDecree(seed: string): DecreeId {
  return DECREES[hashString(seed) % DECREES.length];
}

export function createEmptyCiv(guildId: string, channelId: string): CivState {
  const at = now();
  const id = createCivId();
  return {
    id,
    guildId,
    channelId,
    createdAt: at,
    updatedAt: at,
    phase: "factions",
    tick: 0,
    decree: pickDecree(id),
    factionsFounded: 0,
    firstFallenFactionId: null,
    spawnQueue: shuffleIds(PROVINCE_IDS, id),
    provinces: createMap(),
    participants: {},
    factions: {},
    claims: [],
    successionOmenDone: [],
    log: [{ at, kind: "created", detail: { guildId, channelId } }],
    lastLines: [],
  };
}

export function getActiveCiv(guildId: string): CivState | undefined {
  return active.get(guildId);
}

export function setActiveCiv(state: CivState): void {
  state.updatedAt = now();
  active.set(state.guildId, state);
}

export function clearActiveCiv(guildId: string): CivState | undefined {
  const s = active.get(guildId);
  active.delete(guildId);
  return s;
}

export function hasActiveCiv(guildId: string): boolean {
  return active.has(guildId);
}

export function allActiveCivs(): CivState[] {
  return [...active.values()];
}

export function appendLog(
  state: CivState,
  kind: string,
  detail?: unknown,
): void {
  const entry: CivLogEntry = { at: now(), kind };
  if (detail !== undefined) entry.detail = detail;
  state.log.push(entry);
  state.updatedAt = now();
}

export function enroll(
  state: CivState,
  userId: string,
  displayName: string,
  aura: number,
): Participant {
  const existing = state.participants[userId];
  if (existing) return existing;
  const p: Participant = {
    userId,
    displayName,
    aura,
    factionId: null,
    joinedTick: state.tick,
    silentTicks: 0,
  };
  state.participants[userId] = p;
  appendLog(state, "join", { userId, displayName, aura });
  return p;
}

export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\[[^\]]*\]\s*,?/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function uniqueMatch<T>(items: T[], pred: (t: T) => boolean): T | undefined {
  const hit = items.filter(pred);
  return hit.length === 1 ? hit[0] : undefined;
}

export function findPerson(
  state: CivState,
  q: string,
): Participant | undefined {
  const raw = q.trim();
  if (!raw) return undefined;
  if (state.participants[raw]) return state.participants[raw];
  const ping = raw.match(/^<@!?(\d+)>$/);
  if (ping && state.participants[ping[1]]) return state.participants[ping[1]];
  const people = Object.values(state.participants);
  const low = raw.toLowerCase();
  const key = nameKey(raw);
  return (
    people.find((p) => p.displayName.toLowerCase() === low) ??
    people.find((p) => nameKey(p.displayName) === key) ??
    uniqueMatch(people, (p) => nameKey(p.displayName).startsWith(key)) ??
    uniqueMatch(people, (p) => nameKey(p.displayName).includes(key)) ??
    uniqueMatch(people, (p) =>
      p.displayName.toLowerCase().split(/\s+/)[0] === low.split(/\s+/)[0],
    )
  );
}

export function findProvince(
  state: CivState,
  q: string,
): Province | undefined {
  const s = q.trim().toLowerCase();
  const key = nameKey(q);
  return (
    state.provinces.find((p) => p.id === s || p.name.toLowerCase() === s) ??
    uniqueMatch(state.provinces, (p) => nameKey(p.name).includes(key))
  );
}

export function findFaction(state: CivState, q: string): Faction | undefined {
  const s = q.trim().toLowerCase();
  if (state.factions[s]) return state.factions[s];
  const key = nameKey(q);
  const all = Object.values(state.factions);
  return (
    all.find((f) => f.name.toLowerCase() === s) ??
    uniqueMatch(all, (f) => nameKey(f.name) === key) ??
    uniqueMatch(all, (f) => nameKey(f.name).includes(key))
  );
}

export function capitalOf(
  state: CivState,
  factionId: string,
): Province | undefined {
  const f = state.factions[factionId];
  if (f?.capital) {
    const p = state.provinces.find((x) => x.id === f.capital);
    if (p) return p;
  }
  return ownedBy(state, factionId)[0];
}

export function ownedBy(state: CivState, factionId: string): Province[] {
  return state.provinces.filter((p) => p.owner === factionId);
}

export function isFree(p: Participant | undefined): boolean {
  return !!p && !p.dead && !p.bond;
}

export function bestAura(state: CivState, faction: Faction): number {
  let free = 0;
  let bound = 0;
  let ghost = 0;
  for (const id of faction.memberIds) {
    const p = state.participants[id];
    if (!p) continue;
    if (p.dead) {
      if (p.aura > ghost) ghost = p.aura;
    } else if (p.bond) {
      if (p.aura > bound) bound = p.aura;
    } else if (p.aura > free) free = p.aura;
  }
  return free || bound * 0.5 || ghost * 0.4;
}

export function factionName(state: CivState, factionId: string): string {
  return state.factions[factionId]?.name ?? factionId;
}
