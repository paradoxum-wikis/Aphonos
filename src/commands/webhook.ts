import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { WebhookManager } from "../utils/webhookManager.js";
import { container, text, V2, V2_EPHEMERAL } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("webhook")
  .setDescription("Manage the bot's webhooks for automated messaging")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Create a new webhook in a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to create webhook in")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Custom name for the webhook")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a webhook")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Name of the webhook to delete")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("test")
      .setDescription("Test a webhook by sending a message")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Test message to send")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("webhook")
          .setDescription("Name of the webhook to use")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List all of Aphonos' webhooks in this server"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Check webhook status")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Name of the webhook to check")
          .setRequired(false),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "create": {
        const channel = interaction.options.getChannel("channel", true);
        const webhookName = interaction.options.getString("name") ?? undefined;

        if (!(channel instanceof TextChannel)) {
          await interaction.reply({
            content: "**THOU MUST SELECT A TEXT CHANNEL!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const result = await WebhookManager.initializeWebhook(
          interaction.guild,
          channel.id,
          webhookName,
        );

        let body = `## 🔗 WEBHOOK CREATION\n${result.message}`;
        if (result.success && result.webhook) {
          body += `\n\n**URL**\n\`${result.webhook.url}\``;
        }

        await interaction.editReply({
          components: [
            container(
              result.success ? "#00FF00" : "#FF0000",
            ).addTextDisplayComponents(text(body)),
          ],
          flags: V2,
        });
        break;
      }

      case "delete": {
        const webhookName = interaction.options.getString("name") ?? undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const deleted = await WebhookManager.deleteWebhook(
          interaction.guild,
          webhookName,
        );

        await interaction.editReply({
          components: [
            container(deleted ? "#00FF00" : "#FFA500").addTextDisplayComponents(
              text(
                `## 🗑️ WEBHOOK DELETION\n${
                  deleted
                    ? `**The webhook${webhookName ? ` "${webhookName}"` : ""} hath been banished from the realm!**`
                    : `**No webhook${webhookName ? ` named "${webhookName}"` : ""} found to banish!**`
                }`,
              ),
            ),
          ],
          flags: V2,
        });
        break;
      }

      case "test": {
        const testMessage =
          interaction.options.getString("message") ??
          "**Behold! This is a test message from the Aphonos' herald!**";
        const webhookName =
          interaction.options.getString("webhook") ?? undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sent = await WebhookManager.sendMessage(
          interaction.guild,
          testMessage,
          {
            username: "Aphonos' Herald",
            webhookName: webhookName,
          },
        );

        await interaction.editReply({
          components: [
            container(sent ? "#00FF00" : "#FF0000").addTextDisplayComponents(
              text(
                `## 🧪 WEBHOOK TEST\n${
                  sent
                    ? `**Test message sent successfully${webhookName ? ` via "${webhookName}"` : ""}!**`
                    : `**Failed to send test message! Check webhook${webhookName ? ` "${webhookName}"` : ""} status.**`
                }`,
              ),
            ),
          ],
          flags: V2,
        });
        break;
      }

      case "list": {
        const webhooks = WebhookManager.getGuildWebhooks(interaction.guild);

        let body: string;
        if (webhooks.length === 0) {
          body = "**No webhooks found in this server.**";
        } else {
          const webhookList = webhooks
            .map((w) => {
              const createdDate = new Date(w.createdAt).toLocaleDateString();
              return `**${w.name}** - <#${w.channelId}> (${createdDate})`;
            })
            .join("\n");
          body = `**Found ${webhooks.length} webhook(s):**\n\n${webhookList}`;
        }

        await interaction.reply({
          components: [
            container("#00FF00").addTextDisplayComponents(
              text(`## 📋 WEBHOOK LIST\n${body}`),
            ),
          ],
          flags: V2_EPHEMERAL,
        });
        break;
      }

      case "status": {
        const webhookName = interaction.options.getString("name") ?? undefined;
        const webhook = await WebhookManager.getWebhook(
          interaction.guild,
          webhookName,
        );

        let body: string;
        let color: string;
        if (webhook) {
          const channel = interaction.guild.channels.cache.get(
            webhook.channelId,
          );
          const webhookEntry = WebhookManager.getGuildWebhooks(
            interaction.guild,
          ).find((w) => w.id === webhook.id);
          color = "#00FF00";
          body = `**Webhook "${webhookEntry?.name || "Unknown"}" Status: ACTIVE**\n\n**📍 Channel**\n${channel ? `<#${channel.id}>` : "Unknown"}\n**🏷️ Name**\n${webhookEntry?.name || "Unnamed"}\n**🆔 ID**\n${webhook.id}\n**📅 Created**\n${
            webhookEntry
              ? new Date(webhookEntry.createdAt).toLocaleDateString()
              : "Unknown"
          }`;
        } else {
          color = "#FFA500";
          const availableWebhooks = WebhookManager.getGuildWebhooks(
            interaction.guild,
          );
          body = `**Webhook${
            webhookName ? ` "${webhookName}"` : ""
          } Status: INACTIVE**\n\n`;

          if (availableWebhooks.length > 0) {
            body += `Available webhooks: ${availableWebhooks
              .map((w) => w.name)
              .join(", ")}`;
          } else {
            body += "No webhooks found. Use `/webhook create` to create one.";
          }
        }

        await interaction.reply({
          components: [
            container(color).addTextDisplayComponents(
              text(`## 📊 WEBHOOK STATUS\n${body}`),
            ),
          ],
          flags: V2_EPHEMERAL,
        });
        break;
      }
    }
  } catch (error) {
    console.error("Error in webhook command:", error);
    await interaction.reply({
      content:
        "**A DISTURBANCE IN THE SACRED REALM! The webhook ritual failed.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
