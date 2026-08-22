import { hashString } from "../fighterGenerator.js";
import type { Province, Terrain } from "./types.js";

const GRID = [
  ["nil", "heaven", "cross", "heights"],
  ["office", "island", "city", "necro"],
  ["pressure", "castle", "wrecked", "strong"],
  ["camp", "town", "cyber", "tower"],
] as const;

const META: Record<
  string,
  { name: string; terrain: Terrain; epithet: string }
> = {
  nil: {
    name: "Nil Zone",
    terrain: "waste",
    epithet: "corrupted purple world of Lord Exo",
  },
  heaven: {
    name: "The Heavens",
    terrain: "plain",
    epithet: "happy peaceful world of Two X",
  },
  cross: {
    name: "Crossroads",
    terrain: "plain",
    epithet: "a crossroads with major battles",
  },
  heights: {
    name: "The Heights",
    terrain: "high",
    epithet: "arena of revered swordsmen",
  },
  office: {
    name: "Satellite Office",
    terrain: "plain",
    epithet: "abandoned office with mysterious machinery",
  },
  island: {
    name: "Island Asylum",
    terrain: "coast",
    epithet: "isolated asylum full of maniacs",
  },
  city: {
    name: "Abandoned City",
    terrain: "plain",
    epithet: "small city overrun by zombies",
  },
  necro: {
    name: "Necropolis",
    terrain: "grove",
    epithet: "city of dark magic",
  },
  pressure: {
    name: "Pier Pressure",
    terrain: "coast",
    epithet: "a pier full of attractions",
  },
  castle: {
    name: "Summer Castle",
    terrain: "coast",
    epithet: "a castle made of sandstone",
  },
  wrecked: {
    name: "Wrecked Battlefield",
    terrain: "waste",
    epithet: "everything torn to shreds",
  },
  strong: {
    name: "Winter Stronghold",
    terrain: "plain",
    epithet: "cold and dark fort",
  },
  camp: {
    name: "Forest Camp",
    terrain: "grove",
    epithet: "nature overgrown military camp",
  },
  town: {
    name: "Trick or Threat Town",
    terrain: "grove",
    epithet: "small town of pumpkins",
  },
  cyber: {
    name: "Cyber City",
    terrain: "plain",
    epithet: "cyberpunk urban center",
  },
  tower: {
    name: "Totality Tower",
    terrain: "high",
    epithet: "megabuilding that soars the sky",
  },
};

function neighborsOf(id: string): string[] {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (GRID[r][c] !== id) continue;
      const out: string[] = [];
      if (c > 0) out.push(GRID[r][c - 1]);
      if (c < 3) out.push(GRID[r][c + 1]);
      if (r > 0) out.push(GRID[r - 1][c]);
      if (r < 3) out.push(GRID[r + 1][c]);
      return out;
    }
  }
  return [];
}

export const PROVINCE_IDS = GRID.flat() as string[];

const POS: Record<string, readonly [number, number]> = {};
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 4; c++) POS[GRID[r][c]] = [r, c];
}

export function gridDist(a: string, b: string): number {
  const [r1, c1] = POS[a];
  const [r2, c2] = POS[b];
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

export function createMap(): Province[] {
  return PROVINCE_IDS.map((id) => {
    const m = META[id];
    return {
      id,
      name: m.name,
      epithet: m.epithet,
      terrain: m.terrain,
      neighbors: neighborsOf(id),
      owner: null,
      development: "empty" as const,
      garrison: 0,
    };
  });
}

export function shuffleIds(ids: string[], seed: string): string[] {
  const out = [...ids];
  let h = hashString(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function terrainAtk(t: Terrain): number {
  return t === "waste" ? 0.9 : 1;
}

export function terrainDef(
  t: Terrain,
  development: Province["development"],
): number {
  let m = t === "high" ? 1.2 : 1;
  if (development === "walls") m *= 1.25;
  return m;
}
