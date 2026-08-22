import { hashString } from "../fighterGenerator.js";
import { gridDist, terrainAtk, terrainDef } from "./map.js";
import { fireSetPiece } from "./setpiece.js";
import {
  appendLog,
  bestAura,
  capitalOf,
  findFaction,
  findPerson,
  findProvince,
  isFree,
  ownedBy,
} from "./state.js";
import {
  INTENTS_PER_USER,
  MAX_FACTIONS,
  REGENCY_SILENT,
  WORLD_EVERY,
  type CivState,
  type DealKind,
  type DecreeKind,
  type Development,
  type Faction,
  type IntentKind,
  type Invention,
  type KinEdge,
  type Participant,
  type PlayerIntent,
  type Province,
  type TickResult,
} from "./types.js";

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "nameless";
}

function rng(state: CivState, salt: string): number {
  return hashString(`${state.id}:${state.tick}:${salt}`) / 0xffffffff;
}

function cap(n: number, lo: number, hi = Infinity): number {
  return Math.max(lo, Math.min(hi, n));
}

function bump(
  p: Participant | undefined,
  key: "farmed" | "gathered" | "killed" | "enslaved",
  n: number,
): void {
  if (!p || n <= 0) return;
  p[key] = (p[key] ?? 0) + n;
}

export function power(state: CivState, f: Faction): number {
  const members = f.memberIds.map((id) => state.participants[id]);
  const free = members.some((p) => isFree(p));
  const living = members.some((p) => p && !p.dead);
  const p =
    Math.max(0.1, f.arms) *
    (1 + bestAura(state, f) / 200) *
    (1 + Math.max(0, f.pop) / 25);
  if (free) return p;
  if (living) return p * 0.55;
  return p * 0.4;
}

export function actorScale(p: Participant | undefined): number {
  if (!p) return 1;
  if (p.dead && p.bond === "slave") return 0.2;
  if (p.dead) return 0.4;
  if (p.bond === "slave") return 0.35;
  return 1;
}

function yieldOf(
  p: Participant | undefined,
  n: number,
  labor = false,
): number {
  if (labor && p?.bond === "slave" && !p.dead) return n;
  const s = actorScale(p);
  if (s >= 1) return n;
  return Math.max(1, Math.floor(n * s));
}

export function canDominate(state: CivState, a: Faction, b: Faction): boolean {
  if (b.arms <= 0 || b.unrest >= 80) return true;
  return power(state, a) >= power(state, b) * 1.25;
}

function sortIntents(intents: PlayerIntent[]): PlayerIntent[] {
  return [...intents].sort((a, b) => a.userId.localeCompare(b.userId));
}

function takeTwo(intents: PlayerIntent[]): PlayerIntent[] {
  const count = new Map<string, number>();
  const seen = new Set<string>();
  const out: PlayerIntent[] = [];
  for (const i of intents) {
    const sig = `${i.userId}:${i.kind}:${(i.target ?? "").toLowerCase()}`;
    if (seen.has(sig)) continue;
    const n = count.get(i.userId) ?? 0;
    if (n >= INTENTS_PER_USER) continue;
    seen.add(sig);
    count.set(i.userId, n + 1);
    out.push(i);
  }
  return out;
}

function who(state: CivState, userId: string): string {
  return state.participants[userId]?.displayName ?? userId;
}

function facOf(state: CivState, userId: string): Faction | undefined {
  const id = state.participants[userId]?.factionId;
  return id ? state.factions[id] : undefined;
}

function nearOwned(state: CivState, id: string): boolean {
  return state.provinces.some((p) => p.owner && gridDist(p.id, id) < 2);
}

function nextSpawn(state: CivState): Province | undefined {
  const take = (ok: (p: Province) => boolean) => {
    const i = state.spawnQueue.findIndex((id) => {
      const p = state.provinces.find((x) => x.id === id);
      return p && !p.owner && ok(p);
    });
    if (i < 0) return undefined;
    const id = state.spawnQueue.splice(i, 1)[0];
    return state.provinces.find((x) => x.id === id);
  };
  return (
    take((p) => !nearOwned(state, p.id)) ??
    take(() => true) ??
    state.provinces.find((p) => !p.owner && !nearOwned(state, p.id)) ??
    state.provinces.find((p) => !p.owner)
  );
}

function grantCapital(state: CivState, faction: Faction, p: Province): void {
  p.owner = faction.id;
  p.garrison = 1;
  p.development = "empty";
  if (!faction.capital) faction.capital = p.id;
}

function dissolve(state: CivState, faction: Faction, lines: string[]): void {
  for (const p of state.provinces) {
    if (p.owner !== faction.id) continue;
    p.owner = null;
    p.development = "empty";
    p.garrison = 0;
  }
  for (const id of faction.memberIds) {
    const u = state.participants[id];
    if (u) u.factionId = null;
  }
  delete state.factions[faction.id];
  lines.push(`${faction.name} is gone.`);
}

export function killPerson(
  state: CivState,
  victim: Participant,
  killerId: string | undefined,
  lines: string[],
  how: string,
): void {
  if (victim.dead) return;
  victim.dead = true;
  if (killerId) {
    victim.killedBy = killerId;
    bump(state.participants[killerId], "killed", 1);
  }
  const fac = victim.factionId ? state.factions[victim.factionId] : undefined;
  if (fac) {
    fac.pop = cap(fac.pop - 1, 0);
    fac.food = cap(fac.food - 1, 0);
    fac.arms = cap(fac.arms - 1, 0);
  }
  lines.push(how);
}

