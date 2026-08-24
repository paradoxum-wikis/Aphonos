import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { MessageLogger, type PurgedMessage } from "../utils/messageLogger.js";
import { container, text, V2, V2_EPHEMERAL } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("archives")
  .setDescription("View the seraphic archives of purged messages")
  .addStringOption((option) =>
    option
      .setName("actionid")
      .setDescription("The action ID to view purged messages from")
      .setRequired(false),
  );

function pageContainer(
  messages: PurgedMessage[],
  currentPage: number,
  totalPages: number,
  actionId?: string,
) {
  const messagesPerPage = 5;
  const startIndex = currentPage * messagesPerPage;
  const pageMessages = messages.slice(startIndex, startIndex + messagesPerPage);

  const header = actionId
    ? `**Messages from action ${actionId}**\n**Total archived:** ${messages.length}\n**Page ${currentPage + 1} of ${totalPages}**`
    : `**All archived messages for this guild**\n**Total archived:** ${messages.length}\n**Page ${currentPage + 1} of ${totalPages}**`;

  const fields = pageMessages.map((message) => {
    const purgedDate = new Date(message.purgedAt).toLocaleDateString();
    const originalDate = new Date(message.timestamp).toLocaleDateString();

    let content = message.content;
    if (content.length > 100) {
      content = content.substring(0, 100) + "...";
    }

    let attachmentInfo = "";
    if (message.attachments.length > 0) {
      attachmentInfo = `\n**Attachments:** ${message.attachments.length} file(s)`;
    }

    let embedInfo = "";
    if (message.embeds.length > 0) {
      embedInfo = `\n**Embeds:** ${message.embeds.length} embed(s)`;
    }

    return `**📜 Message by ${message.authorTag}**\n**Content:** ${content || "[NO TEXT]"}${attachmentInfo}${embedInfo}\n**Channel:** <#${message.channelId}>\n**Original Date:** ${originalDate}\n**Purged Date:** ${purgedDate}\n**Purged By:** ${message.purgedBy}\n**Action ID:** ${message.purgeActionId}`;
  });

  const c = container("#4169E1").addTextDisplayComponents(
    text(`## 📚 SERAPHIC ARCHIVES OF PURGED MESSAGES\n${header}`),
  );
  for (const f of fields) {
    c.addSeparatorComponents((s) => s).addTextDisplayComponents(text(f));
  }
  c.addSeparatorComponents((s) => s).addTextDisplayComponents(
    text(
      "**SACRED REMINDER**\nThese archives are for moderation purposes only. Please handle with discretion.",
    ),
  );
  return c;
}

function createButtons(
  currentPage: number,
  totalPages: number,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("first")
      .setLabel("⏮️ First")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === 0),
    new ButtonBuilder()
      .setCustomId("previous")
      .setLabel("◀️ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === 0),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("Next ▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === totalPages - 1),
    new ButtonBuilder()
      .setCustomId("last")
      .setLabel("Last ⏭️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === totalPages - 1),
  );
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS HOLY COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const actionId = interaction.options.getString("actionid") ?? undefined;

  try {
    let purgedMessages;

    if (actionId) {
      purgedMessages =
        await MessageLogger.getPurgedMessagesByActionId(actionId);

      if (purgedMessages.length === 0) {
        await interaction.reply({
          content: `**No archived messages found for action ID: ${actionId}**`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    } else {
      purgedMessages = await MessageLogger.getPurgedMessages(
        interaction.guild.id,
      );

      if (purgedMessages.length === 0) {
        await interaction.reply({
          content: "**No archived messages found for this guild**",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    purgedMessages.reverse();

    const messagesPerPage = 5;
    const totalPages = Math.ceil(purgedMessages.length / messagesPerPage);
    let currentPage = 0;

    const response = await interaction.reply({
      components: [
        pageContainer(purgedMessages, currentPage, totalPages, actionId),
        ...(totalPages > 1 ? [createButtons(currentPage, totalPages)] : []),
      ],
      flags: V2_EPHEMERAL,
    });

    if (totalPages > 1) {
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000,
      });

      collector.on("collect", async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: "**Thou cannot control another's archives!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        switch (buttonInteraction.customId) {
          case "first":
            currentPage = 0;
            break;
          case "previous":
            currentPage = Math.max(0, currentPage - 1);
            break;
          case "next":
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            break;
          case "last":
            currentPage = totalPages - 1;
            break;
        }

        await buttonInteraction.update({
          components: [
            pageContainer(purgedMessages, currentPage, totalPages, actionId),
            createButtons(currentPage, totalPages),
          ],
          flags: V2,
        });
      });

      collector.on("end", async () => {
        response
          .edit({
            components: [
              pageContainer(purgedMessages, currentPage, totalPages, actionId),
              createButtons(currentPage, totalPages, true),
            ],
            flags: V2,
          })
          .catch(() => {});
      });
    }
  } catch (error) {
    console.error("Error retrieving archived messages:", error);
    await interaction.reply({
      content: "**THE DIVINE POWERS HAVE FAILED TO ACCESS THE ARCHIVES!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
