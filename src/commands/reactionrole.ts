import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  addReactionRoleRule,
  getReactionRoleRules,
  normalizeEmojiInput,
  removeReactionRoleRule,
  type ReactionRoleRule,
} from "../utils/reactionRoleStore.js";
import { container, text, V2, V2_EPHEMERAL } from "../utils/v2.js";

function isSnowflake(s: string): boolean {
  return /^\d{15,25}$/.test(s);
}

function box(title: string, description: string, color: string) {
  return container(color).addTextDisplayComponents(
    text(`## ${title}\n${description}`),
  );
}

export const data = new SlashCommandBuilder()
  .setName("reactionrole")
  .setDescription("Manage reaction roles")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sc) =>
    sc
      .setName("add")
      .setDescription("Add a reaction role rule")
      .addStringOption((o) =>
        o
          .setName("message_id")
          .setDescription("The message ID to watch reactions on")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("emoji")
          .setDescription(
            'Emoji to watch (unicode like "🖋️" or custom emoji mention like "<:name:id>")',
          )
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("role_id")
          .setDescription("Role ID to add/remove")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("channel_id")
          .setDescription(
            "Channel ID containing the message (defaults to current channel)",
          )
          .setRequired(false),
      )
      .addBooleanOption((o) =>
        o
          .setName("remove_on_unreact")
          .setDescription(
            "If true, unreact removes the role (defaults to true)",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("remove")
      .setDescription("Remove a reaction role rule")
      .addStringOption((o) =>
        o
          .setName("message_id")
          .setDescription("The message ID")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("emoji")
          .setDescription("The emoji (same format you used when adding)")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("channel_id")
          .setDescription(
            "Channel ID containing the message (defaults to current channel)",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("list")
      .setDescription("List reaction role rules for this server"),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      components: [
        box(
          "⚠️ REACTION ROLE",
          "This command can only be used in a server.",
          "#FFA500",
        ),
      ],
      flags: V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "list") {
    const rules = getReactionRoleRules({ guildId });

    if (rules.length === 0) {
      await interaction.reply({
        components: [
          box(
            "📋 REACTION ROLE LIST",
            "No reaction role rules are configured for this server.",
            "#FFA500",
          ),
        ],
        flags: V2_EPHEMERAL,
      });
      return;
    }

    const lines = rules.map((r, i) => {
      const removeOnUnreact = r.removeOnUnreact ?? true;
      return [
        `**${i + 1}.**`,
        `channel=\`${r.channelId}\``,
        `message=\`${r.messageId}\``,
        `emoji=\`${r.emoji}\``,
        `role=\`${r.roleId}\``,
        `removeOnUnreact=\`${removeOnUnreact}\``,
      ].join(" ");
    });

    await interaction.reply({
      components: [box("📋 REACTION ROLE LIST", lines.join("\n"), "#00FF00")],
      flags: V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "add") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messageId = interaction.options.getString("message_id", true).trim();
    const rawEmoji = interaction.options.getString("emoji", true);
    const emoji = normalizeEmojiInput(rawEmoji);

    const roleId = interaction.options.getString("role_id", true).trim();
    const channelId =
      interaction.options.getString("channel_id", false)?.trim() ??
      interaction.channelId;

    const removeOnUnreact =
      interaction.options.getBoolean("remove_on_unreact", false) ?? true;

    if (!isSnowflake(messageId)) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE ADD",
            "Invalid `message_id` (expected a numeric Discord snowflake).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }
    if (!isSnowflake(roleId)) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE ADD",
            "Invalid `role_id` (expected a numeric Discord snowflake).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }
    if (!isSnowflake(channelId)) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE ADD",
            "Invalid `channel_id` (expected a numeric Discord snowflake).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }
    if (!emoji || emoji.trim().length === 0) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE ADD",
            "Invalid `emoji` (must not be empty).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }

    // Besteffort that validates the message exists and is accessible.
    try {
      const channel = await interaction.guild?.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) {
        await interaction.editReply({
          components: [
            box(
              "❌ REACTION ROLE ADD",
              "That channel either doesn't exist, isn't accessible, or doesn't support messages.",
              "#FF0000",
            ),
          ],
          flags: V2,
        });
        return;
      }
      await channel.messages.fetch(messageId);
    } catch {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE ADD",
            "I couldn't fetch that message. Check the message ID + channel ID, and ensure I have View Channel + Read Message History.",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }

    const newRule: ReactionRoleRule = {
      guildId,
      channelId,
      messageId,
      emoji,
      roleId,
      removeOnUnreact,
    };

    const added = addReactionRoleRule(newRule);
    if (!added) {
      await interaction.editReply({
        components: [
          box(
            "⚠️ REACTION ROLE ADD",
            "A rule already exists for that guild/channel/message/emoji combo.",
            "#FFA500",
          ),
        ],
        flags: V2,
      });
      return;
    }

    await interaction.editReply({
      components: [
        box(
          "✅ REACTION ROLE ADD",
          [
            "**Saved reaction role rule.**",
            "",
            `guild=\`${guildId}\``,
            `channel=\`${channelId}\``,
            `message=\`${messageId}\``,
            `emoji=\`${emoji}\``,
            `role=\`${roleId}\``,
            `removeOnUnreact=\`${removeOnUnreact}\``,
          ].join("\n"),
          "#00FF00",
        ),
      ],
      flags: V2,
    });
    return;
  }

  if (sub === "remove") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messageId = interaction.options.getString("message_id", true).trim();
    const rawEmoji = interaction.options.getString("emoji", true);
    const emoji = normalizeEmojiInput(rawEmoji);
    const channelId =
      interaction.options.getString("channel_id", false)?.trim() ??
      interaction.channelId;

    if (!isSnowflake(messageId)) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE REMOVE",
            "Invalid `message_id` (expected a numeric Discord snowflake).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }
    if (!isSnowflake(channelId)) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE REMOVE",
            "Invalid `channel_id` (expected a numeric Discord snowflake).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }
    if (!emoji || emoji.trim().length === 0) {
      await interaction.editReply({
        components: [
          box(
            "❌ REACTION ROLE REMOVE",
            "Invalid `emoji` (must not be empty).",
            "#FF0000",
          ),
        ],
        flags: V2,
      });
      return;
    }

    const removed = removeReactionRoleRule({
      guildId,
      channelId,
      messageId,
      emoji,
    });

    if (!removed) {
      await interaction.editReply({
        components: [
          box(
            "⚠️ REACTION ROLE REMOVE",
            "No matching rule found to remove.",
            "#FFA500",
          ),
        ],
        flags: V2,
      });
      return;
    }

    await interaction.editReply({
      components: [
        box(
          "✅ REACTION ROLE REMOVE",
          [
            "**Removed reaction role rule.**",
            "",
            `guild=\`${guildId}\``,
            `channel=\`${channelId}\``,
            `message=\`${messageId}\``,
            `emoji=\`${emoji}\``,
          ].join("\n"),
          "#00FF00",
        ),
      ],
      flags: V2,
    });
    return;
  }

  await interaction.reply({
    components: [box("❌ REACTION ROLE", "Unknown subcommand.", "#FF0000")],
    flags: V2_EPHEMERAL,
  });
}
