import type { BattleHooks } from "../battleEngine.js";
import { generateFighter, type Fighter } from "../fighterGenerator.js";
import type { User } from "discord.js";
import type { RoundId, SeriesState, TourneyState } from "./types.js";
import { REFEREE_ARCANAS, ROUND_ARCANA } from "./types.js";
import { activeRefereeArcanas, allRefereeArcanasAtLevel } from "./bracket.js";
import {
  createRefereeArcanaHooks,
  mergeBattleHooks,
  refereeArcanaLabels,
  type ActiveReferee,
} from "./refereeArcana.js";
import { arcanaFullName, type ArcanaArtId } from "./arcanaAssets.js";

export type RoundArcanaId = (typeof ROUND_ARCANA)[RoundId];

export function activeRoundArcanas(round: RoundId): RoundArcanaId[] {
  if (round === "final") return ["world", "justice", "star", "judgement"];
  return [ROUND_ARCANA[round]];
}

export function roundArcanaLabel(round: RoundId): string {
  return activeRoundArcanas(round)
    .map((id) => arcanaFullName(id))
    .join(", ");
}

export function hasRoundArcana(round: RoundId, id: RoundArcanaId): boolean {
  return activeRoundArcanas(round).includes(id);
}

function buildFighters(
  arcanas: ArcanaArtId[],
  userA: User,
  nameA: string,
  userB: User,
  nameB: string,
): [Fighter, Fighter] {
  const force = arcanas.includes("justice") ? 100 : undefined;
  const a = generateFighter(userA, nameA, force);
  const b = generateFighter(userB, nameB, force);
  a.name = nameA;
  b.name = nameB;

  if (arcanas.includes("world")) {
    a.maxHp *= 4;
    a.hp = a.maxHp;
    b.maxHp *= 4;
    b.hp = b.maxHp;
  }

  return [a, b];
}

export function buildTourneyFighters(
  round: RoundId,
  userA: User,
  nameA: string,
  userB: User,
  nameB: string,
): [Fighter, Fighter] {
  return buildFighters(activeRoundArcanas(round), userA, nameA, userB, nameB);
}

function expandArcanaChoice(choice: ArcanaArtId | null): ArcanaArtId[] {
  if (!choice) return [];
  return choice === "world"
    ? ["world", "justice", "star", "judgement"]
    : [choice];
}

export function buildArcanaFighters(
  choice: ArcanaArtId | null,
  userA: User,
  nameA: string,
  userB: User,
  nameB: string,
): [Fighter, Fighter] {
  return buildFighters(expandArcanaChoice(choice), userA, nameA, userB, nameB);
}

export function createRoundArcanaHooks(arcanas: ArcanaArtId[]): BattleHooks {
  const star = arcanas.includes("star");
  const judgement = arcanas.includes("judgement");
  const dmgAtWindowStart: Record<string, number> = {};
  let windowInited = false;

  return {
    afterStep: ({
      turn,
      event,
      fighter1,
      fighter2,
      battleLog,
      damageDealt,
    }) => {
      if (!windowInited) {
        dmgAtWindowStart[fighter1.user.id] = 0;
        dmgAtWindowStart[fighter2.user.id] = 0;
        windowInited = true;
      }

      if (star && event.action === "block") {
        const blocker =
          fighter1.name === event.defender
            ? fighter1
            : fighter2.name === event.defender
              ? fighter2
              : null;
        if (blocker) {
          blocker.defense += 1;
          battleLog.push(`⭐ **The Star:** ${blocker.name} +1 DEF (block)`);
        }
      }

      if (judgement && turn > 0 && turn % 4 === 0) {
        for (const f of [fighter1, fighter2]) {
          if (f.hp <= 0) continue;
          const dealt =
            (damageDealt[f.user.id] ?? 0) - (dmgAtWindowStart[f.user.id] ?? 0);
          if (dealt <= 0) {
            const before = f.hp;
            f.hp = Math.max(1, Math.floor(f.hp / 2));
            battleLog.push(
              `⚖️ **Judgement:** ${f.name} dealt no damage - HP ${before} -> ${f.hp}`,
            );
          }
        }
        dmgAtWindowStart[fighter1.user.id] = damageDealt[fighter1.user.id] ?? 0;
        dmgAtWindowStart[fighter2.user.id] = damageDealt[fighter2.user.id] ?? 0;
      }
    },
  };
}

export function resolveActiveReferees(
  state: TourneyState,
  series: SeriesState,
): ActiveReferee[] {
  if (hasRoundArcana(series.round, "world")) return allRefereeArcanasAtLevel(3);
  return activeRefereeArcanas(state, series).map((p) => ({
    arcana: p.arcana,
    level: p.level,
  }));
}

export function createTourneyBattleHooks(
  state: TourneyState,
  series: SeriesState,
): BattleHooks {
  const refs = resolveActiveReferees(state, series);
  return mergeBattleHooks(
    createRoundArcanaHooks(activeRoundArcanas(series.round)),
    createRefereeArcanaHooks(refs),
  );
}

export function createArcanaBattleHooks(
  choice: ArcanaArtId | null,
  refereeLevel: 1 | 2 | 3 = 3,
): BattleHooks {
  const arcanas = expandArcanaChoice(choice);

  const refs: ActiveReferee[] = arcanas.includes("world")
    ? allRefereeArcanasAtLevel(3)
    : REFEREE_ARCANAS.filter((a) => arcanas.includes(a)).map((arcana) => ({
        arcana,
        level: refereeLevel,
      }));

  return mergeBattleHooks(
    createRoundArcanaHooks(arcanas),
    createRefereeArcanaHooks(refs),
  );
}

export function tourneyArcanaLabel(
  state: TourneyState,
  series: SeriesState,
): string {
  const round = roundArcanaLabel(series.round);
  const refs = refereeArcanaLabels(resolveActiveReferees(state, series));
  return [round, refs].filter(Boolean).join(" - ") || "-";
}