export function absorbFaction(
  state: CivState,
  survivor: Faction,
  victim: Faction,
  lines: string[],
  how?: string,
): void {
  if (survivor.id === victim.id) return;
  if (!state.factions[survivor.id] || !state.factions[victim.id]) return;
  for (const id of victim.memberIds) {
    if (!survivor.memberIds.includes(id)) survivor.memberIds.push(id);
    const u = state.participants[id];
    if (u) u.factionId = survivor.id;
  }
  survivor.food += victim.food;
  survivor.material += victim.material;
  survivor.faith += victim.faith;
  survivor.arms += victim.arms;
  survivor.pop += victim.pop;
  survivor.marchesWon += victim.marchesWon;
  survivor.dealsHonored += victim.dealsHonored;
  for (const p of state.provinces) {
    if (p.owner === victim.id) p.owner = survivor.id;
  }
  if (!survivor.capital) survivor.capital = victim.capital;
  delete state.factions[victim.id];
  lines.push(how ?? `${victim.name} is swallowed by ${survivor.name}.`);
}

export function movePerson(
  state: CivState,
  person: Participant,
  to: Faction,
  slave: boolean,
  lines: string[],
): void {
  if (!state.factions[to.id]) return;
  const from = person.factionId ? state.factions[person.factionId] : undefined;
  if (from?.id === to.id) {
    const was = person.bond === "slave";
    person.bond = slave ? "slave" : undefined;
    if (was && !slave && !person.dead) to.pop += 1;
    if (!was && slave && !person.dead) to.pop = cap(to.pop - 1, 0);
    return;
  }
  if (from) {
    from.memberIds = from.memberIds.filter((id) => id !== person.userId);
    if (!person.bond && !person.dead) from.pop = cap(from.pop - 1, 0);
    if (from.founderId === person.userId) {
      const next =
        from.memberIds.find((id) => isFree(state.participants[id])) ??
        from.memberIds[0];
      if (next) from.founderId = next;
    }
    if (!from.memberIds.length) dissolve(state, from, lines);
  }
  if (!to.memberIds.includes(person.userId)) to.memberIds.push(person.userId);
  person.factionId = to.id;
  person.bond = slave ? "slave" : undefined;
  if (!slave && !person.dead) to.pop += 1;
}

function takeSlaves(
  state: CivState,
  winner: Faction,
  loser: Faction,
  lines: string[],
  all: boolean,
  by?: Participant,
): void {
  if (!state.factions[winner.id] || !state.factions[loser.id]) return;
  const prey = loser.memberIds
    .map((id) => state.participants[id])
    .filter((p): p is Participant => !!p && !p.dead && p.bond !== "slave");
  if (!prey.length) return;
  const n = all ? prey.length : 1;
  const taken: string[] = [];
  for (let i = 0; i < n && prey.length; i++) {
    const idx =
      hashString(`${state.id}:${state.tick}:slave:${loser.id}:${i}`) %
      prey.length;
    const person = prey.splice(idx, 1)[0];
    movePerson(state, person, winner, true, lines);
    taken.push(person.displayName);
  }
  if (taken.length) {
    bump(by, "enslaved", taken.length);
    lines.push(`${taken.join(", ")} enslaved by ${winner.name}.`);
  }
}

function loseProvince(
  state: CivState,
  faction: Faction,
  p: Province,
  kin: KinEdge[],
  lines: string[],
  attacker?: Faction,
  by?: Participant,
): void {
  const wasCapital = faction.capital === p.id;
  p.owner = null;
  p.development = "empty";
  p.garrison = 0;
  const still = ownedBy(state, faction.id);
  if (wasCapital) {
    if (!state.firstFallenFactionId) state.firstFallenFactionId = faction.id;
    faction.capital = still[0]?.id ?? null;
    const until = state.tick + 1;
    for (const mid of faction.memberIds) {
      for (const k of kin) {
        if (k.type === "spouse") {
          const other = k.a === mid ? k.b : k.b === mid ? k.a : null;
          if (!other) continue;
          const of = facOf(state, other);
          if (of && of.id !== faction.id && ownedBy(state, of.id).length) {
            state.claims.push({
              provinceId: p.id,
              untilTick: until,
              kind: "spouse-settle",
              userId: other,
              factionId: of.id,
            });
          }
        }
        if (k.type !== "parent" || k.a !== mid) continue;
        const child = k.b;
        if (state.participants[child] && !state.participants[child].factionId) {
          state.claims.push({
            provinceId: p.id,
            untilTick: until,
            kind: "heir-found",
            userId: child,
          });
        }
      }
    }
  }
  if (!still.length) {
    faction.capital = null;
    if (attacker && state.factions[attacker.id]) {
      takeSlaves(state, attacker, faction, lines, true, by);
      if (state.factions[faction.id]) {
        absorbFaction(
          state,
          attacker,
          faction,
          lines,
          `${faction.name} is annexed by ${attacker.name}.`,
        );
      }
    } else {
      dissolve(state, faction, lines);
    }
  }
}

function adjacentOwned(
  state: CivState,
  factionId: string,
  target: Province,
): boolean {
  return target.neighbors.some((id) => {
    const n = state.provinces.find((p) => p.id === id);
    return n?.owner === factionId;
  });
}

function canSpouseSettle(
  state: CivState,
  faction: Faction,
  userId: string,
  target: Province,
): boolean {
  return state.claims.some(
    (c) =>
      c.kind === "spouse-settle" &&
      c.provinceId === target.id &&
      c.untilTick >= state.tick &&
      c.factionId === faction.id &&
      c.userId === userId,
  );
}

