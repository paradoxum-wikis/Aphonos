import { hashString } from "../fighterGenerator.js";
import { ownedBy } from "./state.js";
import type { CivState, Faction, Province } from "./types.js";

function cap(n: number, lo: number, hi = Infinity): number {
  return Math.max(lo, Math.min(hi, n));
}

function pick<T>(items: T[], seed: string): T | undefined {
  if (!items.length) return undefined;
  return items[hashString(seed) % items.length];
}

function factions(state: CivState): Faction[] {
  return Object.values(state.factions);
}

function landed(state: CivState): Faction[] {
  return factions(state).filter((f) => ownedBy(state, f.id).length);
}

type Piece = (state: CivState, salt: string) => string | undefined;

const PIECES: Piece[] = [
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f) return;
    f.arms = cap(f.arms - 1, 0);
    return `Raiders hit ${f.name}. −1 arms.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.food += 3;
    return `${f.name} finds a cache. +3 food.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.material += 2;
    return `Scrap wagon rolls into ${f.name}. +2 material.`;
  },
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f || f.pop <= 1) return;
    f.pop = cap(f.pop - 1, 1);
    f.unrest = cap(f.unrest + 8, 0, 100);
    return `Plague coughs through ${f.name}. −1 pop, unrest up.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.unrest = cap(f.unrest + 10, 0, 100);
    return `A priest in ${f.name} starts screaming about the end. +10 unrest.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.faith += 2;
    return `A comet hangs over ${f.name}. +2 faith. They will misuse it.`;
  },
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f || f.arms < 1) return;
    f.arms -= 1;
    const other = pick(
      factions(s).filter((x) => x.id !== f.id),
      salt + "o",
    );
    if (other) other.arms += 1;
    return other
      ? `Deserters leave ${f.name} for ${other.name}.`
      : `${f.name} loses a drunk patrol. −1 arms.`;
  },
  (s, salt) => {
    const p = pick(
      s.provinces.filter((x) => x.owner && x.development !== "empty"),
      salt,
    );
    if (!p || !p.owner) return;
    p.development = "empty";
    return `Fire eats the works at ${p.name}. Back to dirt.`;
  },
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f) return;
    f.arms += 2;
    f.unrest = cap(f.unrest + 6, 0, 100);
    return `${f.name} presses farm boys into spears. +2 arms, they hate it.`;
  },
  (s, salt) => {
    const a = pick(landed(s), salt);
    const b = pick(
      landed(s).filter((x) => x.id !== a?.id),
      salt + "b",
    );
    if (!a || !b) return;
    a.unrest = cap(a.unrest + 7, 0, 100);
    b.unrest = cap(b.unrest + 7, 0, 100);
    return `${a.name} and ${b.name} start a border pissing contest. No one dies. Yet.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.food = cap(f.food - 2, 0);
    return `Worms in the granary of ${f.name}. −2 food.`;
  },
  (s, salt) => {
    const p = pick(
      s.provinces.filter((x) => x.terrain === "coast" && x.owner),
      salt,
    ) as Province | undefined;
    if (!p?.owner) return;
    const f = s.factions[p.owner];
    if (!f) return;
    f.food = cap(f.food - 1, 0);
    f.material += 1;
    return `Tide dumps junk on ${p.name}. ${f.name} loses a crate of food, gains scrap.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.faith = cap(f.faith - 1, 0);
    f.unrest = cap(f.unrest + 5, 0, 100);
    return `An idol in ${f.name} falls over. The crowd takes it personally.`;
  },
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f) return;
    f.food += 2;
    f.pop += 1;
    return `Refugees crawl into ${f.name}. +2 food, +1 pop, and opinions.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f || f.food < 1) return;
    f.food -= 1;
    f.faith += 1;
    return `${f.name} burns dinner for the sky. −1 food, +1 faith.`;
  },
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f) return;
    f.unrest = cap(f.unrest - 8, 0, 100);
    return `A stupid festival in ${f.name}. Unrest down. Nobody remembers why.`;
  },
  (s, salt) => {
    const f = pick(factions(s), salt);
    if (!f) return;
    f.arms += 1;
    return `A rusty blade washes up for ${f.name}. +1 arms. Tetanus pending.`;
  },
  (s, salt) => {
    const p = pick(
      s.provinces.filter((x) => x.owner),
      salt,
    );
    if (!p?.owner) return;
    const f = s.factions[p.owner];
    if (!f) return;
    f.unrest = cap(f.unrest + 4, 0, 100);
    return `Howling from ${p.name}. ${f.name} pretends it's weather.`;
  },
  (s, salt) => {
    const f = pick(landed(s), salt);
    if (!f || f.arms < 2) return;
    f.arms -= 1;
    f.material += 2;
    return `${f.name} melts a spear for nails. −1 arms, +2 material.`;
  },
];

export function fireSetPiece(state: CivState): string | undefined {
  if (!factions(state).length) return undefined;
  const start = hashString(`${state.id}:sp:${state.tick}`) % PIECES.length;
  for (let i = 0; i < PIECES.length; i++) {
    const salt = `${state.id}:${state.tick}:${i}`;
    const line = PIECES[(start + i) % PIECES.length](state, salt);
    if (line) return line;
  }
}
