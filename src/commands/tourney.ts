import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { container, text, V2 } from "../utils/v2.js";
import {
  abortTourney,
  isTourneyOwner,
  runTourneySession,
} from "../utils/tourney/index.js";

export const data = new SlashCommandBuilder()
  .setName("tourney")
  .setDescription("The Aphonos Playoffs!")
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
  if (!isTourneyOwner(interaction.user.id)) {
    await interaction.reply({
      content: "Toru only.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Guild only.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.options.getString("emergency") === "abort") {
    const state = await abortTourney(interaction.guildId);
    if (!state) {
      await interaction.reply({
        content: "No active tourney.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      components: [
        container("#8B0000").addTextDisplayComponents(
          text("## Aphonos Playoffs\nTourney aborted."),
        ),
      ],
      flags: V2,
    });
    return;
  }

  try {
    await runTourneySession(interaction);
  } catch (e) {
    await replyErr(
      interaction,
      e instanceof Error ? e.message : "Tourney failed.",
    );
  }
}