function startingFaith(aura: number): number {
  return 2 + Math.max(0, Math.floor(aura / 25));
}

function doFound(
  state: CivState,
  intent: PlayerIntent,
  lines: string[],
): void {
  const p = state.participants[intent.userId];
  if (!p || p.factionId) {
    lines.push(`${who(state, intent.userId)} can't found.`);
    return;
  }
  const name = (intent.target ?? intent.note ?? "").trim();
  if (!name) {
    lines.push(`${p.displayName} named nothing.`);
    return;
  }
  if (findFaction(state, name)) {
    lines.push(`${name} already exists.`);
    return;
  }
  if (Object.keys(state.factions).length >= MAX_FACTIONS) {
    lines.push(`${p.displayName} can't found. Four banners already.`);
    return;
  }
  let id = `f_${slug(name)}`;
  let n = 2;
  while (state.factions[id]) id = `f_${slug(name)}${n++}`;

  const f: Faction = {
    id,
    name,
    founderId: p.userId,
    memberIds: [p.userId],
    capital: null,
    food: 8,
    material: 6,
    faith: startingFaith(p.aura),
    arms: 2,
    pop: 6,
    unrest: 0,
    marchesWon: 0,
    dealsHonored: 0,
    dealsBroken: 0,
  };
  state.factions[id] = f;
  p.factionId = id;
  state.factionsFounded++;
  if (state.phase === "factions") {
    lines.push(`${p.displayName} founds ${name}.`);
    return;
  }
  const heirClaim = state.claims.find(
    (c) =>
      c.kind === "heir-found" &&
      c.userId === p.userId &&
      c.untilTick >= state.tick,
  );
  const heir = heirClaim
    ? state.provinces.find((x) => x.id === heirClaim.provinceId && !x.owner)
    : undefined;
  const seat = heir ?? nextSpawn(state);
  if (seat) {
    grantCapital(state, f, seat);
    lines.push(`${p.displayName} founds ${name} at ${seat.name}.`);
  } else {
    lines.push(`${p.displayName} founds landless ${name}.`);
  }
}

export function seatFactions(state: CivState): string[] {
  const lines: string[] = [];
  for (const f of Object.values(state.factions)) {
    if (f.capital || ownedBy(state, f.id).length) continue;
    const seat = nextSpawn(state);
    if (seat) {
      grantCapital(state, f, seat);
      lines.push(`${f.name} is seated at ${seat.name}.`);
    } else {
      lines.push(`${f.name} stays landless.`);
    }
  }
  return lines;
}

function doJoin(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const p = state.participants[intent.userId];
  const q = (intent.target ?? "").trim();
  const dest = q ? findFaction(state, q) : undefined;
  if (!p || !dest) {
    lines.push(`${who(state, intent.userId)} joined nothing.`);
    return;
  }
  if (p.factionId === dest.id) {
    if (p.bond === "slave") {
      p.bond = undefined;
      if (!p.dead) dest.pop += 1;
      lines.push(`${p.displayName} is no longer a slave of ${dest.name}.`);
      return;
    }
    lines.push(`${p.displayName} already flies ${dest.name}.`);
    return;
  }
  if (p.bond === "slave") {
    if (rng(state, `escape:${p.userId}`) > actorScale(p) * 0.55) {
      lines.push(`${p.displayName} fails to escape and join ${dest.name}.`);
      return;
    }
  }
  movePerson(state, p, dest, false, lines);
  lines.push(`${p.displayName} joins ${dest.name}.`);
}

function doLeave(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const p = state.participants[intent.userId];
  const f = p ? facOf(state, p.userId) : undefined;
  if (!p || !f) {
    lines.push(`${who(state, intent.userId)} has no faction to drop.`);
    return;
  }
  if (p.bond === "slave") {
    if (rng(state, `escape:${p.userId}`) > actorScale(p) * 0.5) {
      lines.push(`${p.displayName} fails to escape ${f.name}.`);
      return;
    }
    p.bond = undefined;
  }
  f.memberIds = f.memberIds.filter((id) => id !== p.userId);
  if (!p.dead) f.pop = cap(f.pop - 1, 0);
  p.factionId = null;
  if (!f.memberIds.length) {
    dissolve(state, f, lines);
    return;
  }
  if (f.founderId === p.userId) {
    f.founderId =
      f.memberIds.find((id) => isFree(state.participants[id])) ?? f.memberIds[0];
  }
  lines.push(`${p.displayName} leaves ${f.name}.`);
}

function contestPull(
  state: CivState,
  atk: Faction,
  def: Faction | undefined,
  actor: Participant,
): boolean {
  if (!def) return true;
  const pWin = Math.min(
    0.85,
    Math.max(
      0.12,
      (power(state, atk) * actorScale(actor)) /
        (power(state, atk) * actorScale(actor) + power(state, def)),
    ),
  );
  return rng(state, `pull:${atk.id}:${def.id}:${actor.userId}`) < pWin;
}

function doRecruit(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const actor = state.participants[intent.userId];
  const mine = actor ? facOf(state, actor.userId) : undefined;
  const mark = findPerson(state, intent.target ?? "");
  if (!actor || !mine || !mark) {
    lines.push(`${who(state, intent.userId)} recruits fog.`);
    return;
  }
  if (mark.factionId === mine.id && mark.bond !== "slave") {
    lines.push(`${mark.displayName} already flies ${mine.name}.`);
    return;
  }
  const theirs = mark.factionId ? state.factions[mark.factionId] : undefined;
  if (theirs && !contestPull(state, mine, theirs, actor)) {
    lines.push(
      `${mine.name} fails to recruit ${mark.displayName} from ${theirs.name}.`,
    );
    return;
  }
  movePerson(state, mark, mine, false, lines);
  lines.push(`${mark.displayName} is recruited into ${mine.name}.`);
}

