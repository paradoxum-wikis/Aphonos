import { hashString } from "../fighterGenerator.js";
import { ownedBy } from "./state.js";
import type { CivAwards, CivState, KinEdge } from "./types.js";

function coin(state: CivState, salt: string, a: string, b: string): string {
  return hashString(`${state.id}:${salt}:${a}:${b}`) % 2 === 0 ? a : b;
}

function pick(
  state: CivState,
  items: { id: string; score: number }[],
  salt: string,
): string | undefined {
  if (!items.length) return undefined;
  items.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  const top = items.filter((i) => i.score === items[0].score);
  let id = top[0].id;
  for (let i = 1; i < top.length; i++) id = coin(state, salt, id, top[i].id);
  return id;
}

export function kinshipScore(
  state: CivState,
  kin: KinEdge[],
): Map<string, number> {
  const ids = Object.keys(state.participants);
  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());
  for (const e of kin) {
    adj.get(e.a)?.add(e.b);
    adj.get(e.b)?.add(e.a);
  }
  const seen = new Set<string>();
  const score = new Map<string, number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const comp: string[] = [];
    seen.add(id);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const y of adj.get(x) ?? []) {
        if (seen.has(y)) continue;
        seen.add(y);
        stack.push(y);
      }
    }
    let s = comp.length;
    const facs = new Set(
      comp
        .map((u) => state.participants[u]?.factionId)
        .filter((f): f is string => !!f),
    );
    for (const f of facs) {
      if (ownedBy(state, f).length) s += 2;
    }
    for (const u of comp) score.set(u, s);
  }
  return score;
}

function decreePick(state: CivState, kin: KinEdge[]): string | undefined {
  const factions = Object.values(state.factions);
  if (!factions.length) return undefined;
  const kinScore = kinshipScore(state, kin);
  const rows = factions.map((f) => {
    let score = 0;
    switch (state.decree) {
      case "pious":
        score = f.faith;
        break;
      case "last":
        score = ownedBy(state, f.id).length * 1000 + f.pop;
        break;
      case "blood":
        score = Math.max(0, ...f.memberIds.map((id) => kinScore.get(id) ?? 0));
        break;
      case "strong":
        score = f.marchesWon * 1000 + f.arms;
        break;
      case "compact":
        score = f.dealsHonored - f.dealsBroken;
        break;
    }
    return { id: f.id, score };
  });
  return pick(state, rows, "decree");
}

export function computeAwards(
  state: CivState,
  kin: KinEdge[],
  winnerFactionId?: string,
): CivAwards {
  const factions = Object.values(state.factions);
  const chosen = winnerFactionId ?? decreePick(state, kin);
  const hegemon = pick(
    state,
    factions.map((f) => ({
      id: f.id,
      score: ownedBy(state, f.id).length * 1000 + f.pop,
    })),
    "hegemon",
  );
  const priest = pick(
    state,
    factions.map((f) => ({ id: f.id, score: f.faith })),
    "priest",
  );
  const warmonger = pick(
    state,
    factions.map((f) => ({ id: f.id, score: f.marchesWon })),
    "warmonger",
  );
  const kinScore = kinshipScore(state, kin);
  const kinRight = pick(
    state,
    Object.values(state.participants).map((p) => ({
      id: p.userId,
      score: kinScore.get(p.userId) ?? 1,
    })),
    "kin",
  );
  return {
    chosen,
    hegemon,
    priest,
    warmonger,
    kinRight,
    fallen: state.firstFallenFactionId ?? undefined,
  };
}

export function labelFaction(state: CivState, id?: string): string {
  if (!id) return "—";
  return state.factions[id]?.name ?? id;
}
