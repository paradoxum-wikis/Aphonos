import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { runBattle } from "../battleEngine.js";
import { container, text, V2 } from "../v2.js";
import {
  battleCard,
  createBattleImage,
  getRealmName,
} from "../../commands/battle.js";
import { getNextPlayableSeries, recordGame, roundLabel } from "./bracket.js";
import {
  buildTourneyFighters,
  createTourneyBattleHooks,
  resolveActiveReferees,
  tourneyArcanaLabel,
} from "./arcana.js";
import { arcanaAttachment, arcanaCards } from "./arcanaAssets.js";
import { awardsContainer, computeAwards } from "./awards.js";
import { saveActiveTourney } from "./log.js";
import {
  endPlay,
  finishTourney,
  isTourneyOwner,
  tryBeginPlay,
} from "./lifecycle.js";
import type { SeriesState, TourneyState } from "./types.js";
import { ROUND_ARCANA } from "./types.js";
import {
  isCollectorTimeout,
  seriesEmbedColor,
  timeoutPayload,
  type MessagePoster,
} from "./ui.js";

const COLLECT_MS = 60 * 60 * 1000;

function nameOf(state: TourneyState, userId: string): string {
  return (
    state.combatants.find((c) => c.userId === userId)?.displayName ?? userId
  );
}

function seriesLabel(series: SeriesState): string {
  const bits = [roundLabel(series.round)];
  if (series.conference) {
    bits.push(series.conference === "exo" ? "Exo" : "Two X");
  }
  if (series.subgroup) bits.push(`Subgroup ${series.subgroup}`);
  return bits.join(" - ");
}

export function getSeriesForPlay(state: TourneyState): SeriesState | undefined {
  const mid = state.series.find(
    (s) =>
      s.status === "in_progress" &&
      s.fighterAId &&
      s.fighterBId &&
      (s.wins[s.fighterAId] ?? 0) < s.winsNeeded &&
      (s.wins[s.fighterBId] ?? 0) < s.winsNeeded,
  );
  if (mid) return mid;

  const next = getNextPlayableSeries(state);
  if (!next || next.status === "betting") return undefined;
  return next.status === "ready" && next.betsClosedAt ? next : undefined;
}

function scoreLine(state: TourneyState, series: SeriesState): string {
  const a = series.fighterAId!;
  const b = series.fighterBId!;
  const need = series.winsNeeded;
  return `**${nameOf(state, a)} ${series.wins[a] ?? 0} - ${series.wins[b] ?? 0} ${nameOf(state, b)}** (to ${need})`;
}

function seriesContainer(
  state: TourneyState,
  series: SeriesState,
  note?: string,
) {
  const lines = [
    `**${nameOf(state, series.fighterAId!)}** vs **${nameOf(state, series.fighterBId!)}**`,
    scoreLine(state, series),
  ];
  if (series.refIds.length) {
    lines.push(
      `Referee${series.refIds.length > 1 ? "s" : ""}: ${series.refIds.map((id) => `<@${id}>`).join(" ")}`,
    );
  }
  if (note) lines.push("", note);

  return container(seriesEmbedColor(series)).addTextDisplayComponents(
    text(`## ${seriesLabel(series)}\n${lines.join("\n")}`),
  );
}