function doEnslave(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const actor = state.participants[intent.userId];
  const mine = actor ? facOf(state, actor.userId) : undefined;
  const mark = findPerson(state, intent.target ?? "");
  if (!actor || !mine || !mark) {
    lines.push(`${who(state, intent.userId)} enslaves fog.`);
    return;
  }
  if (actor.bond === "slave") {
    lines.push(`${actor.displayName} is in chains and cannot take slaves.`);
    return;
  }
  if (mark.userId === actor.userId) {
    lines.push(`${actor.displayName} cannot enslave themselves.`);
    return;
  }
  const theirs = mark.factionId ? state.factions[mark.factionId] : undefined;
  if (theirs && theirs.id !== mine.id && !contestPull(state, mine, theirs, actor)) {
    lines.push(`${mine.name} fails to enslave ${mark.displayName}.`);
    return;
  }
  movePerson(state, mark, mine, true, lines);
  bump(actor, "enslaved", 1);
  lines.push(`${mark.displayName} is enslaved by ${mine.name}.`);
}

function doFree(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const actor = state.participants[intent.userId];
  const mine = actor ? facOf(state, actor.userId) : undefined;
  const mark = findPerson(state, intent.target ?? "");
  if (!actor || !mine || !mark) {
    lines.push(`${who(state, intent.userId)} frees fog.`);
    return;
  }
  if (mark.factionId !== mine.id || mark.bond !== "slave") {
    lines.push(`${mark.displayName} is not ${mine.name}'s slave.`);
    return;
  }
  if (actor.bond === "slave" && actor.userId !== mark.userId) {
    lines.push(`${actor.displayName} cannot free others.`);
    return;
  }
  mark.bond = undefined;
  if (!mark.dead) mine.pop += 1;
  lines.push(`${mark.displayName} is freed by ${mine.name}.`);
}

const BUILD: Record<string, { to: Development; material: number; food: number; faith: number }> = {
  "empty>farm": { to: "farm", material: 3, food: 2, faith: 0 },
  "farm>fort": { to: "fort", material: 4, food: 2, faith: 0 },
  "farm>temple": { to: "temple", material: 3, food: 0, faith: 3 },
  "farm>workshop": { to: "workshop", material: 4, food: 0, faith: 0 },
  "fort>walls": { to: "walls", material: 5, food: 0, faith: 0 },
};

function wantedBuild(note?: string): Development | undefined {
  const s = (note ?? "").toLowerCase();
  if (
    s.includes("farm") ||
    s.includes("hamlet") ||
    s.includes("potato") ||
    s.includes("wheat") ||
    s.includes("crop") ||
    s.includes("weed") ||
    s.includes("plant") ||
    s.includes("harvest")
  )
    return "farm";
  if (
    s.includes("temple") ||
    s.includes("shrine") ||
    s.includes("church") ||
    s.includes("cathedral") ||
    s.includes("mosque")
  )
    return "temple";
  if (
    s.includes("workshop") ||
    s.includes("forge") ||
    s.includes("factory") ||
    s.includes("smith")
  )
    return "workshop";
  if (s.includes("wall")) return "walls";
  if (
    s.includes("fort") ||
    s.includes("hold") ||
    s.includes("castle") ||
    s.includes("keep")
  )
    return "fort";
  return undefined;
}

function doBuild(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const f = facOf(state, intent.userId);
  if (!f) {
    lines.push(`${who(state, intent.userId)} builds for no one.`);
    return;
  }
  const p =
    (intent.target ? findProvince(state, intent.target) : undefined) ??
    (f.capital
      ? state.provinces.find((x) => x.id === f.capital)
      : undefined);
  if (!p || p.owner !== f.id) {
    lines.push(`${f.name} has no such yard.`);
    return;
  }
  const want = wantedBuild(intent.note);
  const key = want ? `${p.development}>${want}` : undefined;
  if (want === "farm" && p.development !== "empty") {
    const actor = state.participants[intent.userId];
    const got = yieldOf(actor, 2, true);
    f.food += got;
    bump(actor, "farmed", got);
    lines.push(`${f.name} farms ${p.name}. +${got} food.`);
    return;
  }
  const spec = key ? BUILD[key] : Object.entries(BUILD).find(([k]) =>
    k.startsWith(`${p.development}>`),
  )?.[1];
  if (!spec) {
    if (/\bfarm|wheat|crop/i.test(intent.note ?? "")) {
      const actor = state.participants[intent.userId];
      const got = yieldOf(actor, 2, true);
      f.food += got;
      bump(actor, "farmed", got);
      lines.push(`${f.name} farms ${p.name}. +${got} food.`);
      return;
    }
    lines.push(`${p.name} stays ${p.development}.`);
    return;
  }
  if (f.material < spec.material || f.food < spec.food || f.faith < spec.faith) {
    lines.push(`${f.name} can't afford ${spec.to} at ${p.name}.`);
    return;
  }
  f.material -= spec.material;
  f.food -= spec.food;
  f.faith -= spec.faith;
  p.development = spec.to;
  lines.push(`${f.name} raises a ${spec.to} at ${p.name}.`);
}

