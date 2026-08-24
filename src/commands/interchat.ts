import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { InterServerChat } from "../utils/interServerChat.js";
import { container, text, V2_EPHEMERAL } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("interchat")
  .setDescription("Manage interserver chat pools")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Create a new chat pool")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Name for the chat pool")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("join")
      .setDescription("Join this channel to a chat pool")
      .addStringOption((option) =>
        option
          .setName("pool")
          .setDescription("Name or ID of the pool to join")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("leave")
      .setDescription("Disconnect this channel from its chat pool"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List all available chat pools"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("info")
      .setDescription("Show information about a pool")
      .addStringOption((option) =>
        option
          .setName("pool")
          .setDescription("Name or ID of the pool")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("rename")
      .setDescription("Rename a chat pool")
      .addStringOption((option) =>
        option
          .setName("pool")
          .setDescription("Name or ID of the pool to rename")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("newname")
          .setDescription("New name for the pool")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a chat pool")
      .addStringOption((option) =>
        option
          .setName("pool")
          .setDescription("Name or ID of the pool to delete")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Check this channel's connection status"),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: "This command can only be used in a server channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Interserver chat only supports text channels.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "create") {
    const name = interaction.options.getString("name", true);

    const existing = InterServerChat.getPoolByName(name);
    if (existing) {
      await interaction.reply({
        content: `❌ A pool named "**${name}**" already exists.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const poolId = InterServerChat.createPool(name);

    await interaction.reply({
      components: [
        container("#00FF00").addTextDisplayComponents(
          text(
            `## ✅ Chat Pool Created\nPool "**${name}**" has been created!\n\n**Pool ID:** \`${poolId}\`\n\nUse \`/interchat join pool:${name}\` in other channels to connect them to this pool.`,
          ),
        ),
      ],
      flags: V2_EPHEMERAL,
    });
  } else if (subcommand === "join") {
    const poolIdentifier = interaction.options.getString("pool", true);

    let pool = InterServerChat.getPoolByName(poolIdentifier);
    if (!pool) {
      pool = InterServerChat.getPool(poolIdentifier);
    }

    if (!pool) {
      await interaction.reply({
        content: `❌ Pool "**${poolIdentifier}**" not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const success = InterServerChat.addChannelToPool(
      pool.id,
      interaction.channelId,
      interaction.guildId!,
    );

    if (success) {
      await interaction.reply({
        components: [
          container("#00FF00").addTextDisplayComponents(
            text(
              `## ✅ Joined Chat Pool\nThis channel has been added to pool "**${pool.name}**".\n\nMessages sent here will now be relayed to **${pool.channels.length} other channel(s)** in the pool.`,
            ),
          ),
        ],
        flags: V2_EPHEMERAL,
      });
    } else {
      await interaction.reply({
        content:
          "❌ Failed to join pool. This channel might already be in a pool.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (subcommand === "leave") {
    const pool = InterServerChat.getPoolByChannel(interaction.channelId);

    if (!pool) {
      await interaction.reply({
        content: "❌ This channel is not in any chat pool.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const success = InterServerChat.removeChannelFromPool(
      pool.id,
      interaction.channelId,
    );

    if (success) {
      await interaction.reply({
        content: `✅ This channel has been disconnected from pool "**${pool.name}**".`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "❌ Failed to disconnect channel from pool.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (subcommand === "list") {
    const pools = InterServerChat.getPools();

    if (pools.length === 0) {
      await interaction.reply({
        content:
          "ℹ️ No chat pools exist yet. Create one with `/interchat create`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      components: [
        container("#0099FF").addTextDisplayComponents(
          text(
            `## 📋 Chat Pools\n${pools
              .map(
                (pool) =>
                  `**${pool.name}**\n` +
                  `├ ID: \`${pool.id}\`\n` +
                  `├ Channels: ${pool.channels.length}\n` +
                  `└ Created: <t:${Math.floor(new Date(pool.createdAt).getTime() / 1000)}:R>`,
              )
              .join("\n\n")}`,
          ),
        ),
      ],
      flags: V2_EPHEMERAL,
    });
  } else if (subcommand === "info") {
    const poolIdentifier = interaction.options.getString("pool", true);

    let pool = InterServerChat.getPoolByName(poolIdentifier);
    if (!pool) {
      pool = InterServerChat.getPool(poolIdentifier);
    }

    if (!pool) {
      await interaction.reply({
        content: `❌ Pool "**${poolIdentifier}**" not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channelList = await Promise.all(
      pool.channels.map(async (ch) => {
        const guild = interaction.client.guilds.cache.get(ch.guildId);
        const guildName = guild?.name || `Unknown Server (${ch.guildId})`;
        const channel = guild?.channels.cache.get(ch.channelId);
        const channelName = channel?.name || `unknown-channel`;
        return `• #${channelName} (${guildName})`;
      }),
    );

    await interaction.reply({
      components: [
        container("#0099FF").addTextDisplayComponents(
          text(
            `## 📊 Pool Info: ${pool.name}\n**Pool ID**\n\`${pool.id}\`\n**Channels**\n${pool.channels.length}\n**Created**\n<t:${Math.floor(new Date(pool.createdAt).getTime() / 1000)}:R>\n**Connected Channels**\n${channelList.join("\n") || "None"}`,
          ),
        ),
      ],
      flags: V2_EPHEMERAL,
    });
  } else if (subcommand === "rename") {
    const poolIdentifier = interaction.options.getString("pool", true);
    const newName = interaction.options.getString("newname", true);

    let pool = InterServerChat.getPoolByName(poolIdentifier);
    if (!pool) {
      pool = InterServerChat.getPool(poolIdentifier);
    }

    if (!pool) {
      await interaction.reply({
        content: `❌ Pool "**${poolIdentifier}**" not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = InterServerChat.getPoolByName(newName);
    if (existing && existing.id !== pool.id) {
      await interaction.reply({
        content: `❌ A pool named "**${newName}**" already exists.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const success = InterServerChat.renamePool(pool.id, newName);

    if (success) {
      await interaction.reply({
        content: `✅ Pool renamed from "**${pool.name}**" to "**${newName}**".`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "❌ Failed to rename pool.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (subcommand === "delete") {
    const poolIdentifier = interaction.options.getString("pool", true);

    let pool = InterServerChat.getPoolByName(poolIdentifier);
    if (!pool) {
      pool = InterServerChat.getPool(poolIdentifier);
    }

    if (!pool) {
      await interaction.reply({
        content: `❌ Pool "**${poolIdentifier}**" not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const success = InterServerChat.deletePool(pool.id);

    if (success) {
      await interaction.reply({
        content: `✅ Pool "**${pool.name}**" has been deleted. All channels have been disconnected.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "❌ Failed to delete pool.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (subcommand === "status") {
    const pool = InterServerChat.getPoolByChannel(interaction.channelId);

    if (!pool) {
      await interaction.reply({
        content:
          "ℹ️ This channel is not connected to any chat pool.\n\n" +
          `Use \`/interchat join\` to join an existing pool, or \`/interchat create\` to create a new one.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const otherChannels = pool.channels.filter(
      (ch) => ch.channelId !== interaction.channelId,
    );

    const channelList = await Promise.all(
      otherChannels.map(async (ch) => {
        const guild = interaction.client.guilds.cache.get(ch.guildId);
        const guildName = guild?.name || `Unknown Server`;
        const channel = guild?.channels.cache.get(ch.channelId);
        const channelName = channel?.name || `unknown-channel`;
        return `• #${channelName} (${guildName})`;
      }),
    );

    await interaction.reply({
      components: [
        container("#00FF00").addTextDisplayComponents(
          text(
            `## ✅ Channel Status\nThis channel is connected to pool "**${pool.name}**".\n\nMessages are being relayed to **${otherChannels.length}** other channel(s):\n\n**Connected Channels**\n${channelList.join("\n") || "None (you're the only channel)"}`,
          ),
        ),
      ],
      flags: V2_EPHEMERAL,
    });
  }
}
