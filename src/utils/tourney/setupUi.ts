import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Guild,
  MessageFlags,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type MessageComponentInteraction,
  type MessageCreateOptions,
  type UserSelectMenuInteraction,
} from "discord.js";
import { container, text, V2 } from "../v2.js";
import {
  CONFERENCE,
  REFEREE_ARCANAS,
  type RefereeArcanaId,
  type SubgroupId,
  type TourneyPlayer,
  type TourneyState,
} from "./types.js";
import { setRoster } from "./state.js";
import { seedTourney, setRefPick } from "./bracket.js";
import { saveActiveTourney } from "./log.js";
import { isTourneyOwner } from "./lifecycle.js";
import { sortRefsForPick } from "./refs.js";
import { COLOR, isCollectorTimeout, timeoutPayload } from "./ui.js";
import {
  arcanaAttachment,
  arcanaCard,
  arcanaCards,
  arcanaFullName,
  type ArcanaArtId,
} from "./arcanaAssets.js";

const COLLECT_MS = 30 * 60 * 1000;

async function fetchPlayers(
  guild: Guild,
  ids: string[],
): Promise<TourneyPlayer[]> {
  const out: TourneyPlayer[] = [];
  for (const id of ids) {
    const m = await guild.members.fetch(id);
    out.push({
      userId: m.id,
      tag: m.user.tag,
      displayName: m.displayName,
    });
  }
  return out;
}

function mentionList(ids: string[]): string {
  return ids.map((id) => `<@${id}>`).join(" ");
}

export function rosterPrompt(step: "combatants" | "refs") {
  return container(COLOR.neutral).addTextDisplayComponents(
    text(
      step === "combatants"
        ? "## Combatants (16)\nSelect 16 combatants."
        : "## Referees (4)\nSelect 4 referees (not also combatants).",
    ),
  );
}

function combatantSelectRow() {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("tourney:sel:combatants")
      .setPlaceholder("Choose 16 combatants")
      .setMinValues(16)
      .setMaxValues(16),
  );
}

function refSelectRow() {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("tourney:sel:refs")
      .setPlaceholder("Choose 4 referees")
      .setMinValues(4)
      .setMaxValues(4),
  );
}

function takenSubgroups(state: TourneyState): Set<SubgroupId> {
  return new Set(state.refPicks.map((p) => p.subgroup));
}

function takenArcanas(state: TourneyState): Set<RefereeArcanaId> {
  return new Set(state.refPicks.map((p) => p.arcana));
}

function pendingRefSlots(
  state: TourneyState,
): { player: TourneyPlayer; refIndex: number }[] {
  const done = new Set(state.refPicks.map((p) => p.refIndex));
  const open = state.referees
    .map((player, refIndex) => ({ player, refIndex }))
    .filter((x) => !done.has(x.refIndex));
  return sortRefsForPick(open.map((x) => x.player)).map((player) =>
    open.find((x) => x.player === player)!,
  );
}

function subgroupLabel(sg: SubgroupId): string {
  const conf = CONFERENCE[sg <= 2 ? "exo" : "two_x"].name;
  return `Subgroup ${sg} (${conf})`;
}

function refPickContainer(
  state: TourneyState,
  current: { player: TourneyPlayer; refIndex: number },
  stage: "subgroup" | "arcana",
  heldSubgroup?: SubgroupId,
) {
  const done = state.refPicks.length;
  const order = state.referees
    .map((r, refIndex) => {
      const pick = state.refPicks.find((p) => p.refIndex === refIndex);
      const mark = pick
        ? `${subgroupLabel(pick.subgroup)} - ${arcanaFullName(pick.arcana)}`
        : refIndex === current.refIndex
          ? "picking"
          : "-";
      return `${refIndex + 1}. <@${r.userId}> - ${mark}`;
    })
    .join("\n");

  const step =
    stage === "subgroup"
      ? `**${done + 1}/4** <@${current.player.userId}> - pick a subgroup`
      : `**${done + 1}/4** <@${current.player.userId}> - **${subgroupLabel(heldSubgroup!)}** - pick an Arcana`;

  return container(COLOR.neutral).addTextDisplayComponents(
    text(`## Referee picks\n${order}\n\n${step}`),
  );
}

function subgroupRows(state: TourneyState): ActionRowBuilder<ButtonBuilder>[] {
  const taken = takenSubgroups(state);
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const sg of [1, 2, 3, 4] as SubgroupId[]) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:sg:${sg}`)
        .setLabel(subgroupLabel(sg))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(taken.has(sg)),
    );
  }
  return [row];
}

function arcanaRows(state: TourneyState): ActionRowBuilder<ButtonBuilder>[] {
  const taken = takenArcanas(state);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (const id of REFEREE_ARCANAS) {
    if (row.components.length === 3) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
    const name = arcanaFullName(id);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:arc:${id}`)
        .setLabel(name.length > 80 ? name.slice(0, 77) + "..." : name)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(taken.has(id)),
    );
  }
  if (row.components.length) rows.push(row);
  return rows;
}