function doSettle(
  state: CivState,
  intent: PlayerIntent,
  lines: string[],
): void {
  const f = facOf(state, intent.userId);
  if (!f) {
    lines.push(`${who(state, intent.userId)} settles for no one.`);
    return;
  }
  const p = intent.target ? findProvince(state, intent.target) : undefined;
  if (!p) {
    lines.push(`${who(state, intent.userId)} pointed at fog.`);
    return;
  }
  if (p.owner) {
    lines.push(`${p.name} is taken.`);
    return;
  }
  const ok =
    adjacentOwned(state, f.id, p) ||
    canSpouseSettle(state, f, intent.userId, p);
  if (!ok) {
    lines.push(`${f.name} can't reach ${p.name}.`);
    return;
  }
  if (f.food < 2 || f.material < 1 || f.arms < 1) {
    lines.push(`${f.name} is too poor to take ${p.name}.`);
    return;
  }
  f.food -= 2;
  f.material -= 1;
  f.arms -= 1;
  p.owner = f.id;
  p.garrison = 1;
  p.development = "empty";
  if (!f.capital) f.capital = p.id;
  lines.push(`${f.name} takes ${p.name}.`);
}

function doMuster(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const f = facOf(state, intent.userId);
  if (!f) {
    lines.push(`${who(state, intent.userId)} musters for no one.`);
    return;
  }
  if (f.food < 2 || f.material < 1) {
    lines.push(`${f.name} can't muster.`);
    return;
  }
  f.food -= 2;
  f.material -= 1;
  const got = yieldOf(state.participants[intent.userId], 2);
  f.arms += got;
  lines.push(`${f.name} musters (+${got} arms).`);
}

function parseDeal(note?: string): DealKind {
  const s = (note ?? "").toLowerCase();
  if (s.includes("merge") || s.includes("annex") || s.includes("absorb"))
    return "merge";
  if (s.includes("trade")) return "trade";
  return "nap";
}

function doDeals(
  state: CivState,
  intents: PlayerIntent[],
  kin: KinEdge[],
  lines: string[],
): void {
  const deals = intents.filter((i) => i.kind === "deal");
  const used = new Set<string>();
  for (const i of deals) {
    const key = `${i.userId}:${i.target}`;
    if (used.has(key)) continue;
    const a = facOf(state, i.userId);
    const b = i.target ? findFaction(state, i.target) : undefined;
    if (!a || !b || a.id === b.id) {
      lines.push(`${who(state, i.userId)} dealt with a ghost.`);
      a && (a.dealsBroken += 1);
      continue;
    }
    const kind = parseDeal(i.note);
    used.add(key);
    a.dealsHonored += 1;
    if (kind === "merge") {
      if (!canDominate(state, a, b)) {
        a.dealsBroken += 1;
        lines.push(
          `${b.name} refuses the merger. ${a.name} is not strong enough.`,
        );
        continue;
      }
      absorbFaction(
        state,
        a,
        b,
        lines,
        `${b.name} is merged into ${a.name}.`,
      );
      continue;
    }
    if (kind === "trade") {
      const give = Math.min(2, a.food);
      const take = Math.min(2, b.material);
      a.food -= give;
      b.food += give;
      b.material -= take;
      a.material += take;
      lines.push(`${a.name} trades with ${b.name}.`);
      continue;
    }
    lines.push(`${a.name} and ${b.name} swear a nap.`);
  }
}

function doDecree(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const f = facOf(state, intent.userId);
  if (!f) {
    lines.push(`${who(state, intent.userId)} decrees for no one.`);
    return;
  }
  const kind = ((intent.note ?? intent.target ?? "").toLowerCase() ||
    "festival") as string;
  const action: DecreeKind = kind.includes("kick")
    ? "kick"
    : kind.includes("conscript")
      ? "conscript"
      : kind.includes("ration")
        ? "rations"
        : "festival";
  if (action === "kick") {
    if (f.founderId !== intent.userId) {
      lines.push(`${who(state, intent.userId)} is not the founder.`);
      return;
    }
    const target = intent.target
      ? findPerson(state, intent.target)
      : undefined;
    if (!target || target.factionId !== f.id || target.userId === f.founderId) {
      lines.push(`Kick missed.`);
      return;
    }
    f.memberIds = f.memberIds.filter((id) => id !== target.userId);
    target.factionId = null;
    lines.push(`${target.displayName} is kicked from ${f.name}.`);
    return;
  }
  if (action === "festival") {
    if (f.food < 3) {
      lines.push(`${f.name} can't feast.`);
      return;
    }
    f.food -= 3;
    f.unrest = cap(f.unrest - 15, 0, 100);
    lines.push(`${f.name} throws a festival.`);
    return;
  }
  if (action === "conscript") {
    f.unrest = cap(f.unrest + 10, 0, 100);
    f.arms += 2;
    lines.push(`${f.name} conscripts.`);
    return;
  }
  f.unrest = cap(f.unrest + 8, 0, 100);
  f.food += 3;
  lines.push(`${f.name} scrapes rations.`);
}

function resolveAttackTile(
  state: CivState,
  target?: string,
): Province | undefined {
  if (!target) return undefined;
  const tile = findProvince(state, target);
  if (tile) return tile;
  const person = findPerson(state, target);
  if (person?.factionId) return capitalOf(state, person.factionId);
  const fac = findFaction(state, target);
  if (fac) return capitalOf(state, fac.id);
  return undefined;
}