function startGameRow(seriesId: string, gameNum: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tourney:play:${seriesId}`)
      .setLabel(`Start game ${gameNum}`)
      .setStyle(ButtonStyle.Success),
  );
}

export async function runPlaySession(
  state: TourneyState,
  series: SeriesState,
  post: MessagePoster,
): Promise<"series" | "tournament" | "timeout"> {
  if (!tryBeginPlay(state.guildId)) {
    await post({
      content: "A play session is already open in this server.",
    });
    return "timeout";
  }

  try {
    const gameNum = series.games.length + 1;
    const files: AttachmentBuilder[] = [];
    let cards;
    if (gameNum === 1) {
      const ids = [
        ROUND_ARCANA[series.round],
        ...resolveActiveReferees(state, series).map((r) => r.arcana),
      ];
      for (const id of ids) files.push(arcanaAttachment(id));
      cards = arcanaCards(ids, seriesEmbedColor(series));
    }
    const message = await post({
      components: [
        seriesContainer(state, series, `Start game ${gameNum}.`),
        ...(cards ? [cards] : []),
        startGameRow(series.id, gameNum),
      ],
      files,
      flags: V2,
    });

    return await playLoop(message, state, series.id);
  } finally {
    endPlay(state.guildId);
  }
}

async function playLoop(
  message: Message,
  state: TourneyState,
  seriesId: string,
): Promise<"series" | "tournament" | "timeout"> {
  while (true) {
    const series = state.series.find((s) => s.id === seriesId);
    if (!series || series.status === "complete") break;

    let btn: ButtonInteraction;
    try {
      btn = (await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: COLLECT_MS,
        filter: async (i) => {
          if (i.customId !== `tourney:play:${seriesId}`) return false;
          if (!isTourneyOwner(i.user.id)) {
            await i.reply({
              content: "Owner only.",
              flags: MessageFlags.Ephemeral,
            });
            return false;
          }
          return true;
        },
      })) as ButtonInteraction;
    } catch (e) {
      if (isCollectorTimeout(e)) {
        await message.edit({
          ...timeoutPayload("Run `/tourney` again when you want to continue."),
        });
      }
      return "timeout";
    }

    await runOneGame(btn, message, state, seriesId);

    const updated = state.series.find((s) => s.id === seriesId)!;
    if (updated.status === "complete") {
      if (seriesId === "final" || state.phase === "complete") {
        computeAwards(state);
        await saveActiveTourney(state);
        await finishTourney(state);
        await message.edit({
          components: [
            seriesContainer(
              state,
              updated,
              `**${nameOf(state, updated.winnerId!)}** wins the playoffs.`,
            ),
            awardsContainer(state),
          ],
          flags: V2,
        });
        return "tournament";
      }

      await message.edit({
        components: [
          seriesContainer(
            state,
            updated,
            `**${nameOf(state, updated.winnerId!)}** advances.`,
          ),
        ],
        flags: V2,
      });
      return "series";
    }

    const nextGame = updated.games.length + 1;
    await message.edit({
      components: [
        seriesContainer(state, updated, `Start game ${nextGame}.`),
        startGameRow(seriesId, nextGame),
      ],
      flags: V2,
    });
  }
  return "series";
}

async function runOneGame(
  btn: ButtonInteraction,
  message: Message,
  state: TourneyState,
  seriesId: string,
): Promise<void> {
  // canvas gen can exceed Discord's 3s interaction window
  await btn.deferUpdate();

  const series = state.series.find((s) => s.id === seriesId)!;
  const guild = btn.guild!;
  const idA = series.fighterAId!;
  const idB = series.fighterBId!;
  const memberA = await guild.members.fetch(idA);
  const memberB = await guild.members.fetch(idB);

  const [fighter1, fighter2] = buildTourneyFighters(
    series.round,
    memberA.user,
    nameOf(state, idA),
    memberB.user,
    nameOf(state, idB),
  );

  const gameNum = series.games.length + 1;
  const tag = `${seriesLabel(series)} - Game ${gameNum}`;
  const imageResult = await createBattleImage(
    memberA.user,
    memberB.user,
    fighter1.name,
    fighter2.name,
    memberA,
    memberB,
    undefined,
    false,
    series.conference === "exo" || (series.subgroup ?? 3) <= 2
      ? "deathbattle4.png"
      : "deathbattle.png",
  );
  const battleFile = new AttachmentBuilder(imageResult.buffer, {
    name: "deathbattle.png",
  });
  const realmName = getRealmName(imageResult.backgroundFileName);
  const firstMover =
    fighter1.speed >= fighter2.speed ? fighter1.name : fighter2.name;

  const files: AttachmentBuilder[] = [battleFile];
  const aUrl = memberA.user.displayAvatarURL({ size: 256, extension: "png" });
  const bUrl = memberB.user.displayAvatarURL({ size: 256, extension: "png" });

  await message.edit({
    components: [
      battleCard({
        color: "#2E2B5F",
        title: `THE ${realmName.toUpperCase()} HAVE DECLARED A DEATHBATTLE!`,
        intro: `**${tag}**\n${tourneyArcanaLabel(state, series)}\n**${fighter1.name}** vs **${fighter2.name}**\n🏃 **${firstMover}** first`,
        f1: fighter1,
        f2: fighter2,
        f1Url: aUrl,
        f2Url: bUrl,
        image: "attachment://deathbattle.png",
        log: "Battle begins in 3 seconds…",
        footer: tag,
      }),
    ],
    files,
    flags: V2,
  });
  await new Promise((r) => setTimeout(r, 3000));

  const result = await runBattle(fighter1, fighter2, {
    turnCap: 55,
    realmName,
    turnDelayMs: 2000,
    hooks: createTourneyBattleHooks(state, series),
    onTurn: async ({ turn, fighter1: f1, fighter2: f2, battleLog }) => {
      await message.edit({
        components: [
          battleCard({
            color: "#35C2FF",
            title: "BATTLE IN PROGRESS",
            intro: `**${tag}** — Turn ${turn}`,
            f1,
            f2,
            f1Url: aUrl,
            f2Url: bUrl,
            image: "attachment://deathbattle.png",
            log: battleLog.slice(-5).join("\n"),
            footer: tag,
          }),
        ],
        flags: V2,
      });
    },
  });

  recordGame(state, seriesId, {
    winnerId: result.winner.user.id,
    loserId: result.loser.user.id,
    turns: result.turns,
    scores: {
      [result.winner.user.id]: {
        damageDealt: result.damageDealt[result.winner.user.id] ?? 0,
        hpRemaining: result.winner.hp,
        maxHp: result.winner.maxHp,
      },
      [result.loser.user.id]: {
        damageDealt: result.damageDealt[result.loser.user.id] ?? 0,
        hpRemaining: result.loser.hp,
        maxHp: result.loser.maxHp,
      },
    },
  });
  await saveActiveTourney(state);

  const after = state.series.find((s) => s.id === seriesId)!;
  const finalImage = await createBattleImage(
    memberA.user,
    memberB.user,
    fighter1.name,
    fighter2.name,
    memberA,
    memberB,
    result.winner.user,
    false,
    imageResult.backgroundFileName,
  );
  const finalFile = new AttachmentBuilder(finalImage.buffer, {
    name: "deathbattle-final.png",
  });

  await message.edit({
    components: [
      battleCard({
        color: "#FFD700",
        title: "DEATHBATTLE OVER",
        intro:
          `**${tag}**\n**${result.winner.name}** wins (${result.turns} turns, ${result.winner.hp}/${result.winner.maxHp} HP)\n${scoreLine(state, after)}` +
          (after.status === "complete"
            ? `\n**${nameOf(state, after.winnerId!)}** advances.`
            : ""),
        f1: fighter1,
        f2: fighter2,
        f1Url: aUrl,
        f2Url: bUrl,
        image: "attachment://deathbattle-final.png",
        log: result.battleLog.slice(-3).join("\n"),
        footer: tag,
      }),
      ...(after.status === "complete"
        ? []
        : [startGameRow(seriesId, after.games.length + 1)]),
    ],
    files: [finalFile],
    flags: V2,
  });
}