function allowedPicker(
  i: MessageComponentInteraction,
  currentRefId: string,
): boolean {
  return i.user.id === currentRefId || isTourneyOwner(i.user.id);
}

function arcanaStagePayload(
  state: TourneyState,
  current: { player: TourneyPlayer; refIndex: number },
  sg: SubgroupId,
) {
  const available = REFEREE_ARCANAS.filter(
    (id) => !takenArcanas(state).has(id),
  ) as ArcanaArtId[];
  return {
    flags: V2,
    components: [
      refPickContainer(state, current, "arcana", sg),
      arcanaCards(available),
      ...arcanaRows(state),
    ],
    files: available.map((id) => arcanaAttachment(id)),
  };
}

export function bracketContainers(state: TourneyState) {
  const name = (id: string) => {
    const p = state.combatants.find((c) => c.userId === id);
    return p ? p.displayName : id;
  };

  const refLine = (sg: SubgroupId) => {
    const pick = state.refPicks.find((p) => p.subgroup === sg);
    if (!pick) return `${subgroupLabel(sg)}: -`;
    return `${subgroupLabel(sg)}: <@${pick.userId}> - ${arcanaFullName(pick.arcana)}`;
  };

  const r16 = state.series.filter((s) => s.round === "r16");
  const block = (subgroups: SubgroupId[], title: string, color: number) => {
    const lines: string[] = [];
    for (const sg of subgroups) {
      lines.push(refLine(sg));
      for (const s of r16.filter((x) => x.subgroup === sg)) {
        lines.push(`- ${name(s.fighterAId!)} vs ${name(s.fighterBId!)}`);
      }
      lines.push("");
    }
    return container(color).addTextDisplayComponents(
      text(`## ${title}\n${lines.join("\n").trim()}`),
    );
  };

  return [
    block([1, 2], "Exo Conference - Round of 16", CONFERENCE.exo.color),
    block([3, 4], "Two X Conference - Round of 16", CONFERENCE.two_x.color),
    container(COLOR.neutral).addTextDisplayComponents(
      text("## Bracket locked\nPick'em next."),
    ),
  ];
}

type SetupMsg = Message;

async function waitUserSelect(
  message: SetupMsg,
  customId: string,
  ownerId: string,
): Promise<UserSelectMenuInteraction> {
  try {
    const i = await message.awaitMessageComponent({
      componentType: ComponentType.UserSelect,
      time: COLLECT_MS,
      filter: async (x) => {
        if (x.customId !== customId) return false;
        if (x.user.id !== ownerId) {
          await x.reply({
            content: "Owner only.",
            flags: MessageFlags.Ephemeral,
          });
          return false;
        }
        return true;
      },
    });
    return i as UserSelectMenuInteraction;
  } catch (e) {
    if (isCollectorTimeout(e)) {
      await message.edit({
        ...timeoutPayload(
          "Run `/tourney` again to continue where you left off.",
        ),
      });
      throw new Error("Setup timed out. Run `/tourney` to continue.");
    }
    throw e;
  }
}

async function waitButton(
  message: SetupMsg,
  allow: (i: ButtonInteraction) => boolean,
): Promise<ButtonInteraction> {
  try {
    const i = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: COLLECT_MS,
      filter: async (x) => {
        if (!x.customId.startsWith("tourney:")) return false;
        if (!allow(x as ButtonInteraction)) {
          await x.reply({
            content: "Not your turn.",
            flags: MessageFlags.Ephemeral,
          });
          return false;
        }
        return true;
      },
    });
    return i as ButtonInteraction;
  } catch (e) {
    if (isCollectorTimeout(e)) {
      await message.edit({
        ...timeoutPayload(
          "Run `/tourney` again to continue referee picks where you left off.",
        ),
      });
      throw new Error("Setup timed out. Run `/tourney` to continue.");
    }
    throw e;
  }
}

async function finishSeed(
  message: SetupMsg,
  state: TourneyState,
  btn: ButtonInteraction,
): Promise<void> {
  seedTourney(state);
  await saveActiveTourney(state);
  await btn.update({
    components: bracketContainers(state),
    files: [],
    flags: V2,
  });
}