function doEat(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const actor = state.participants[intent.userId];
  const f = actor ? facOf(state, actor.userId) : undefined;
  if (!actor || !f) {
    lines.push(`${who(state, intent.userId)} has no faction to eat for.`);
    return;
  }
  const label = (intent.target ?? "someone").trim();
  const victim = findPerson(state, label);
  if (!victim) {
    const other = findFaction(state, label);
    if (other && other.id !== f.id) {
      const pWin = Math.min(
        0.9,
        Math.max(
          0.1,
          (power(state, f) * actorScale(actor)) /
            (power(state, f) * actorScale(actor) + power(state, other)),
        ),
      );
      if (rng(state, `steal:${f.id}:${other.id}`) > pWin) {
        lines.push(
          `${actor.displayName} tries to steal from ${other.name} and gets run off.`,
        );
        return;
      }
      const took = yieldOf(actor, Math.min(3, other.food));
      other.food -= took;
      f.food += took;
      bump(actor, "gathered", took);
      lines.push(
        `${actor.displayName} steals ${took} food from ${other.name}.`,
      );
      return;
    }
    if (f.food < 1) {
      lines.push(`${actor.displayName} finds no food to eat.`);
      return;
    }
    f.food -= 1;
    f.unrest = cap(f.unrest - 3, 0, 100);
    lines.push(`${actor.displayName} eats the stores. ${f.name} −1 food.`);
    return;
  }
  if (victim.dead) {
    lines.push(
      `${victim.displayName} is already a ghost. They still haunt.`,
    );
    return;
  }
  if (victim.userId === actor.userId) {
    lines.push(`${actor.displayName} chews their own sleeve. Nothing happens.`);
    return;
  }
  if (victim.factionId === f.id) {
    const got = yieldOf(actor, 2);
    f.food += got;
    f.unrest = cap(f.unrest + 12, 0, 100);
    killPerson(
      state,
      victim,
      actor.userId,
      lines,
      `${actor.displayName} eats ${victim.displayName}. They linger as a ghost. ${f.name} +${got} food.`,
    );
    return;
  }
  const them = victim.factionId
    ? state.factions[victim.factionId]
    : undefined;
  const theirPower = them ? power(state, them) : 0.5;
  const pWin = Math.min(
    0.92,
    Math.max(
      0.08,
      (power(state, f) * actorScale(actor)) /
        (power(state, f) * actorScale(actor) + theirPower),
    ),
  );
  if (rng(state, `kill:${actor.userId}:${victim.userId}`) > pWin) {
    lines.push(
      `${actor.displayName} fails to kill ${victim.displayName} (${Math.round(pWin * 100)}%).`,
    );
    return;
  }
  f.food += 1;
  killPerson(
    state,
    victim,
    actor.userId,
    lines,
    `${actor.displayName} kills ${victim.displayName} (${Math.round(pWin * 100)}%). They linger as a ghost.`,
  );
}

function doAnnex(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const f = facOf(state, intent.userId);
  const raw = (intent.target ?? intent.note ?? "").trim();
  const victim =
    (raw ? findFaction(state, raw) : undefined) ??
    (() => {
      const person = raw ? findPerson(state, raw) : undefined;
      return person?.factionId
        ? state.factions[person.factionId]
        : undefined;
    })();
  if (!f || !victim || victim.id === f.id) {
    lines.push(`${who(state, intent.userId)} annexes fog.`);
    return;
  }
  if (!canDominate(state, f, victim)) {
    lines.push(
      `${f.name} is too weak to annex ${victim.name} (arms ${f.arms} vs ${victim.arms}).`,
    );
    return;
  }
  absorbFaction(
    state,
    f,
    victim,
    lines,
    `${victim.name} is annexed by ${f.name}.`,
  );
}

function doSpy(state: CivState, intent: PlayerIntent, lines: string[]): void {
  const actor = state.participants[intent.userId];
  const label = (intent.target ?? "").trim();
  const person = label ? findPerson(state, label) : undefined;
  const fac =
    (person?.factionId ? state.factions[person.factionId] : undefined) ??
    (label ? findFaction(state, label) : undefined);
  if (!actor || !fac) {
    lines.push(
      `${who(state, intent.userId)} spies on ${label || "fog"} and learns nothing.`,
    );
    return;
  }
  const land = ownedBy(state, fac.id).length;
  lines.push(
    `${actor.displayName} spies on ${person?.displayName ?? fac.name}: ${fac.name} · ${land} land · food ${fac.food} · arms ${fac.arms} · pop ${fac.pop} · unrest ${fac.unrest}.`,
  );
}

