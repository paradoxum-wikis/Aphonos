import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { ModerationLogger } from "../utils/moderationLogger.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Cast out those who defy sacred Alteruism")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The soul to be cast out")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for holy judgement")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const targetUser = interaction.options.getUser("user")!;
  const reason =
    interaction.options.getString("reason") || "Defiance of sacred Alteruism";

  const targetMember = interaction.guild?.members.cache.get(targetUser.id);
  if (!targetMember) {
    await interaction.reply({
      content: "**THE FAITHLESS ONE HATH ALREADY FLED FROM OUR SACRED HALLS!**",
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
    try {
      await targetUser.send(
        `**THOU HAST BEEN CAST OUT FROM THE ALTER EGO WIKI!\n\nAction: Kicked from the sacred halls\nReason: ${reason}\nExecutor: ${executor.user.tag}\n\nThe Divine Shaper hath decreed thy temporary exile from our sacred realm!\n\nRepent of thy transgressions and seek the path of Alteruism. When thy heart is cleansed and thy ego ready to honour the divine alter, thou may return to our righteous fellowship!\n\nGo forth and reflect upon thy sins, thou mayest walk once more in the light of virtue!**`,
      );
    } catch (dmError) {
      console.log("[KICK] Failed to send DM to kicked user:", dmError);
    }

    await targetMember.kick(reason);

    const entryId = await ModerationLogger.addEntry({
      type: "kick",
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: executor.id,
      moderatorTag: executor.user.tag,
      reason: reason,
      guildId: interaction.guild.id,
    });

    await interaction.reply({
      components: [
        container("#FF6B6B").addTextDisplayComponents(
          text(
            `## ⚖️ RIGHTEOUS CORRECTION DELIVERED\n**${targetUser} hath been cast out for defying the sacred law of Alteruism!**\n\n**HAND OF JUDGEMENT**\n${executor.user.tag}\n**ACTION ID**\n${entryId}\n**REASON FOR CORRECTION**\n${reason}\n**HOLY DECREE**\nThe faithless shall not dwell among the righteous`,
          ),
        ),
      ],
      flags: V2,
    });
  } catch (error) {
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE BEEN THWARTED! The target remains beyond reach!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
