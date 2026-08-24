import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { container, gallery, text, V2, V2_EPHEMERAL } from "../v2.js";
import { labelFaction } from "./awards.js";
import { deadLine, playerRoll } from "./digest.js";
import { power } from "./engine.js";
import { renderCivMap } from "./mapRenderer.js";
import { getActiveCiv, ownedBy } from "./state.js";
import {
  CIV_ABORT_COLOR,
  CIV_COLOR,
  bandFor,
  type CivState,
  type Faction,
} from "./types.js";

export type BookView = "overview" | "map" | "dead" | "facts";

const VIEWS: { id: BookView; label: string }[] = [
  { id: "overview", label: "Factions" },
  { id: "map", label: "Map" },
  { id: "dead", label: "Ghosts" },
  { id: "facts", label: "Last tick" },
];

export function openingText(): string {
  return [
    "**Faction talk.** Speak here and you're in.",
    "Found a faction or join one - say it. Name's free, it's yours. Talk it out.",
    "The Age has not started. No land, no war, no harvest. When the room is ready, the owner begins it.",
  ].join("\n");
}

export function rulesContainer() {
  return container(CIV_COLOR).addTextDisplayComponents(
    text(
      [
        "## How to play",
        "**Speak in this channel**: every ~10s the Book turns and acts on what was said.",
        '**Found/join** a faction ("found Israel", "join Toru Dynasty"). Max 4 factions. Unaffiliated can only found/join.',
        '**Claim**: "settle city" or "march Israel" to take provinces. Farm feeds, temple prays, workshop forges, walls defend.',
        '**Fight**: "bomb Toru Dynasty", "eat Adachi", "annex Y", "muster" arms. Higher arms/power wins.',
        '**Deal**: "trade/merge/nap with Y". "pray" for omens, "spy on Y" for intel.',
        "**Win**: be the last faction standing.",
      ].join("\n"),
    ),
  );
}

export function beginText(seats: string[]): string {
  const seated = seats.length ? `\n${seats.join("\n")}` : "";
  return `**The Age begins.** Factions are seated. Speak and the Book turns.${seated}`;
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function living(state: CivState, f: Faction): string {
  const names = f.memberIds
    .map((id) => state.participants[id])
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => {
      const tag = p.dead ? "†" : p.bond === "slave" ? "§" : "";
      return `${p.displayName}${tag}`;
    });
  return names.length ? clip(names.join(", "), 200) : "_empty_";
}

function header(state: CivState): string {
  if (state.phase === "factions") return "Faction talk - Age not started";
  return `Tick **${state.tick}** · ${bandFor(state.tick)} · ${Object.keys(state.factions).length} factions`;
}

function overviewFields(
  state: CivState,
): { name: string; value: string; inline: boolean }[] {
  const facs = Object.values(state.factions);
  if (!facs.length) {
    return [{ name: "Factions", value: "_none yet_", inline: false }];
  }
  return facs.slice(0, 12).map((f) => {
    const land = ownedBy(state, f.id);
    const cap = land.find((p) => p.id === f.capital)?.name ?? "-";
    const stats =
      state.phase === "factions"
        ? living(state, f)
        : [
            `food **${f.food}** · mat **${f.material}** · arms **${f.arms}** · faith **${f.faith}**`,
            `pop ${f.pop} · land ${land.length} · power ${power(state, f).toFixed(1)} · unrest ${f.unrest}`,
            `seat ${cap}`,
            living(state, f),
          ].join("\n");
    return {
      name: clip(f.name, 256),
      value: clip(stats, 1024),
      inline: false,
    };
  });
}

function deadValue(state: CivState): string {
  const dead = Object.values(state.participants).filter((p) => p.dead);
  if (!dead.length) return "_nobody yet_";
  return clip(
    dead
      .map((p) => {
        const by = p.killedBy
          ? (state.participants[p.killedBy]?.displayName ?? p.killedBy)
          : "?";
        return `**${p.displayName}** - slain by ${by}`;
      })
      .join("\n"),
    4000,
  );
}

function factsValue(state: CivState): string {
  if (!state.lastLines.length) return "_quiet_";
  return clip(state.lastLines.map((l) => `• ${l}`).join("\n"), 4000);
}

function factionDetail(
  state: CivState,
  f: Faction,
): { name: string; value: string } {
  const land = ownedBy(state, f.id);
  const names = land.map((p) =>
    p.id === f.capital ? `**${p.name}**` : p.name,
  );
  return {
    name: clip(f.name, 256),
    value: clip(
      [
        living(state, f),
        `food **${f.food}** · mat **${f.material}** · arms **${f.arms}** · faith **${f.faith}**`,
        `pop ${f.pop} · unrest ${f.unrest} · power ${power(state, f).toFixed(1)} · wars ${f.marchesWon}`,
        names.length ? names.join(", ") : "_no land_",
      ].join("\n"),
      1024,
    ),
  };
}

