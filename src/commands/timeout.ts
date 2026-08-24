import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { ModerationLogger } from "../utils/moderationLogger.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Impose silence upon the wayward")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The transgressor to be silenced")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("days")
      .setDescription("Days of silence")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(28),
  )
  .addIntegerOption((option) =>
    option
      .setName("hours")
      .setDescription("Hours of silence")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(23),
  )
  .addIntegerOption((option) =>
    option
      .setName("minutes")
      .setDescription("Minutes of silence")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(59),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for silence")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const targetUser = interaction.options.getUser("user")!;
  const days = interaction.options.getInteger("days") ?? 0;
  const hours = interaction.options.getInteger("hours") ?? 0;
  const minutes = interaction.options.getInteger("minutes") ?? 0;

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes;

  const reason =
    interaction.options.getString("reason") || "Violation of sacred Alteruism";

  const targetMember = interaction.guild?.members.cache.get(targetUser.id);
  if (!targetMember) {
    await interaction.reply({
      content: "**THE TRANSGRESSOR HATH ALREADY FLED FROM OUR SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS HOLY COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    if (totalMinutes <= 0) {
      await interaction.reply({
        content:
          "**THOU MUST DECREE A DURATION! Provide at least 1 minute (days/hours/minutes).**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (totalMinutes > 40320) {
      await interaction.reply({
        content:
          "**THE DECREE EXCEEDS THE DIVINE LIMIT!** Maximum silence is **40320 minutes (28 days)**.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await targetMember.timeout(totalMinutes * 60 * 1000, reason);

    const entryId = await ModerationLogger.addEntry({
      type: "timeout",
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: executor.id,
      moderatorTag: executor.user.tag,
      reason: reason,
      guildId: interaction.guild.id,
      duration: totalMinutes,
    });

    const durationParts: string[] = [];
    if (days) durationParts.push(`${days} day${days === 1 ? "" : "s"}`);
    if (hours) durationParts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes)
      durationParts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    const durationDisplay =
      durationParts.join(", ") || `${totalMinutes} minutes`;

    await interaction.reply({
      components: [
        container("#FFD700").addTextDisplayComponents(
          text(
            `## 🤐 DIVINE SILENCE IMPOSED\n**${targetUser} hath been silenced for transgressing against Alteruism!**\n\n**ENFORCER OF SILENCE**\n${executor.user.tag}\n**ACTION ID**\n${entryId}\n**DURATION OF REFLECTION**\n${durationDisplay} (${totalMinutes} minutes)\n**REASON FOR SILENCE**\n${reason}\n**DIVINE WISDOM**\nIn silence, the wayward may find the path to Alteruism`,
          ),
        ),
      ],
      flags: V2,
    });
  } catch (error) {
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE BEEN THWARTED! The transgressor remains beyond reach!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
