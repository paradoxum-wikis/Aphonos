import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { ModerationLogger } from "../utils/moderationLogger.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("removesin")
  .setDescription(
    "Absolve a soul of its recorded transgression and undo the punishment",
  )
  .addStringOption((option) =>
    option
      .setName("entryid")
      .setDescription("The ID of the entry to remove (W1, K1, B1, T1, C1)")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const entryId = interaction.options.getString("entryid")!.toUpperCase();

  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS HOLY COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const entry = await ModerationLogger.getEntryById(entryId);

    if (!entry || entry.mercy) {
      await interaction.reply({
        content: `**Entry ${entryId} could not be found in the records of the damned!**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = await interaction.client.users.fetch(entry.userId);

    let undoResult = "";
    let undoSuccess = true;

    try {
      switch (entry.type) {
        case "timeout":
          const timeoutMember = await interaction.guild.members.fetch(
            entry.userId,
          );
          if (timeoutMember.isCommunicationDisabled()) {
            await timeoutMember.timeout(
              null,
              `Timeout removed by ${executor.user.tag} (Mercy granted for ${entryId})`,
            );
            undoResult = "Timeout lifted";
          } else {
            undoResult = "Timeout already expired";
          }
          break;

        case "ban":
          try {
            const ban = await interaction.guild.bans.fetch(entry.userId);
            if (ban) {
              await interaction.guild.members.unban(
                entry.userId,
                `Ban removed by ${executor.user.tag} (Mercy granted for ${entryId})`,
              );
              undoResult = "Ban lifted";
            }
          } catch (banError) {
            undoResult = "User not currently banned";
          }
          break;

        case "kick":
          undoResult = "Kick cannot be undone (user must rejoin)";
          break;

        case "warn":
          undoResult = "Warning removed from record";
          break;

        case "clear":
          undoResult = "Message purge cannot be undone";
          break;

        default:
          undoResult = "Unknown action type";
          undoSuccess = false;
      }
    } catch (undoError) {
      console.error("Error undoing punishment:", undoError);
      undoResult = "Failed to undo punishment";
      undoSuccess = false;
    }

    const removed = await ModerationLogger.removeEntry(entryId);

    if (!removed) {
      await interaction.reply({
        content: `**Entry ${entryId} could not be removed from the records of the damned!**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      components: [
        container(undoSuccess ? "#00FF00" : "#FFA500").addTextDisplayComponents(
          text(
            `## ✅ DIVINE ABSOLUTION GRANTED\n**Entry ${entryId} hath been pardoned with divine mercy!**\n\n**ORIGINAL TRANSGRESSION**\n${entry.type.toUpperCase()} against ${targetUser}\n**GRANTOR OF MERCY**\n${executor.user.tag}\n**PUNISHMENT STATUS**\n${undoResult}\n**DIVINE DECREE**\nThe sin is pardoned and punishment lifted where possible. Go forth, as you may unleash your alter ego once again!`,
          ),
        ),
      ],
      flags: V2,
    });

    try {
      await targetUser.send(
        `**THOU HAST BEEN GRANTED DIVINE MERCY IN THE ALTER EGO WIKI!\n\nEntry pardoned: ${entryId}\nOriginal transgression: ${entry.type.toUpperCase()}\nReason: ${entry.reason}\nMercy granted by: ${executor.user.tag}\nPunishment status: ${undoResult}\n\nThe Divine Shaper hath shown mercy upon thee! Thy transgression is forgiven and thy punishment lifted!\n\nGo forth and sin no more, that thou may walk the path of Alteruism!**`,
      );
    } catch (error) {
      await interaction.followUp({
        content:
          "**The divine message of mercy could not reach the pardoned soul!**",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error("Error granting mercy:", error);
    await interaction.reply({
      content: "**THE DIVINE POWERS HAVE FAILED TO GRANT ABSOLUTION!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