function doMarch(
  state: CivState,
  intent: PlayerIntent,
  kin: KinEdge[],
  lines: string[],
): void {
  const f = facOf(state, intent.userId);
  if (!f) {
    lines.push(`${who(state, intent.userId)} marches for no one.`);
    return;
  }
  const p = resolveAttackTile(state, intent.target);
  if (!p) {
    lines.push(
      `${f.name} marched at ${intent.target ?? "nothing"} and hit fog.`,
    );
    return;
  }
  const landless = !ownedBy(state, f.id).length;
  const enemy = !!(p.owner && p.owner !== f.id);
  const reach =
    landless || enemy || adjacentOwned(state, f.id, p) || p.owner === f.id;
  if (!reach) {
    lines.push(`${f.name} can't march on ${p.name}.`);
    return;
  }
  if (p.owner === f.id) {
    lines.push(`${f.name} parades through ${p.name}.`);
    return;
  }
  if (!p.owner) {
    if (f.arms < 1) {
      lines.push(`${f.name} has no host.`);
      return;
    }
    f.arms -= 1;
    p.owner = f.id;
    p.garrison = 1;
    if (!f.capital) f.capital = p.id;
    f.marchesWon += 1;
    lines.push(`${f.name} seizes empty ${p.name}.`);
    return;
  }
  const def = state.factions[p.owner];
  if (!def) {
    p.owner = null;
    return;
  }
  if (f.arms < 1) {
    lines.push(`${f.name} has no host.`);
    return;
  }
  if (def.arms <= 0) {
    loseProvince(state, def, p, kin, lines, f, state.participants[intent.userId]);
    p.owner = f.id;
    p.garrison = 1;
    if (!f.capital) f.capital = p.id;
    f.marchesWon += 1;
    lines.push(`${f.name} walks into empty ${p.name}.`);
    if (state.factions[def.id])
      takeSlaves(state, f, def, lines, false, state.participants[intent.userId]);
    return;
  }
  const atk =
    power(state, f) *
    terrainAtk(p.terrain) *
    actorScale(state.participants[intent.userId]);
  const dfn =
    power(state, def) * terrainDef(p.terrain, p.development);
  const chance = Math.min(0.92, Math.max(0.08, atk / (atk + dfn)));
  const roll = rng(state, `atk:${p.id}`);
  if (roll < chance) {
    def.arms = Math.floor(def.arms * 0.4);
    f.arms = Math.max(0, Math.floor(f.arms * 0.85) - 1);
    loseProvince(state, def, p, kin, lines, f, state.participants[intent.userId]);
    p.owner = f.id;
    p.garrison = 1;
    if (!f.capital) f.capital = p.id;
    f.marchesWon += 1;
    lines.push(
      `${f.name} takes ${p.name} from ${def.name} (${Math.round(chance * 100)}%).`,
    );
    if (state.factions[def.id])
      takeSlaves(state, f, def, lines, false, state.participants[intent.userId]);
  } else {
    f.arms = Math.floor(f.arms * 0.4);
    def.arms = Math.floor(def.arms * 0.85);
    lines.push(
      `${f.name} breaks on ${p.name} (${Math.round(chance * 100)}% was the shot).`,
    );
    if (state.factions[f.id]) takeSlaves(state, def, f, lines, false);
  }
}

const HARVEST: Record<string, { food: number; material: number; faith: number }> = {
  plain: { food: 2, material: 0, faith: 0 },
  grove: { food: 1, material: 1, faith: 0 },
  coast: { food: 1, material: 1, faith: 0 },
  high: { food: 0, material: 1, faith: 0 },
  waste: { food: 0, material: 1, faith: 0 },
};

function worldTick(state: CivState, lines: string[]): void {
  if (state.tick % WORLD_EVERY !== 0) return;
  for (const f of Object.values(state.factions)) {
    const members = f.memberIds.map((id) => state.participants[id]).filter(Boolean);
    const regency =
      members.length > 0 && members.every((m) => m.silentTicks >= REGENCY_SILENT);
    const land = ownedBy(state, f.id);
    let food = 0;
    let material = 0;
    let faith = 0;
    for (const p of land) {
      const h = HARVEST[p.terrain];
      food += h.food;
      material += h.material;
      faith += h.faith;
      if (p.development === "farm") food += 1;
      if (p.development === "temple") faith += 1;
      if (p.development === "workshop") material += 1;
    }
    if (regency) {
      food = Math.floor(food / 2);
      material = Math.floor(material / 2);
      f.unrest = cap(f.unrest + 5, 0, 100);
      lines.push(`${f.name} is under regency.`);
    }
    const slaves = members.filter((m) => m.bond === "slave" && !m.dead).length;
    if (slaves) {
      food += slaves;
      lines.push(`${f.name}'s slaves work (+${slaves} food).`);
    }
    f.food += food;
    f.material += material;
    f.faith += faith;
    const upkeep = Math.ceil(f.arms / 4) + Math.ceil(f.pop / 3);
    f.food -= upkeep;
    if (f.food < 0) {
      f.food = 0;
      f.pop = cap(f.pop - 1, 1);
      f.unrest = cap(f.unrest + 10, 0, 100);
      f.arms = cap(f.arms - 1, 0);
      lines.push(`${f.name} starves.`);
    }
    if (state.tick % 24 === 0 && f.food >= 6 && f.unrest < 40) f.pop += 1;
    if (f.unrest >= 100) {
      f.pop = cap(f.pop - 2, 1);
      f.arms = cap(f.arms - 2, 0);
      f.unrest = 70;
      lines.push(`${f.name} riots.`);
    }
  }
}

function siblingOmen(state: CivState, kin: KinEdge[], lines: string[]): void {
  for (const k of kin) {
    if (k.type !== "sibling") continue;
    const pair = [k.a, k.b].sort().join("|");
    if (state.successionOmenDone.includes(pair)) continue;
    const fa = facOf(state, k.a);
    const fb = facOf(state, k.b);
    if (!fa || !fb || fa.id === fb.id) continue;
    if (fa.founderId !== k.a && fa.founderId !== k.b) continue;
    if (fb.founderId !== k.a && fb.founderId !== k.b) continue;
    if (!ownedBy(state, fa.id).length || !ownedBy(state, fb.id).length) continue;
    state.successionOmenDone.push(pair);
    fa.unrest = cap(fa.unrest + 8, 0, 100);
    fb.unrest = cap(fb.unrest + 8, 0, 100);
    lines.push(`Blood sours between ${fa.name} and ${fb.name}.`);
  }
}