function recapBody(
  state: CivState,
  view: BookView = "overview",
  facId?: string,
): string {
  const lobby = state.phase === "factions";
  const title = lobby ? "Factions" : "The Book";
  const foot =
    view === "overview"
      ? "Factions"
      : view === "map"
        ? "Map · * capital"
        : view === "dead"
          ? "Ghosts"
          : "Last tick";

  const pick = facId ? state.factions[facId] : undefined;
  if (pick) {
    const d = factionDetail(state, pick);
    return `## ${title}\n${header(state)}\n\n**${d.name}**\n${d.value}\n\n-# ${foot}`;
  }

  if (view === "map") {
    return `## ${title}\n${header(state)}\n\n-# ${foot}`;
  }
  if (view === "dead") {
    return `## ${title}\n${header(state)}\n\n**Ghosts**\n${deadValue(state)}\n\n-# ${foot}`;
  }
  if (view === "facts") {
    return `## ${title}\n${header(state)}\n\n**Book**\n${factsValue(state)}\n\n-# ${foot}`;
  }

  const facs = overviewFields(state)
    .map((f) => `**${f.name}**\n${f.value}`)
    .join("\n\n");
  const unaff = Object.values(state.participants)
    .filter((p) => !p.factionId && !p.dead)
    .map((p) => p.displayName);
  const dead = deadLine(state);
  const extra = [
    unaff.length ? `**Unaligned**\n${clip(unaff.join(", "), 1024)}` : "",
    dead ? `**Ghosts**\n${clip(dead, 1024)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return clip(
    `## ${title}\n${header(state)}\n\n${facs}${extra ? `\n\n${extra}` : ""}\n\n-# ${foot}`,
    2400,
  );
}

export function recapContainer(
  state: CivState,
  view: BookView = "overview",
  facId?: string,
) {
  const c = container(CIV_COLOR).addTextDisplayComponents(
    text(recapBody(state, view, facId)),
  );
  if (view === "map" && !facId) {
    c.addMediaGalleryComponents(gallery("attachment://map.png"));
  }
  return c;
}

export function recapComponents(
  state: CivState,
  view: BookView = "overview",
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...VIEWS.map((v) =>
      new ButtonBuilder()
        .setCustomId(`civ:view:${v.id}`)
        .setLabel(v.label)
        .setStyle(v.id === view ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
  const facs = Object.values(state.factions).slice(0, 25);
  if (!facs.length) return [buttons];
  const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("civ:fac")
      .setPlaceholder("Open a faction")
      .addOptions(
        facs.map((f) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(clip(f.name, 100))
            .setValue(f.id)
            .setDescription(
              clip(
                state.phase === "factions"
                  ? living(state, f)
                  : `arms ${f.arms} · food ${f.food} · land ${ownedBy(state, f.id).length}`,
                100,
              ),
            ),
        ),
      ),
  );
  return [buttons, menu];
}

export function recapPayload(
  state: CivState,
  view: BookView = "overview",
  facId?: string,
  narration?: string,
) {
  const components = [
    ...(narration ? [text(clip(narration, 1500))] : []),
    recapContainer(state, view, facId),
    ...recapComponents(state, facId ? "overview" : view),
  ];
  return { components, flags: V2 };
}

export async function handleCivBook(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.guildId) return;
  const state = getActiveCiv(interaction.guildId);
  if (!state) {
    await interaction.reply({
      content: "No Age.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.channelId !== state.channelId) {
    await interaction.reply({
      content: "Wrong channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let view: BookView = "overview";
  let facId: string | undefined;
  if (interaction.isButton()) {
    const v = interaction.customId.slice("civ:view:".length) as BookView;
    if (VIEWS.some((x) => x.id === v)) view = v;
  } else {
    facId = interaction.values[0];
  }

  if (view === "map") {
    const buf = await renderCivMap(state);
    await interaction.reply({
      components: [recapContainer(state, "map")],
      files: [{ attachment: buf, name: "map.png" }],
      flags: V2_EPHEMERAL,
    });
    return;
  }

  await interaction.update(recapPayload(state, view, facId));
}

export function abortContainer() {
  return container(CIV_ABORT_COLOR).addTextDisplayComponents(
    text("## Age aborted\nNobody won. The Book is shut."),
  );
}

export function judgementContainer(state: CivState) {
  const a = state.awards;
  const fields = [
    ["Winner", labelFaction(state, a?.chosen)],
    ["Most land", labelFaction(state, a?.hegemon)],
    ["Most faith", labelFaction(state, a?.priest)],
    ["Most battles", labelFaction(state, a?.warmonger)],
    [
      "Biggest family",
      a?.kinRight
        ? (state.participants[a.kinRight]?.displayName ?? a.kinRight)
        : "-",
    ],
    ["First to fall", labelFaction(state, a?.fallen)],
  ];
  const people = playerRoll(state).join("\n");
  return container(CIV_COLOR).addTextDisplayComponents(
    text(
      clip(
        [
          "## The Age is over",
          a?.chosen
            ? `**${labelFaction(state, a.chosen)}** won.`
            : "Nobody won.",
          fields.map(([name, value]) => `**${name}:** ${value}`).join("\n"),
          people ? `**People**\n${people}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        4000,
      ),
    ),
  );
}