export async function runSetupFlow(
  interaction: ChatInputCommandInteraction,
  state: TourneyState,
  usedReply: { v: boolean },
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) throw new Error("Guild only.");
  const ownerId = interaction.user.id;

  if (state.slots.length === 16 || state.phase === "ready") {
    return;
  }

  if (
    state.phase === "betting" ||
    state.phase === "playing" ||
    state.phase === "complete" ||
    state.phase === "aborted"
  ) {
    return;
  }

  if (state.refPicks.length === 4) {
    seedTourney(state);
    await saveActiveTourney(state);
    return;
  }

  usedReply.v = true;
  const firstReply = async (payload: MessageCreateOptions) => {
    const body = { ...payload, flags: V2 };
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(body);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp(body);
    } else {
      await interaction.reply(body);
    }
    return interaction.fetchReply();
  };

  if (state.phase === "setup_ref_picks" && state.combatants.length === 16) {
    const current = pendingRefSlots(state)[0];
    if (!current) {
      if (state.refPicks.length === 4) {
        seedTourney(state);
        await saveActiveTourney(state);
      }
      return;
    }
    const message = await firstReply({
      components: [
        refPickContainer(state, current, "subgroup"),
        ...subgroupRows(state),
      ],
    });
    await runRefPickLoop(message as Message, state);
    return;
  }

  const message = await firstReply({
    components: [rosterPrompt("combatants"), combatantSelectRow()],
  });

  const combatantsIx = await waitUserSelect(
    message,
    "tourney:sel:combatants",
    ownerId,
  );
  const combatantIds = [...combatantsIx.users.keys()];
  await combatantsIx.update({
    components: [rosterPrompt("refs"), refSelectRow()],
    flags: V2,
  });

  const refsIx = await waitUserSelect(message, "tourney:sel:refs", ownerId);
  const refIds = [...refsIx.users.keys()];

  const overlap = combatantIds.filter((id) => refIds.includes(id));
  if (overlap.length) {
    await refsIx.update({
      components: [
        container("#8B0000").addTextDisplayComponents(
          text(
            `These people are in both lists: ${mentionList(overlap)}. Use \`/tourney abort\` and start over.`,
          ),
        ),
      ],
      flags: V2,
    });
    return;
  }

  const combatants = await fetchPlayers(guild, combatantIds);
  const referees = await fetchPlayers(guild, refIds);
  setRoster(state, combatants, referees);
  await saveActiveTourney(state);

  const first = pendingRefSlots(state)[0];
  await refsIx.update({
    components: [
      refPickContainer(state, first, "subgroup"),
      ...subgroupRows(state),
    ],
    flags: V2,
  });

  await runRefPickLoop(message, state);
}

async function runRefPickLoop(
  message: SetupMsg,
  state: TourneyState,
): Promise<void> {
  while (state.refPicks.length < 4) {
    const current = pendingRefSlots(state)[0];
    if (!current) break;

    const sgBtn = await waitButton(message, (i) =>
      allowedPicker(i, current.player.userId),
    );

    if (!sgBtn.customId.startsWith("tourney:sg:")) {
      await sgBtn.reply({
        content: "Pick a subgroup first.",
        flags: MessageFlags.Ephemeral,
      });
      continue;
    }

    const sg = Number(sgBtn.customId.split(":")[2]) as SubgroupId;
    if (takenSubgroups(state).has(sg)) {
      await sgBtn.reply({
        content: "That subgroup is taken.",
        flags: MessageFlags.Ephemeral,
      });
      continue;
    }

    try {
      await sgBtn.update(arcanaStagePayload(state, current, sg));
    } catch (e) {
      await sgBtn.reply({
        content: e instanceof Error ? e.message : "Failed.",
        flags: MessageFlags.Ephemeral,
      });
      continue;
    }

    let committed = false;
    while (!committed) {
      const arcBtn = await waitButton(message, (i) =>
        allowedPicker(i, current.player.userId),
      );

      if (!arcBtn.customId.startsWith("tourney:arc:")) {
        await arcBtn.reply({
          content: "Pick an Arcana.",
          flags: MessageFlags.Ephemeral,
        });
        continue;
      }

      const arc = arcBtn.customId.split(":")[2] as RefereeArcanaId;
      if (takenArcanas(state).has(arc)) {
        await arcBtn.reply({
          content: "That Arcana is taken.",
          flags: MessageFlags.Ephemeral,
        });
        continue;
      }

      try {
        setRefPick(state, {
          userId: current.player.userId,
          refIndex: current.refIndex,
          subgroup: sg,
          arcana: arc,
        });
        await saveActiveTourney(state);
        committed = true;

        if (state.refPicks.length < 4) {
          const next = pendingRefSlots(state)[0];
          await arcBtn.update({
            components: [
              refPickContainer(state, next, "subgroup"),
              arcanaCard(arc as ArcanaArtId),
              ...subgroupRows(state),
            ],
            files: [arcanaAttachment(arc as ArcanaArtId)],
            flags: V2,
          });
        } else {
          await finishSeed(message, state, arcBtn);
        }
      } catch (e) {
        await arcBtn.reply({
          content: e instanceof Error ? e.message : "Failed.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