function rollOmen(
  state: CivState,
  prays: string[],
  lines: string[],
): string | undefined {
  const piece = fireSetPiece(state);
  if (piece) lines.push(piece);
  for (const id of prays) {
    const f = state.factions[id];
    if (!f) continue;
    f.faith += 1;
    lines.push(`${f.name}'s prayer is noticed. +1 faith.`);
  }
  return piece;
}

export function checkWin(state: CivState): string | undefined {
  if (state.factionsFounded < 2) return undefined;
  const ids = Object.keys(state.factions);
  if (ids.length === 1) return ids[0];
  return undefined;
}

export const PLAY: IntentKind[] = [
  "found",
  "join",
  "leave",
  "settle",
  "build",
  "muster",
  "march",
  "deal",
  "decree",
  "pray",
  "eat",
  "spy",
  "annex",
  "recruit",
  "enslave",
  "free",
  "speak",
];

const LOBBY: IntentKind[] = ["found", "join", "leave"];

export function resolveLobby(
  state: CivState,
  rawIntents: PlayerIntent[],
): TickResult {
  const intents = takeTwo(
    sortIntents(
      rawIntents.filter(
        (i) =>
          state.participants[i.userId] &&
          LOBBY.includes(i.kind),
      ),
    ),
  );
  const lines: string[] = [];
  for (const i of intents.filter((x) => x.kind === "found"))
    doFound(state, i, lines);
  for (const i of intents.filter((x) => x.kind === "join"))
    doJoin(state, i, lines);
  for (const i of intents.filter((x) => x.kind === "leave"))
    doLeave(state, i, lines);
  state.lastLines = lines.slice(-8);
  appendLog(state, "lobby", { lines });
  return { tick: state.tick, lines, joins: [] };
}

export function resolveTick(
  state: CivState,
  rawIntents: PlayerIntent[],
  kin: KinEdge[],
  inventions: Invention[] = [],
): TickResult {
  state.tick += 1;
  state.claims = state.claims.filter((c) => c.untilTick >= state.tick);

  const intents = takeTwo(
    sortIntents(
      rawIntents.filter(
        (i) =>
          state.participants[i.userId] &&
          PLAY.includes(i.kind),
      ),
    ),
  );
  const speakers = new Set(intents.map((i) => i.userId));
  for (const p of Object.values(state.participants)) {
    p.silentTicks = speakers.has(p.userId) ? 0 : p.silentTicks + 1;
  }

  const lines: string[] = [];
  const of = (k: IntentKind) => intents.filter((i) => i.kind === k);

  for (const i of of("found")) doFound(state, i, lines);
  for (const i of of("join")) doJoin(state, i, lines);
  for (const i of of("leave")) doLeave(state, i, lines);
  for (const i of of("recruit")) doRecruit(state, i, lines);
  for (const i of of("enslave")) doEnslave(state, i, lines);
  for (const i of of("free")) doFree(state, i, lines);

  const prays: string[] = [];
  for (const i of of("decree")) doDecree(state, i, lines);
  for (const i of of("pray")) {
    const f = facOf(state, i.userId);
    if (!f || f.faith < 2) {
      lines.push(`${who(state, i.userId)} prays dry.`);
      continue;
    }
    f.faith -= 2;
    prays.push(f.id);
    lines.push(`${f.name} prays.`);
  }

  for (const i of of("build")) doBuild(state, i, lines);
  for (const i of of("settle")) doSettle(state, i, lines);
  doDeals(state, of("deal"), kin, lines);
  for (const i of of("muster")) doMuster(state, i, lines);
  for (const i of of("eat")) doEat(state, i, lines);
  for (const i of of("annex")) doAnnex(state, i, lines);
  for (const i of of("spy")) doSpy(state, i, lines);
  for (const i of of("march")) doMarch(state, i, kin, lines);

  worldTick(state, lines);
  siblingOmen(state, kin, lines);
  const omen = rollOmen(state, prays, lines);
  applyInventions(state, inventions, lines);
  const winnerFactionId = checkWin(state);

  state.lastLines = lines.slice(-8);
  appendLog(state, "tick", {
    tick: state.tick,
    lines,
    omen,
    winnerFactionId,
  });
  return { tick: state.tick, lines, omen, winnerFactionId, joins: [] };
}

function applyInventions(
  state: CivState,
  inventions: Invention[],
  lines: string[],
): void {
  for (const inv of inventions) {
    const line = (inv.line ?? "").trim();
    const actor = inv.userId ? state.participants[inv.userId] : undefined;
    const f = actor?.factionId ? state.factions[actor.factionId] : undefined;
    if (f) {
      f.food = Math.max(0, f.food + (inv.food ?? 0));
      f.material = Math.max(0, f.material + (inv.material ?? 0));
      bump(
        actor,
        "gathered",
        Math.max(0, inv.food ?? 0) + Math.max(0, inv.material ?? 0),
      );
      f.faith = Math.max(0, f.faith + (inv.faith ?? 0));
      f.arms = Math.max(0, f.arms + (inv.arms ?? 0));
      f.pop = Math.max(0, f.pop + (inv.pop ?? 0));
      f.unrest = cap(f.unrest + (inv.unrest ?? 0), 0, 100);
      if (inv.absorb) {
        const victim = findFaction(state, inv.absorb);
        if (victim && victim.id !== f.id) {
          absorbFaction(
            state,
            f,
            victim,
            lines,
            `${victim.name} is absorbed by ${f.name}.`,
          );
        }
      }
    }
    if (line) lines.push(line.slice(0, 180));
  }
}
