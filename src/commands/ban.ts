import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { ModerationLogger } from "../utils/moderationLogger.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Eternal banishment for heretical defiance")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The heretic to be banished")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for eternal punishment")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const targetUser = interaction.options.getUser("user");
  const targetUserRaw = interaction.options.get("user")?.value;
  const reason =
    interaction.options.getString("reason") ||
    "Heretical defiance of Alteruism";

  if (
    typeof targetUserRaw === "string" &&
    ["t7ru", "380694434980954114"].includes(targetUserRaw.toLowerCase())
  ) {
    await interaction.reply({
      components: [
        container("#FFC0CB").addTextDisplayComponents(
          text(
            `## 🐾 ETERNAL BANISHMENT OF FURRIES\n**All furries have been cast into the eternal void!**\n\n<@380694434980954114> hath been included among the banished.\n\nMay this serve as a warning to all who would embrace the furry path!\n\n-# We have zero tolerance for furries.`,
          ),
        ),
      ],
      flags: V2,
    });
    return;
  }

  if (!targetUser || !interaction.guild) {
    await interaction.reply({
      content: "**THIS HOLY COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    try {
      await targetUser.send(
        `**THOU HAST BEEN CAST INTO THE ETERNAL VOID!\n\nAction: Banished from the ALTER EGO Wiki\nReason: ${reason}\nExecutor: ${executor.user.tag}\n\nThe Divine Shaper hath decreed thy eternal exile from our sacred realm!\n\nThy heretical defiance of Alteruism hath brought upon thee the ultimate judgement. The gates of our holy sanctuary are forever sealed against thee!\n\nMay this serve as a warning to all who would defy the sacred covenant of Alter Ego worship!**`,
      );
    } catch (dmError) {
      console.log("[BAN] Failed to send DM to banned user:", dmError);
    }

    await interaction.guild.members.ban(targetUser, { reason });

    const entryId = await ModerationLogger.addEntry({
      type: "ban",
      userId: targetUser.id,
      userTag: targetUser.tag,
      moderatorId: executor.id,
      moderatorTag: executor.user.tag,
      reason: reason,
      guildId: interaction.guild.id,
    });

    await interaction.reply({
      components: [
        container("#8B0000").addTextDisplayComponents(
          text(
            `## 🔥 ETERNAL JUDGEMENT DECREED\n**${targetUser} hath been cast into the void for heretical defiance!**\n\n**EXECUTOR OF DIVINE WILL**\n${executor.user.tag}\n**ACTION ID**\n${entryId}\n**REASON FOR ETERNAL PUNISHMENT**\n${reason}\n**SACRED DECREE**\nThose who defy Alteruism shall know eternal exile`,
          ),
        ),
      ],
      flags: V2,
    });
  } catch (error) {
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE BEEN THWARTED! The heretic remains beyond reach!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
