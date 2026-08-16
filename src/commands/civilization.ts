import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { llmReady } from "../utils/llmClient.js";
import {
  abortCiv,
  abortEmbed,
  beginAge,
  beginText,
  getActiveCiv,
  isCivOwner,
  judgeCivNow,
  latestAge,
  loadAge,
  openingText,
  pauseCiv,
  recapPayload,
  resumeCiv,
  rulesEmbed,
  runCivTick,
  scheduleCivTick,
  startCiv,
  stopCivTimer,
  tellAge,
} from "../utils/civ/index.js";

export const data = new SlashCommandBuilder()
  .setName("civilization")
  .setDescription("Open an Age. Aphonos watches the chat.")
  .addStringOption((option) =>
    option
      .setName("action")
      .setDescription("What to do")
      .setRequired(false)
      .addChoices(
        { name: "Start", value: "start" },
        { name: "Begin Age", value: "begin" },
        { name: "Pause", value: "pause" },
        { name: "Resume", value: "resume" },
        { name: "Tick", value: "tick" },
        { name: "Status", value: "status" },
        { name: "Recap", value: "recap" },
        { name: "End", value: "end" },
      ),
  )
  .addStringOption((option) =>
    option
      .setName("age")
      .setDescription("Age id to recap (omit for this room's latest)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("emergency")
      .setDescription("Emergency actions")
      .setRequired(false)
      .addChoices({ name: "Abort", value: "abort" }),
  );

async function replyErr(
  interaction: ChatInputCommandInteraction,
  msg: string,
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild || !interaction.channelId) {
    await interaction.reply({
      content: "Guild only.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  const emergency = interaction.options.getString("emergency");
  const action =
    interaction.options.getString("action") ??
    (emergency ? null : getActiveCiv(guildId) ? "status" : "start");

  if (action === "recap") {
    if (!llmReady()) {
      await interaction.reply({
        content: "LLM is not configured.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();
    try {
      const want = interaction.options.getString("age");
      const age =
        (want ? await loadAge(want) : undefined) ??
        getActiveCiv(guildId) ??
        (await latestAge(guildId));
      if (!age) {
        await interaction.editReply({ content: "No Age on file." });
        return;
      }
      const parts = await tellAge(age);
      const tagged = parts.map((p, i) =>
        parts.length > 1 ? `**${i + 1}/${parts.length}**\n${p}` : p,
      );
      await interaction.editReply({ content: tagged[0] });
      for (const p of tagged.slice(1)) {
        await interaction.followUp({ content: p });
      }
    } catch (e) {
      await interaction.editReply({
        content: e instanceof Error ? e.message : "Recap failed.",
      });
    }
    return;
  }

  if (!isCivOwner(interaction.user.id)) {
    await interaction.reply({
      content: "Toru only.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (emergency === "abort") {
    stopCivTimer(guildId);
    const state = await abortCiv(guildId);
    if (!state) {
      await interaction.reply({
        content: "No Age.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({ embeds: [abortEmbed()] });
    return;
  }

  try {
    if (action === "start") {
      if (!llmReady()) throw new Error("LLM is not configured.");
      const state = await startCiv(guildId, interaction.channelId);
      const payload = recapPayload(state);
      await interaction.reply({
        content: openingText(),
        embeds: [rulesEmbed(), ...(payload.embeds ?? [])],
        components: payload.components,
      });
      scheduleCivTick(interaction.client, guildId);
      return;
    }

    const state = getActiveCiv(guildId);
    if (!state) {
      await interaction.reply({
        content: "No Age. Start one.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "begin") {
      const seats = await beginAge(state);
      await interaction.reply({
        content: beginText(seats),
        ...recapPayload(state),
      });
      scheduleCivTick(interaction.client, guildId);
      return;
    }

    if (action === "pause") {
      await pauseCiv(state);
      stopCivTimer(guildId);
      await interaction.reply({ content: "Holding." });
      return;
    }

    if (action === "resume") {
      const next = await resumeCiv(state);
      scheduleCivTick(interaction.client, guildId);
      await interaction.reply({
        content: next === "factions" ? "Talk continues." : "The Age moves.",
      });
      return;
    }

    if (action === "status") {
      await interaction.reply(recapPayload(state));
      return;
    }

    if (action === "tick") {
      await interaction.reply({ content: "Turning the Book…" });
      await runCivTick(interaction.client, guildId, true);
      return;
    }

    if (action === "end") {
      if (state.phase === "factions") {
        await interaction.reply({
          content: "Begin the Age first, or abort.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({ content: "Judgement." });
      await judgeCivNow(interaction.client, guildId);
      return;
    }
  } catch (e) {
    await replyErr(
      interaction,
      e instanceof Error ? e.message : "Age failed.",
    );
  }
}
