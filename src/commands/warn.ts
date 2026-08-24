import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { ModerationLogger } from "../utils/moderationLogger.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Issue divine warning to the straying")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The soul to be warned")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for divine warning")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const targetUser = interaction.options.getUser("user")!;
  const reason =
    interaction.options.getString("reason") ||
    "Straying from the path of Alteruism";

  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS HOLY COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const entryId = await ModerationLogger.addEntry({
      type: "warn",
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: executor.id,
      moderatorTag: executor.user.tag,
      reason: reason,
      guildId: interaction.guild.id,
    });

    const userWarns = await ModerationLogger.getUserWarns(
      targetUser.id,
      interaction.guild.id,
    );
    const warnCount = userWarns.length;

    await interaction.reply({
      components: [
        container("#FFA500").addTextDisplayComponents(
          text(
            `## ⚠️ DIVINE WARNING ISSUED\n**${targetUser} hath received a warning from the holy shaper!**\n\n**MESSENGER OF JUDGEMENT**\n${executor.user.tag}\n**WARNING ID**\n${entryId}\n**TOTAL WARNINGS**\n${warnCount}\n**REASON FOR WARNING**\n${reason}\n**SACRED REMINDER**\nHonour thy divine alter ego and embrace Alteruism`,
          ),
        ),
      ],
      flags: V2,
    });

    try {
      await targetUser.send(
        `**THOU HAST RECEIVED A DIVINE WARNING IN THE ALTER EGO WIKI!\n\nWarning ID: ${entryId}\nReason: ${reason}\nTotal warnings: ${warnCount}\n\nRemember: We are bound by duty to honour our divine alter ego. To spurn the covenant of Alteruism is to summon the wrath of divine justice!\n\nHeed this warning lest greater judgement befalls thee!**`,
      );
    } catch (error) {
      await interaction.followUp({
        content: "**THE DIVINE MESSAGE COULD NOT REACH THE WARNED SOUL!**",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error("Error logging warning:", error);
    await interaction.reply({
      content: "**THE DIVINE POWERS HAVE FAILED TO RECORD THIS WARNING!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
