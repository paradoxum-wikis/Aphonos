import { container, text } from "../v2.js";
import {
  deepestRoundReached,
  getExoChampion,
  getTournamentChampion,
  getTwoXChampion,
} from "./bracket.js";
import type { RoundId, TourneyAwards, TourneyState } from "./types.js";
import { appendLog } from "./state.js";
import { COLOR } from "./ui.js";

const ROUND_WEIGHT: Record<RoundId, number> = {
  r16: 1,
  qf: 2,
  semi: 3,
  final: 4,
};

function nameOf(state: TourneyState, userId: string): string {
  const p =
    state.combatants.find((c) => c.userId === userId) ||
    state.referees.find((r) => r.userId === userId);
  return p?.displayName ?? userId;
}

function betWeight(state: TourneyState, userId: string): number {
  let w = 0;
  for (const s of state.series) {
    if (s.status !== "complete" || !s.winnerId) continue;
    if (s.bets.some((b) => b.userId === userId && b.pickId === s.winnerId)) {
      w += ROUND_WEIGHT[s.round];
    }
  }
  return w;
}

function pickTop(
  ids: string[],
  primary: (id: string) => number,
  secondary?: (id: string) => number,
): string | undefined {
  if (!ids.length) return undefined;
  return [...ids].sort((a, b) => {
    const d = primary(b) - primary(a);
    if (d) return d;
    if (secondary) {
      const d2 = secondary(b) - secondary(a);
      if (d2) return d2;
    }
    return Math.random() < 0.5 ? -1 : 1;
  })[0];
}

export function computeAwards(state: TourneyState): TourneyAwards {
  const awards: TourneyAwards = {
    tournamentChampion: getTournamentChampion(state),
    exoChampion: getExoChampion(state),
    twoXChampion: getTwoXChampion(state),
    manOfTheTournament:
      pickTop(
        Object.keys(state.motScores),
        (id) => state.motScores[id] ?? 0,
        (id) => deepestRoundReached(state, id),
      ) ?? getTournamentChampion(state),
    refOfTheTournament: pickTop(
      state.referees.map((r) => r.userId),
      (id) => (state.refGamesOfficiated[id] ?? 0) + (state.betPoints[id] ?? 0),
      (id) => betWeight(state, id),
    ),
    gamblingAddict: pickTop(
      Object.keys(state.betPoints),
      (id) => state.betPoints[id] ?? 0,
      (id) => betWeight(state, id),
    ),
  };
  state.awards = awards;
  appendLog(state, "awards", awards);
  return awards;
}

export function awardsContainer(state: TourneyState) {
  const a = state.awards ?? computeAwards(state);
  const line = (label: string, userId?: string) =>
    userId
      ? `**${label}**\n<@${userId}> — ${nameOf(state, userId)}`
      : `**${label}**\n-`;

  return container(COLOR.finals).addTextDisplayComponents(
    text(
      [
        "## Results",
        line("Champion", a.tournamentChampion),
        line("Exo", a.exoChampion),
        line("Two X", a.twoXChampion),
        line("MOT", a.manOfTheTournament),
        line("ROT", a.refOfTheTournament),
        line("Gambling Addict", a.gamblingAddict),
      ].join("\n\n"),
    ),
  );
}
